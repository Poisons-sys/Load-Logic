import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { activityLogs, loadPlanItems, loadPlanPlacements, loadPlanVersions, loadPlans, loadingInstructions } from '@/db/schema'
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
      quantity?: number | null
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

  const placedItems = manualCubes
    .map((cube, index) => {
      const product = loadItemsByProductId.get(cube.productId)
      if (!product) return null

      // Visualizador: x=avance, y=alto, z=lateral
      // Algoritmo/API: x=lateral, y=alto, z=avance
      const algoX = toNum(cube.z, 0)
      const algoY = toNum(cube.y, 0)
      const algoZ = toNum(cube.x, 0)
      const rotYDeg = safeRoundDeg(toNum(cube.rotY, 0))

      return {
        instanceId: cube.instanceId ?? `${cube.productId}-${index + 1}`,
        product,
        quantity: 1,
        routeStop: Math.max(1, Number(cube.routeStop ?? 1)),
        stackLevel: 1,
        supporterIds: [] as number[],
        position: { x: algoX, y: algoY, z: algoZ },
        rotation: { x: 0, y: rotYDeg, z: 0 },
      }
    })
    .filter(Boolean) as OptimizationOutput['placedItems']

  if (placedItems.length === 0) {
    throw new Error('No se recibieron cubos manuales validos para guardar')
  }

  const requestedItemsCount = loadPlan.items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)),
    0
  )
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

  let wx = 0
  let wy = 0
  let wz = 0
  for (const item of placedItems) {
    const cx = Number(item.position.x ?? 0) + Number(item.product.width ?? 0) / 2
    const cy = Number(item.position.y ?? 0) + Number(item.product.height ?? 0) / 2
    const cz = Number(item.position.z ?? 0) + Number(item.product.length ?? 0) / 2
    const w = Number(item.product.weight ?? 0)
    wx += cx * w
    wy += cy * w
    wz += cz * w
  }
  const cogX = totalWeight > 0 ? wx / totalWeight : 0
  const cogY = totalWeight > 0 ? wy / totalWeight : 0
  const cogZ = totalWeight > 0 ? wz / totalWeight : 0
  const nX = Number(vehicle.internalWidth ?? 0) > 0 ? cogX / Number(vehicle.internalWidth ?? 1) : 0
  const nY = Number(vehicle.internalHeight ?? 0) > 0 ? cogY / Number(vehicle.internalHeight ?? 1) : 0
  const nZ = Number(vehicle.internalLength ?? 0) > 0 ? cogZ / Number(vehicle.internalLength ?? 1) : 0

  const lateralBalancePct = Math.max(0, (1 - Math.abs(nX - 0.5) * 2) * 100)
  const longitudinalBalancePct = Math.max(0, (1 - Math.abs(nZ - 0.5) * 2) * 100)
  const cogHeightPct = Math.max(0, Math.min(100, nY * 100))
  const tippingRisk = Math.max(
    0,
    Math.min(
      100,
      (100 - lateralBalancePct) * 0.45 + (100 - longitudinalBalancePct) * 0.3 + cogHeightPct * 0.35
    )
  )
  const stabilityScore = Math.max(0, Math.min(100, 100 - tippingRisk))
  const stabilityLevel = stabilityScore >= 70 ? 'stable' : stabilityScore >= 45 ? 'caution' : 'critical'

  const frontLimitKg = Number((vehicle as any).frontAxleMaxWeight ?? 0)
  const rearLimitKg = Number((vehicle as any).rearAxleMaxWeight ?? 0)
  let frontAxle = 0
  let rearAxle = 0
  for (const item of placedItems) {
    const center = Number(item.position.z ?? 0) + Number(item.product.length ?? 0) / 2
    const ratio = length > 0 ? Math.min(1, Math.max(0, center / length)) : 0
    const w = Number(item.product.weight ?? 0)
    rearAxle += w * ratio
    frontAxle += w * (1 - ratio)
  }
  const frontOver = Math.max(0, frontAxle - frontLimitKg)
  const rearOver = Math.max(0, rearAxle - rearLimitKg)

  const heatRes = 40
  const cols = Math.max(1, Math.ceil(Number(vehicle.internalWidth ?? 0) / heatRes))
  const rows = Math.max(1, Math.ceil(Number(vehicle.internalLength ?? 0) / heatRes))
  const heatCells = Array(rows).fill(null).map(() => Array(cols).fill(0))
  for (const item of placedItems) {
    const x1 = Math.max(0, Math.min(cols - 1, Math.floor(Number(item.position.x ?? 0) / heatRes)))
    const x2 = Math.max(
      0,
      Math.min(cols - 1, Math.ceil((Number(item.position.x ?? 0) + Number(item.product.width ?? 0)) / heatRes) - 1)
    )
    const z1 = Math.max(0, Math.min(rows - 1, Math.floor(Number(item.position.z ?? 0) / heatRes)))
    const z2 = Math.max(
      0,
      Math.min(rows - 1, Math.ceil((Number(item.position.z ?? 0) + Number(item.product.length ?? 0)) / heatRes) - 1)
    )
    for (let r = z1; r <= z2; r++) {
      for (let c = x1; c <= x2; c++) {
        heatCells[r][c] += 1
      }
    }
  }
  let freeCells = 0
  let occupiedCells = 0
  for (const row of heatCells) {
    for (const cell of row) {
      if (cell > 0) occupiedCells += 1
      else freeCells += 1
    }
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
      instanceId: String((item as any).instanceId ?? `${item.product.id}-${index + 1}`),
      routeStop: Number((item as any).routeStop ?? 1),
      loadingZone: Number(item.position.z ?? 0) / length < 0.33 ? 'front' : Number(item.position.z ?? 0) / length < 0.66 ? 'center' : 'rear',
      position: item.position,
    }))

  const validations: OptimizationOutput['validations'] = []
  if (placedItems.length < requestedItemsCount) {
    validations.push({
      code: 'NOT_ALL_ITEMS_PLACED',
      severity: 'warning',
      message: `Se acomodaron ${placedItems.length} de ${requestedItemsCount} piezas.`,
    })
  }
  if (frontOver > 0 || rearOver > 0) {
    validations.push({
      code: 'AXLE_OVERLOAD',
      severity: 'critical',
      message: 'La distribucion por ejes excede limites permitidos.',
      details: { frontOverKg: frontOver, rearOverKg: rearOver },
    })
  }
  if (stabilityLevel !== 'stable') {
    validations.push({
      code: 'STABILITY_RISK',
      severity: stabilityLevel === 'critical' ? 'critical' : 'warning',
      message: 'Centro de gravedad requiere revision.',
    })
  }
  if (validations.length === 0) {
    validations.push({
      code: 'PLAN_OK',
      severity: 'info',
      message: 'Plan sin hallazgos criticos de cumplimiento.',
    })
  }

  const utilScore = Math.max(0, Math.min(100, utilization))
  const balanceScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        (Math.abs(weightDistribution.front - 33.33) +
          Math.abs(weightDistribution.center - 33.33) +
          Math.abs(weightDistribution.rear - 33.33)) *
          1.1
    )
  )
  const criticalCount = validations.filter((v) => v.severity === 'critical').length
  const warningCount = validations.filter((v) => v.severity === 'warning').length
  const complianceScore = Math.max(0, Math.min(100, 100 - criticalCount * 25 - warningCount * 8))
  const overallScore =
    utilScore * 0.22 + balanceScore * 0.2 + stabilityScore * 0.26 + 100 * 0.16 + complianceScore * 0.16
  const grade = overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 55 ? 'C' : 'D'

  return {
    placedItems,
    requestedItemsCount: Math.max(requestedItemsCount, placedItems.length),
    placedItemsCount: placedItems.length,
    unplacedItems: [],
    utilization,
    totalWeight,
    weightDistribution,
    axleDistribution: {
      frontKg: frontAxle,
      rearKg: rearAxle,
      frontPct: totalWeight > 0 ? (frontAxle / totalWeight) * 100 : 0,
      rearPct: totalWeight > 0 ? (rearAxle / totalWeight) * 100 : 0,
      profile: String((vehicle as any).type ?? 'dry_van_standard'),
      expectedFrontPctRange: { min: 30, max: 50 },
      frontLimitKg,
      rearLimitKg,
      frontOverKg: frontOver,
      rearOverKg: rearOver,
      isCompliant: frontOver <= 0 && rearOver <= 0,
    },
    centerOfGravity: {
      x: cogX,
      y: cogY,
      z: cogZ,
      normalized: { x: nX, y: nY, z: nZ },
      zone: stabilityLevel === 'stable' ? 'stable' : stabilityLevel === 'caution' ? 'caution' : 'critical',
    },
    stability: {
      score: stabilityScore,
      level: stabilityLevel,
      tippingRisk,
      lateralBalancePct,
      longitudinalBalancePct,
      centerOfGravityHeightPct: cogHeightPct,
    },
    heatmap: {
      resolutionCm: heatRes,
      rows,
      cols,
      cells: heatCells,
      freeCells,
      occupiedCells,
    },
    validations,
    kpis: {
      utilizationScore: utilScore,
      balanceScore,
      stabilityScore,
      sequenceScore: 100,
      complianceScore,
      overallScore,
      grade,
    },
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
    const strategy = parsedBody.data.strategy
    const iterations = parsedBody.data.iterations
    const telemetry = parsedBody.data.telemetry

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
        routeStop: Number((item as any).routeStop ?? 1),
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
      : await optimizeLoad(productsForOptimization, vehicleForOptimization, {
          strategy,
          iterations,
        })

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
      const vehicleLength = Math.max(1, Number(loadPlan.vehicle?.internalLength ?? 1))

      for (let i = 0; i < optimizationResult.placedItems.length; i++) {
        const placedItem = optimizationResult.placedItems[i]
        const instanceId = String((placedItem as any).instanceId ?? `${placedItem.product.id}-${i + 1}`)
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

        const loadingZone =
          Number(placedItem.position.z ?? 0) / vehicleLength < 0.33
            ? 'front'
            : Number(placedItem.position.z ?? 0) / vehicleLength < 0.66
              ? 'center'
              : 'rear'

        await tx.insert(loadPlanPlacements)
          .values({
            loadPlanId: id,
            itemId: loadItem?.id ?? null,
            productId,
            pieceIndex,
            instanceKey: instanceId,
            positionX: placedItem.position.x,
            positionY: placedItem.position.y,
            positionZ: placedItem.position.z,
            rotationX: placedItem.rotation.x ?? 0,
            rotationY: placedItem.rotation.y ?? 0,
            rotationZ: placedItem.rotation.z ?? 0,
            loadingOrder: i + 1,
          })

        const positionPayload = {
          instanceId,
          x: placedItem.position.x,
          y: placedItem.position.y,
          z: placedItem.position.z,
          rotation: placedItem.rotation,
          routeStop: Number((placedItem as any).routeStop ?? 1),
          loadingZone,
          stackLevel: Number((placedItem as any).stackLevel ?? 1),
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
            description: `Colocar ${placedItem.product.name} (parada ${Number((placedItem as any).routeStop ?? 1)}) en posicion (${placedItem.position.x.toFixed(0)}, ${placedItem.position.y.toFixed(0)}, ${placedItem.position.z.toFixed(0)})`,
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

      const nextVersion = Math.max(1, Number((loadPlan as any).layoutVersion ?? 1) + 1)

      await tx.update(loadPlans)
        .set({
          status: 'optimizado',
          totalWeight: optimizationResult.totalWeight,
          spaceUtilization: optimizationResult.utilization,
          weightDistribution: optimizationResult.weightDistribution,
          advancedMetrics: {
            axleDistribution: optimizationResult.axleDistribution,
            centerOfGravity: optimizationResult.centerOfGravity,
            stability: optimizationResult.stability,
            heatmap: optimizationResult.heatmap,
            validations: optimizationResult.validations,
            kpis: optimizationResult.kpis,
            ai: optimizationResult.ai ?? null,
            unplacedItems: optimizationResult.unplacedItems,
            requestedItemsCount: optimizationResult.requestedItemsCount,
            placedItemsCount: optimizationResult.placedItemsCount,
          },
          optimizationScore: optimizationResult.kpis.overallScore,
          layoutVersion: nextVersion,
          updatedAt: new Date(),
        })
        .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))

      await tx.insert(loadPlanVersions).values({
        loadPlanId: id,
        version: nextVersion,
        source: manualCubes.length > 0 ? 'manual' : 'optimize',
        snapshot: {
          placedItems: optimizationResult.placedItems,
          instructions: optimizationResult.instructions,
          metrics: {
            utilization: optimizationResult.utilization,
            totalWeight: optimizationResult.totalWeight,
            weightDistribution: optimizationResult.weightDistribution,
            axleDistribution: optimizationResult.axleDistribution,
            centerOfGravity: optimizationResult.centerOfGravity,
            stability: optimizationResult.stability,
            heatmap: optimizationResult.heatmap,
            validations: optimizationResult.validations,
            kpis: optimizationResult.kpis,
            ai: optimizationResult.ai ?? null,
            unplacedItems: optimizationResult.unplacedItems,
            requestedItemsCount: optimizationResult.requestedItemsCount,
            placedItemsCount: optimizationResult.placedItemsCount,
          },
        },
        createdBy: auth.userId,
      })

      await tx.insert(activityLogs).values({
        userId: auth.userId,
        companyId: auth.companyId,
        action: manualCubes.length > 0 ? 'manual_layout_saved' : 'plan_optimized',
        entityType: 'loadPlan',
        entityId: id,
        details: {
          version: nextVersion,
          utilization: optimizationResult.utilization,
          score: optimizationResult.kpis.overallScore,
          ai: optimizationResult.ai ?? null,
          placedItemsCount: optimizationResult.placedItemsCount,
          requestedItemsCount: optimizationResult.requestedItemsCount,
          manual: manualCubes.length > 0,
          telemetry: telemetry ?? null,
        },
      })
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
        versions: {
          orderBy: (versions, { desc }) => [desc(versions.version)],
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
          placedItemsCount: optimizationResult.placedItemsCount,
          requestedItemsCount: optimizationResult.requestedItemsCount,
          unplacedItemsCount: optimizationResult.unplacedItems.length,
          axleDistribution: optimizationResult.axleDistribution,
          centerOfGravity: optimizationResult.centerOfGravity,
          stability: optimizationResult.stability,
          heatmap: optimizationResult.heatmap,
          validations: optimizationResult.validations,
          kpis: optimizationResult.kpis,
          ai: optimizationResult.ai ?? null,
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
