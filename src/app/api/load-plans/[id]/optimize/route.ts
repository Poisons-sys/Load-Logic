import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { loadPlans, loadPlanItems, loadingInstructions } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { optimizeLoad } from '@/lib/optimization'
import { requireAuth } from '@/lib/auth-server'

type NullsToUndefined<T> = {
  [K in keyof T]:
    T[K] extends null ? undefined :
    T[K] extends (infer U | null) ? U | undefined :
    T[K]
}

type ManualCubeInput = {
  x?: number
  y?: number
  z?: number
  width?: number
  height?: number
  depth?: number
  rotY?: number
  productId?: string
}

function nullsToUndefined<T extends Record<string, any>>(obj: T): NullsToUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === null ? undefined : v])
  ) as NullsToUndefined<T>
}

function toBool(v: any, def = false) {
  if (v === null || v === undefined) return def
  return Boolean(v)
}

function toNum(v: any, def = 0) {
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
      product: any
    }>
  },
  vehicle: {
    internalWidth: number | null
    internalHeight: number | null
    internalLength: number | null
  }
) {
  const loadItemsByProductId = new Map(
    loadPlan.items
      .filter(item => item.productId && item.product)
      .map(item => [String(item.productId), item] as const)
  )

  const placedItems = manualCubes
    .map((cube) => {
      const productId = String(cube.productId ?? '')
      const loadItem = loadItemsByProductId.get(productId)
      if (!loadItem?.product) return null

      // Visualizador: x=avance, y=alto, z=lateral
      // Algoritmo/API: x=lateral, y=alto, z=avance
      const algoX = toNum(cube.z, 0)
      const algoY = toNum(cube.y, 0)
      const algoZ = toNum(cube.x, 0)
      const rotYDeg = safeRoundDeg(toNum(cube.rotY, 0))

      return {
        product: loadItem.product,
        quantity: 1,
        position: { x: algoX, y: algoY, z: algoZ },
        rotation: { x: 0, y: rotYDeg, z: 0 },
      }
    })
    .filter(Boolean) as Array<{
    product: any
    quantity: number
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
  }>

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

  const instructions = placedItems
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

    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const manualCubes = Array.isArray(body?.manualCubes) ? body.manualCubes as ManualCubeInput[] : []

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

    type ProductsForOptimization = Parameters<typeof optimizeLoad>[0]
    type AlgoProduct = ProductsForOptimization[number]['product']
    type AlgoVehicle = Parameters<typeof optimizeLoad>[1]

    const productsForOptimization: ProductsForOptimization = loadPlan.items
      .filter((item) => item.product !== null)
      .map((item) => {
        const p = item.product!
        const normalized = nullsToUndefined(p)

        const normalizedProduct: AlgoProduct = {
          ...(normalized as any),
          hsCode: (normalized as any).hsCode ?? undefined,
          description: (normalized as any).description ?? '',
          subcategory: (normalized as any).subcategory ?? 'Sin subcategoria',
        }

        return {
          product: normalizedProduct,
          quantity: Number(item.quantity ?? 0),
        }
      })

    const v = loadPlan.vehicle
    const vehicleForOptimization: AlgoVehicle = {
      ...(v as any),
      hasRefrigeration: toBool((v as any).hasRefrigeration, false),
      hasLiftgate: toBool((v as any).hasLiftgate, false),
      hasSideDoor: toBool((v as any).hasSideDoor, false),
      hasRearDoor: toBool((v as any).hasRearDoor, true),
      hasTemperatureControl: toBool((v as any).hasTemperatureControl, false),
      isHazmatAllowed: toBool((v as any).isHazmatAllowed, false),
      hazardousMaterialAuthorized: toBool((v as any).hazardousMaterialAuthorized, false),
      internalLength: toNum((v as any).internalLength, (v as any).internalLength ?? 0),
      internalWidth: toNum((v as any).internalWidth, (v as any).internalWidth ?? 0),
      internalHeight: toNum((v as any).internalHeight, (v as any).internalHeight ?? 0),
      maxWeight: toNum((v as any).maxWeight, (v as any).maxWeight ?? 0),
    }

    const optimizationResult = manualCubes.length > 0
      ? buildOptimizationFromManualCubes(manualCubes, loadPlan, loadPlan.vehicle)
      : await optimizeLoad(productsForOptimization, vehicleForOptimization)

    await db.transaction(async (tx) => {
      await tx.delete(loadingInstructions)
        .where(eq(loadingInstructions.loadPlanId, id))

      const itemByProductId = new Map(
        loadPlan.items.map(item => [item.productId, item] as const)
      )
      const firstPlacementByItemId = new Map<string, {
        position: { x: number; y: number; z: number }
        rotation: { x: number; y: number; z: number }
        loadingOrder: number
      }>()

      for (let i = 0; i < optimizationResult.placedItems.length; i++) {
        const placedItem = optimizationResult.placedItems[i]
        const loadItem = itemByProductId.get(placedItem.product.id)

        if (loadItem?.id && !firstPlacementByItemId.has(loadItem.id)) {
          firstPlacementByItemId.set(loadItem.id, {
            position: placedItem.position,
            rotation: placedItem.rotation,
            loadingOrder: i + 1,
          })
        }

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
