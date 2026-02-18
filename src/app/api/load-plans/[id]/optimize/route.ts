import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { loadPlans, loadPlanItems, loadPlanPlacements, loadingInstructions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { optimizeLoad } from '@/lib/optimization'
import { requireAuth } from '@/lib/auth-server'
import {
  persistOptimizeSchema,
  type ManualCubeInput,
  zodErrorMessage,
} from '@/lib/validation/load-plans'

type NullsToUndefined<T> = {
  [K in keyof T]:
    T[K] extends null ? undefined :
    T[K] extends (infer U | null) ? U | undefined :
    T[K]
}

type OptimizationOutput = Awaited<ReturnType<typeof optimizeLoad>>
type ProductsForOptimization = Parameters<typeof optimizeLoad>[0]
type AlgoProduct = ProductsForOptimization[number]['product']
type AlgoVehicle = Parameters<typeof optimizeLoad>[1]

function nullsToUndefined<T extends Record<string, unknown>>(obj: T): NullsToUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === null ? undefined : v])
  ) as NullsToUndefined<T>
}

function toNum(v: unknown, def = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

function safeRoundDeg(rad: number) {
  const deg = (rad * 180) / Math.PI
  const normalized = ((deg % 360) + 360) % 360
  return Math.round(normalized)
}

function buildOptimizationFromManualCubes(
  manualCubes: ManualCubeInput[],
  loadPlan: {
    items: Array<{
      productId: string | null
      product: Record<string, unknown> | null
    }>
  },
  vehicle: {
    internalWidth: number | null
    internalHeight: number | null
    internalLength: number | null
  }
): OptimizationOutput {
  const loadItemsByProductId = new Map<string, AlgoProduct>()
  for (const item of loadPlan.items) {
    if (!item.productId || !item.product) continue
    const normalized = nullsToUndefined(item.product)
    const normalizedProduct: AlgoProduct = {
      ...(normalized as unknown as AlgoProduct),
      hsCode: normalized.hsCode as string | undefined,
      description: String(normalized.description ?? ''),
      subcategory: String(normalized.subcategory ?? 'Sin subcategoria'),
    }
    loadItemsByProductId.set(String(item.productId), normalizedProduct)
  }

  const placedItems: OptimizationOutput['placedItems'] = manualCubes
    .map((cube) => {
      const product = loadItemsByProductId.get(cube.productId)
      if (!product) return null

      // Visualizador: x=avance, y=alto, z=lateral
      // Algoritmo/API: x=lateral, y=alto, z=avance
      const algoX = toNum(cube.z, 0)
      const algoY = toNum(cube.y, 0)
      const algoZ = toNum(cube.x, 0)
      const rotYDeg = safeRoundDeg(toNum(cube.rotY, 0))

      return {
        product,
        quantity: 1,
        position: { x: algoX, y: algoY, z: algoZ },
        rotation: { x: 0, y: rotYDeg, z: 0 },
      }
    })
    .filter((item): item is OptimizationOutput['placedItems'][number] => Boolean(item))

  if (placedItems.length === 0) {
    throw new Error('No se recibieron cubos manuales validos para guardar')
  }

  const totalWeight = placedItems.reduce((sum, item) => sum + Number(item.product.weight ?? 0), 0)
  const usedVolume = placedItems.reduce(
    (sum, item) =>
      sum +
      Number(item.product.width ?? 0) *
      Number(item.product.height ?? 0) *
      Number(item.product.length ?? 0),
    0
  )
  const containerVolume =
    Number(vehicle.internalWidth ?? 0) *
    Number(vehicle.internalHeight ?? 0) *
    Number(vehicle.internalLength ?? 0)
  const utilization = containerVolume > 0 ? (usedVolume / containerVolume) * 100 : 0

  let frontWeight = 0
  let centerWeight = 0
  let rearWeight = 0
  const length = Math.max(1, Number(vehicle.internalLength ?? 1))

  for (const item of placedItems) {
    const relativeZ = Number(item.position.z ?? 0) / length
    const w = Number(item.product.weight ?? 0)
    if (relativeZ < 0.33) frontWeight += w
    else if (relativeZ < 0.66) centerWeight += w
    else rearWeight += w
  }

  const weightDistribution = {
    front: totalWeight > 0 ? (frontWeight / totalWeight) * 100 : 0,
    center: totalWeight > 0 ? (centerWeight / totalWeight) * 100 : 0,
    rear: totalWeight > 0 ? (rearWeight / totalWeight) * 100 : 0,
  }

  const instructions: OptimizationOutput['instructions'] = placedItems
    .slice()
    .sort((a, b) => {
      if (a.position.y !== b.position.y) return a.position.y - b.position.y
      if (a.position.z !== b.position.z) return a.position.z - b.position.z
      return a.position.x - b.position.x
    })
    .map((item, index) => ({
      step: index + 1,
      description: `Colocar ${item.product.name} en posicion (${item.position.x.toFixed(0)}, ${item.position.y.toFixed(0)}, ${item.position.z.toFixed(0)})`,
      productName: item.product.name,
      position: item.position,
    }))

  return {
    placedItems,
    utilization,
    totalWeight,
    weightDistribution,
    instructions,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const auth = await requireAuth(request)

    const rawBody = await request.json().catch(() => ({}))
    const parsedBody = persistOptimizeSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: zodErrorMessage(parsedBody.error) },
        { status: 400 }
      )
    }

    const manualCubes = parsedBody.data.manualCubes

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
        { error: 'Plan de carga no encontrado o vehiculo no asignado' },
        { status: 404 }
      )
    }

    const productsForOptimization: ProductsForOptimization = []
    for (const item of loadPlan.items) {
      if (!item.product) continue

      const normalized = nullsToUndefined(item.product)
      const normalizedProduct: AlgoProduct = {
        ...(normalized as unknown as AlgoProduct),
        hsCode: normalized.hsCode ?? undefined,
        description: normalized.description ?? '',
        subcategory: normalized.subcategory ?? 'Sin subcategoria',
      }

      productsForOptimization.push({
        product: normalizedProduct,
        quantity: Number(item.quantity ?? 0),
      })
    }

    const normalizedVehicle = nullsToUndefined(loadPlan.vehicle)
    const vehicleForOptimization: AlgoVehicle = {
      ...(normalizedVehicle as AlgoVehicle),
      internalLength: toNum(normalizedVehicle.internalLength, 0),
      internalWidth: toNum(normalizedVehicle.internalWidth, 0),
      internalHeight: toNum(normalizedVehicle.internalHeight, 0),
      maxWeight: toNum(normalizedVehicle.maxWeight, 0),
    }

    const optimizationResult = manualCubes.length > 0
      ? buildOptimizationFromManualCubes(manualCubes, loadPlan, loadPlan.vehicle)
      : await optimizeLoad(productsForOptimization, vehicleForOptimization)

    await db.transaction(async (tx) => {
      await tx.delete(loadPlanPlacements)
        .where(eq(loadPlanPlacements.loadPlanId, id))

      await tx.delete(loadingInstructions)
        .where(eq(loadingInstructions.loadPlanId, id))

      const itemByProductId = new Map<string, (typeof loadPlan.items)[number]>()
      for (const item of loadPlan.items) {
        if (!item.productId) continue
        itemByProductId.set(String(item.productId), item)
      }
      const firstPlacementByItemId = new Map<string, {
        position: { x: number; y: number; z: number }
        rotation: { x: number; y: number; z: number }
        loadingOrder: number
      }>()
      const pieceIndexByProductId = new Map<string, number>()

      for (let i = 0; i < optimizationResult.placedItems.length; i++) {
        const placedItem = optimizationResult.placedItems[i]
        const productId = String(placedItem.product.id)
        const loadItem = itemByProductId.get(productId)

        if (loadItem?.id && !firstPlacementByItemId.has(loadItem.id)) {
          firstPlacementByItemId.set(loadItem.id, {
            position: placedItem.position,
            rotation: placedItem.rotation,
            loadingOrder: i + 1,
          })
        }

        const pieceIndex = (pieceIndexByProductId.get(productId) ?? 0) + 1
        pieceIndexByProductId.set(productId, pieceIndex)

        await tx.insert(loadPlanPlacements)
          .values({
            loadPlanId: id,
            itemId: loadItem?.id ?? null,
            productId,
            pieceIndex,
            positionX: placedItem.position.x,
            positionY: placedItem.position.y,
            positionZ: placedItem.position.z,
            rotationX: placedItem.rotation.x ?? 0,
            rotationY: placedItem.rotation.y ?? 0,
            rotationZ: placedItem.rotation.z ?? 0,
            loadingOrder: i + 1,
          })

        const positionPayload = {
          x: placedItem.position.x,
          y: placedItem.position.y,
          z: placedItem.position.z,
          rotation: placedItem.rotation,
          product: {
            id: placedItem.product.id,
            name: placedItem.product.name,
            category: placedItem.product.category,
            width: placedItem.product.width,
            height: placedItem.product.height,
            length: placedItem.product.length,
            weight: placedItem.product.weight,
          },
        }

        await tx.insert(loadingInstructions)
          .values({
            loadPlanId: id,
            step: i + 1,
            description: `Colocar ${placedItem.product.name} en posicion (${placedItem.position.x.toFixed(0)}, ${placedItem.position.y.toFixed(0)}, ${placedItem.position.z.toFixed(0)})`,
            itemId: loadItem?.id ?? null,
            position: positionPayload,
            orientation: 'horizontal',
          })
      }

      for (const item of loadPlan.items) {
        const first = firstPlacementByItemId.get(item.id)
        await tx.update(loadPlanItems)
          .set({
            positionX: first?.position.x ?? null,
            positionY: first?.position.y ?? null,
            positionZ: first?.position.z ?? null,
            rotationX: first?.rotation.x ?? 0,
            rotationY: first?.rotation.y ?? 0,
            rotationZ: first?.rotation.z ?? 0,
            loadingOrder: first?.loadingOrder ?? null,
          })
          .where(eq(loadPlanItems.id, item.id))
      }

      await tx.update(loadPlans)
        .set({
          status: 'optimizado',
          totalWeight: optimizationResult.totalWeight,
          spaceUtilization: optimizationResult.utilization,
          weightDistribution: optimizationResult.weightDistribution,
          updatedAt: new Date(),
        })
        .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
    })

    const completeLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        items: { with: { product: true } },
        placements: {
          orderBy: (placements, { asc }) => [asc(placements.loadingOrder)],
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
      message: manualCubes.length > 0
        ? 'Layout manual guardado exitosamente'
        : 'Optimizacion completada exitosamente',
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
    console.error('Error en optimizacion:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
