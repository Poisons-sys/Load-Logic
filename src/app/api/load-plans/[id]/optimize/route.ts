import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { loadPlans, loadPlanItems, loadingInstructions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { optimizeLoad } from '@/lib/optimization'
import { requireAuth } from '@/lib/auth-server'

// ✅ Tip + helper: convierte null -> undefined (runtime + TypeScript)
type NullsToUndefined<T> = {
  [K in keyof T]:
    T[K] extends null ? undefined :
    T[K] extends (infer U | null) ? U | undefined :
    T[K]
}

function nullsToUndefined<T extends Record<string, any>>(obj: T): NullsToUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === null ? undefined : v])
  ) as NullsToUndefined<T>
}

// POST - Ejecutar optimización de estiba
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const auth = await requireAuth(request)

    // Obtener el plan de carga con todos sus datos
    const loadPlan = await db.query.loadPlans.findFirst({
      where: and(
        eq(loadPlans.id, id),
        eq(loadPlans.companyId, auth.companyId)
      ),
      with: {
        vehicle: true,
        items: {
          with: {
            product: true,
          },
        },
      },
    })

    if (!loadPlan || !loadPlan.vehicle) {
      return NextResponse.json(
        { error: 'Plan de carga no encontrado o vehículo no asignado' },
        { status: 404 }
      )
    }

    // ✅ Inferimos exactamente lo que optimizeLoad espera (sin inventar "Product")
    type ProductsForOptimization = Parameters<typeof optimizeLoad>[0]
    type AlgoProduct = ProductsForOptimization[number]['product']

    // Preparar datos para el algoritmo de optimización
    const productsForOptimization: ProductsForOptimization = loadPlan.items
      .filter((item) => item.product !== null)
      .map((item) => {
        const p = item.product!

        // Convertir nulls a undefined
        const normalized = nullsToUndefined(p)

        // ✅ FIX PRINCIPAL: asegura hsCode nunca sea null (para TS y runtime)
        const normalizedProduct: AlgoProduct = {
          ...(normalized as any),
          hsCode: (normalized as any).hsCode ?? undefined,

          // (opcional pero recomendado) si tu algoritmo usa defaults y a veces vienen null
          description: (normalized as any).description ?? '',
          subcategory: (normalized as any).subcategory ?? 'Sin subcategoría',
        }

        return {
          product: normalizedProduct,
          quantity: Number(item.quantity ?? 0),
        }
      })

    // Ejecutar algoritmo de optimización
    const optimizationResult = await optimizeLoad(
      productsForOptimization,
      loadPlan.vehicle
    )

    // Actualizar items con posiciones calculadas
    for (let i = 0; i < optimizationResult.placedItems.length; i++) {
      const placedItem = optimizationResult.placedItems[i]
      const item = loadPlan.items.find(
        (li) => li.productId === placedItem.product.id
      )

      if (item) {
        await db.update(loadPlanItems)
          .set({
            positionX: placedItem.position.x,
            positionY: placedItem.position.y,
            positionZ: placedItem.position.z,
            rotationX: placedItem.rotation.x,
            rotationY: placedItem.rotation.y,
            rotationZ: placedItem.rotation.z,
            loadingOrder: i + 1,
          })
          .where(eq(loadPlanItems.id, item.id))
      }
    }

    // Eliminar instrucciones anteriores
    await db.delete(loadingInstructions)
      .where(eq(loadingInstructions.loadPlanId, id))

    // Crear nuevas instrucciones
    for (const instruction of optimizationResult.instructions) {
      await db.insert(loadingInstructions)
        .values({
          loadPlanId: id,
          step: instruction.step,
          description: instruction.description,
          position: instruction.position,
          orientation: 'horizontal',
        })
    }

    // Actualizar plan de carga con resultados
    const [updatedLoadPlan] = await db.update(loadPlans)
      .set({
        status: 'optimizado',
        totalWeight: optimizationResult.totalWeight,
        spaceUtilization: optimizationResult.utilization,
        weightDistribution: optimizationResult.weightDistribution,
        updatedAt: new Date(),
      })
      .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
      .returning()

    // Obtener el plan completo actualizado
    const completeLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        items: {
          with: {
            product: true,
          },
        },
        instructions: {
          orderBy: (instructions, { asc }) => [asc(instructions.step)],
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Optimización completada exitosamente',
      data: {
        loadPlan: completeLoadPlan,
        optimization: {
          utilization: optimizationResult.utilization,
          totalWeight: optimizationResult.totalWeight,
          weightDistribution: optimizationResult.weightDistribution,
          placedItemsCount: optimizationResult.placedItems.length,
        },
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error en optimización:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
