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

// ✅ Para vehículo: null -> boolean/number defaults seguros
function toBool(v: any, def = false) {
  if (v === null || v === undefined) return def
  return Boolean(v)
}
function toNum(v: any, def = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
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

    // ✅ Inferimos tipos EXACTOS esperados por optimizeLoad
    type ProductsForOptimization = Parameters<typeof optimizeLoad>[0]
    type AlgoProduct = ProductsForOptimization[number]['product']
    type AlgoVehicle = Parameters<typeof optimizeLoad>[1]

    // --- Productos (null -> undefined donde aplique)
    const productsForOptimization: ProductsForOptimization = loadPlan.items
      .filter((item) => item.product !== null)
      .map((item) => {
        const p = item.product!
        const normalized = nullsToUndefined(p)

        const normalizedProduct: AlgoProduct = {
          ...(normalized as any),
          hsCode: (normalized as any).hsCode ?? undefined,
          description: (normalized as any).description ?? '',
          subcategory: (normalized as any).subcategory ?? 'Sin subcategoría',
        }

        return {
          product: normalizedProduct,
          quantity: Number(item.quantity ?? 0),
        }
      })

    // --- Vehículo (null -> defaults)
    const v = loadPlan.vehicle
    const vehicleForOptimization: AlgoVehicle = {
      ...(v as any),

      // ✅ Fix principal que te marca Vercel
      hasRefrigeration: toBool((v as any).hasRefrigeration, false),

      // ✅ recomendados: normaliza TODOS los boolean nullable típicos
      hasLiftgate: toBool((v as any).hasLiftgate, false),
      hasSideDoor: toBool((v as any).hasSideDoor, false),
      hasRearDoor: toBool((v as any).hasRearDoor, true),
      hasTemperatureControl: toBool((v as any).hasTemperatureControl, false),
      isHazmatAllowed: toBool((v as any).isHazmatAllowed, false),
      hazardousMaterialAuthorized: toBool((v as any).hazardousMaterialAuthorized, false),

      // ✅ si alguno de estos llega null, también conviene normalizar números
      internalLength: toNum((v as any).internalLength, (v as any).internalLength ?? 0),
      internalWidth: toNum((v as any).internalWidth, (v as any).internalWidth ?? 0),
      internalHeight: toNum((v as any).internalHeight, (v as any).internalHeight ?? 0),
      maxWeight: toNum((v as any).maxWeight, (v as any).maxWeight ?? 0),
    }

    // Ejecutar algoritmo de optimización
    const optimizationResult = await optimizeLoad(
      productsForOptimization,
      vehicleForOptimization
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
    await db.update(loadPlans)
      .set({
        status: 'optimizado',
        totalWeight: optimizationResult.totalWeight,
        spaceUtilization: optimizationResult.utilization,
        weightDistribution: optimizationResult.weightDistribution,
        updatedAt: new Date(),
      })
      .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))

    // Obtener el plan completo actualizado
    const completeLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        items: { with: { product: true } },
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
