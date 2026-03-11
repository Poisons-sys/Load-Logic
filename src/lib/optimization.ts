import { Product, Vehicle } from '@/types'

type FragilityValue = Product['fragility'] | null | undefined

const FRAGILITY_ORDER: Record<string, number> = {
  baja: 0,
  media: 1,
  alta: 2,
  muy_alta: 3,
}

const FRAGILITY_DEFAULT_STACK_HEIGHT: Record<string, number> = {
  baja: 4,
  media: 3,
  alta: 2,
  muy_alta: 1,
}

const FRAGILITY_DEFAULT_TOP_LOAD_KG: Record<string, number> = {
  baja: 4000,
  media: 2500,
  alta: 1200,
  muy_alta: 600,
}

type PlacementFailureReason =
  | 'weight_limit'
  | 'no_orientation_allowed'
  | 'container_bounds'
  | 'collision'
  | 'stack_support'
  | 'stack_height'
  | 'fragility'
  | 'top_load'
  | 'no_stack_above'
  | 'no_space'

type ValidationSeverity = 'info' | 'warning' | 'critical'

interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
  productId?: string
  details?: Record<string, unknown>
}

interface HandlingRules {
  allowRotate90: boolean
  noStackAbove: boolean
  floorOnly: boolean
  maxTopLoadKg: number
}

interface BinPackingItem {
  id: string
  width: number
  height: number
  depth: number
  weight: number
  product: Product
  quantity: number
  color: string
  routeStop: number
  handlingRules: HandlingRules
}

interface Position {
  x: number
  y: number
  z: number
}

interface RotationVariant {
  w: number
  h: number
  d: number
  rotation: { x: number; y: number; z: number }
}

interface GridBounds {
  startX: number
  startY: number
  startZ: number
  endX: number
  endY: number
  endZ: number
}

interface PlacementCandidate {
  position: Position
  rotation: RotationVariant
  grid: GridBounds
  stackLevel: number
  supporterIds: number[]
}

type PlacementEvaluation =
  | { ok: true; candidate: PlacementCandidate }
  | { ok: false; reason: PlacementFailureReason }

interface UnplacedItem {
  item: BinPackingItem
  reason: PlacementFailureReason
  rejectionHistogram: Partial<Record<PlacementFailureReason, number>>
}

interface PlacedItem extends BinPackingItem {
  position: Position
  rotation: { x: number; y: number; z: number }
  stackLevel: number
  supporterIds: number[]
  placedDims: { w: number; h: number; d: number }
}

interface PlacementSearchResult {
  best: PlacementCandidate | null
  rejectionHistogram: Partial<Record<PlacementFailureReason, number>>
}

interface OptimizationCoreResult {
  placedItems: PlacedItem[]
  unplacedItems: UnplacedItem[]
  utilization: number
}

interface HeatmapData {
  resolutionCm: number
  rows: number
  cols: number
  cells: number[][]
  freeCells: number
  occupiedCells: number
}

interface CenterOfGravityData {
  x: number
  y: number
  z: number
  normalized: {
    x: number
    y: number
    z: number
  }
  zone: 'stable' | 'caution' | 'critical'
}

interface StabilityData {
  score: number
  level: 'stable' | 'caution' | 'critical'
  tippingRisk: number
  lateralBalancePct: number
  longitudinalBalancePct: number
  centerOfGravityHeightPct: number
}

interface AxleDistributionData {
  frontKg: number
  rearKg: number
  frontPct: number
  rearPct: number
  profile: string
  expectedFrontPctRange: { min: number; max: number }
  frontLimitKg: number
  rearLimitKg: number
  frontOverKg: number
  rearOverKg: number
  isCompliant: boolean
}

interface AxleProfile {
  name: string
  frontPctRange: { min: number; max: number }
}

interface BinPackingSearchTuning {
  routeWeight: number
  layerWeight: number
  lateralWeight: number
  xOrder: 'asc' | 'desc'
  zOrder: 'asc' | 'desc'
  tieBreakerJitter: number
}

const DEFAULT_TUNING: BinPackingSearchTuning = {
  routeWeight: 1,
  layerWeight: 1,
  lateralWeight: 1,
  xOrder: 'asc',
  zOrder: 'asc',
  tieBreakerJitter: 0,
}

interface KpiSummary {
  utilizationScore: number
  balanceScore: number
  stabilityScore: number
  sequenceScore: number
  complianceScore: number
  overallScore: number
  grade: 'A' | 'B' | 'C' | 'D'
}

export interface OptimizeLoadInputItem {
  product: Product
  quantity: number
  routeStop?: number
}

export interface OptimizeLoadOutput {
  placedItems: Array<{
    instanceId: string
    product: Product
    quantity: number
    routeStop: number
    stackLevel: number
    supporterIds: number[]
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
  }>
  requestedItemsCount: number
  placedItemsCount: number
  unplacedItems: Array<{
    instanceId?: string
    product: Product
    routeStop: number
    reason: PlacementFailureReason
    details: string
  }>
  utilization: number
  totalWeight: number
  weightDistribution: { front: number; center: number; rear: number }
  axleDistribution: AxleDistributionData
  centerOfGravity: CenterOfGravityData
  stability: StabilityData
  heatmap: HeatmapData
  validations: ValidationIssue[]
  kpis: KpiSummary
  instructions: Array<{
    step: number
    description: string
    productName: string
    instanceId: string
    routeStop: number
    loadingZone: 'front' | 'center' | 'rear'
    position: { x: number; y: number; z: number }
  }>
  ai?: {
    strategy: 'baseline' | 'intelligent'
    candidatesEvaluated: number
    selectedCandidateIndex: number
    baselineScore: number
    bestScore: number
    baselineCriticalCount: number
    bestCriticalCount: number
    improved: boolean
  }
}

export interface OptimizeLoadOptions {
  strategy?: 'baseline' | 'intelligent'
  iterations?: number
  seed?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function zoneByDepth(centerZ: number, depth: number): 'front' | 'center' | 'rear' {
  const ratio = depth > 0 ? centerZ / depth : 0
  if (ratio < 0.33) return 'front'
  if (ratio < 0.66) return 'center'
  return 'rear'
}

function parseHandlingRules(product: Product): HandlingRules {
  const raw = String(product.specialInstructions ?? '').toUpperCase()
  const noRotate =
    raw.includes('NO_ROTATE') ||
    raw.includes('ORIENTATION_LOCK') ||
    raw.includes('ROTATE_0_ONLY')

  const noStackAbove =
    raw.includes('NO_STACK_ABOVE') ||
    raw.includes('TOP_ONLY') ||
    raw.includes('NO_CARGAR_ENCIMA')

  const floorOnly =
    !Boolean(product.stackable) ||
    raw.includes('FLOOR_ONLY') ||
    raw.includes('PISO_UNICAMENTE')

  const topLoadMatch = raw.match(/MAX[_ ]?TOP[_ ]?LOAD[_ ]?KG\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)/i)
  const topLoadFromText = topLoadMatch ? Number(topLoadMatch[1]) : Number.NaN
  const defaultTopLoad = FRAGILITY_DEFAULT_TOP_LOAD_KG[String(product.fragility ?? 'media')] ?? 2500

  return {
    allowRotate90: !noRotate,
    noStackAbove,
    floorOnly,
    maxTopLoadKg: Number.isFinite(topLoadFromText) ? topLoadFromText : defaultTopLoad,
  }
}

function reasonToDetails(reason: PlacementFailureReason): string {
  switch (reason) {
    case 'weight_limit':
      return 'Excede el limite de peso de la unidad.'
    case 'no_orientation_allowed':
      return 'La orientacion permitida del producto impide encontrar acomodo.'
    case 'container_bounds':
      return 'Las dimensiones no caben en el contenedor.'
    case 'collision':
      return 'No hay espacio libre sin colision para esta pieza.'
    case 'stack_support':
      return 'La pieza requiere soporte valido para apilarse.'
    case 'stack_height':
      return 'Se alcanzo la altura maxima de apilado permitida.'
    case 'fragility':
      return 'La regla de fragilidad impide este apilado.'
    case 'top_load':
      return 'La carga superior excede resistencia de la base.'
    case 'no_stack_above':
      return 'La base no permite productos encima.'
    case 'no_space':
    default:
      return 'No se encontro un hueco valido con las restricciones actuales.'
  }
}

function dominantReason(hist: Partial<Record<PlacementFailureReason, number>>): PlacementFailureReason {
  const entries = Object.entries(hist) as Array<[PlacementFailureReason, number]>
  if (entries.length === 0) return 'no_space'

  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

function orderedIndices(length: number, order: 'asc' | 'desc') {
  const out = Array.from({ length }, (_, i) => i)
  if (order === 'desc') out.reverse()
  return out
}

export class BinPacking3D {
  private readonly resolution = 10
  private container: { width: number; height: number; depth: number }
  private items: BinPackingItem[]
  private placedItems: PlacedItem[]
  private unplacedItems: UnplacedItem[]
  private preferredRotationByProductId: Map<string, number>
  private maxWeight: number
  private currentWeight: number
  private spaceMap: number[][][]
  private topLoadByPlacedIndex: number[]
  private maxRouteStop: number
  private tuning: BinPackingSearchTuning

  constructor(
    containerWidth: number,
    containerHeight: number,
    containerDepth: number,
    maxWeight: number,
    tuning: Partial<BinPackingSearchTuning> = {}
  ) {
    this.container = { width: containerWidth, height: containerHeight, depth: containerDepth }
    this.items = []
    this.placedItems = []
    this.unplacedItems = []
    this.preferredRotationByProductId = new Map()
    this.maxWeight = maxWeight
    this.currentWeight = 0
    this.maxRouteStop = 1
    this.topLoadByPlacedIndex = []
    this.tuning = { ...DEFAULT_TUNING, ...tuning }

    const res = this.resolution
    this.spaceMap = Array(Math.ceil(containerWidth / res))
      .fill(null)
      .map(() =>
        Array(Math.ceil(containerHeight / res))
          .fill(null)
          .map(() => Array(Math.ceil(containerDepth / res)).fill(-1))
      )
  }

  addItem(item: BinPackingItem) {
    this.items.push(item)
    this.maxRouteStop = Math.max(this.maxRouteStop, item.routeStop)
  }

  optimize(): OptimizationCoreResult {
    this.items.sort((a, b) => {
      if (a.routeStop !== b.routeStop) {
        // Load later stops first so early stops stay more accessible.
        return b.routeStop - a.routeStop
      }

      const fragilityDiff = this.getFragilityRank(a.product.fragility) - this.getFragilityRank(b.product.fragility)
      if (fragilityDiff !== 0) return fragilityDiff

      if (a.product.stackable !== b.product.stackable) {
        return a.product.stackable ? -1 : 1
      }

      const volumeA = a.width * a.height * a.depth
      const volumeB = b.width * b.height * b.depth
      if (volumeA !== volumeB) return volumeB - volumeA

      return b.weight - a.weight
    })

    for (const item of this.items) {
      this.tryPlaceItem(item)
    }

    return {
      placedItems: this.placedItems,
      unplacedItems: this.unplacedItems,
      utilization: this.calculateUtilization(),
    }
  }

  private tryPlaceItem(item: BinPackingItem): boolean {
    if (this.currentWeight + item.weight > this.maxWeight) {
      this.unplacedItems.push({
        item,
        reason: 'weight_limit',
        rejectionHistogram: { weight_limit: 1 },
      })
      return false
    }

    const search = this.findBestPlacement(item)
    if (!search.best) {
      const reason = dominantReason(search.rejectionHistogram)
      this.unplacedItems.push({
        item,
        reason,
        rejectionHistogram: search.rejectionHistogram,
      })
      return false
    }

    const placedIndex = this.placedItems.length
    const placedItem: PlacedItem = {
      ...item,
      position: search.best.position,
      rotation: search.best.rotation.rotation,
      stackLevel: search.best.stackLevel,
      supporterIds: search.best.supporterIds,
      placedDims: {
        w: search.best.rotation.w,
        h: search.best.rotation.h,
        d: search.best.rotation.d,
      },
    }

    this.placedItems.push(placedItem)
    this.currentWeight += item.weight
    this.markSpaceAsOccupied(search.best.grid, placedIndex)
    this.topLoadByPlacedIndex[placedIndex] = this.topLoadByPlacedIndex[placedIndex] ?? 0
    this.propagateTopLoadToSupporters(search.best.supporterIds, item.weight)
    if (!this.preferredRotationByProductId.has(item.product.id)) {
      this.preferredRotationByProductId.set(item.product.id, search.best.rotation.rotation.y)
    }

    return true
  }

  private findBestPlacement(item: BinPackingItem): PlacementSearchResult {
    const rotations = this.getRotations(item)
    if (rotations.length === 0) {
      return {
        best: null,
        rejectionHistogram: { no_orientation_allowed: 1 },
      }
    }

    let best: PlacementCandidate | null = null
    let bestScore = Number.POSITIVE_INFINITY
    const rejectionHistogram: Partial<Record<PlacementFailureReason, number>> = {}

    for (const rotation of rotations) {
      const stepsX = Math.floor((this.container.width - rotation.w) / this.resolution) + 1
      const rawStepsY = Math.floor((this.container.height - rotation.h) / this.resolution) + 1
      const stepsY = item.handlingRules.floorOnly ? Math.min(rawStepsY, 1) : rawStepsY
      const stepsZ = Math.floor((this.container.depth - rotation.d) / this.resolution) + 1

      if (stepsX <= 0 || stepsY <= 0 || stepsZ <= 0) {
        rejectionHistogram.container_bounds = (rejectionHistogram.container_bounds ?? 0) + 1
        continue
      }

      const zIndices = orderedIndices(stepsZ, this.tuning.zOrder)
      const xIndices = orderedIndices(stepsX, this.tuning.xOrder)

      for (let y = 0; y < stepsY; y++) {
        for (const z of zIndices) {
          for (const x of xIndices) {
            const position: Position = {
              x: x * this.resolution,
              y: y * this.resolution,
              z: z * this.resolution,
            }

            const evaluation = this.evaluatePlacement(item, position, rotation)
            if (!evaluation.ok) {
              rejectionHistogram[evaluation.reason] = (rejectionHistogram[evaluation.reason] ?? 0) + 1
              continue
            }

            const routePenalty =
              this.routeDepthPenalty(item.routeStop, position.z, rotation.d) * this.tuning.routeWeight
            const layerPenalty = y * 100 * this.tuning.layerWeight
            const xBias = this.tuning.xOrder === 'asc' ? x : stepsX - 1 - x
            const lateralPenalty = xBias * this.tuning.lateralWeight
            const hashed = ((x + 1) * 73856093) ^ ((y + 1) * 19349663) ^ ((z + 1) * 83492791)
            const jitter =
              (Math.abs(hashed % 1000) / 1000) * this.tuning.tieBreakerJitter
            const score = routePenalty * 1_000_000 + layerPenalty * 1_000 + lateralPenalty + jitter
            if (score < bestScore) {
              bestScore = score
              best = evaluation.candidate
              if (bestScore === 0) {
                return { best, rejectionHistogram }
              }
            }
          }
        }
      }
    }

    return { best, rejectionHistogram }
  }

  private routeDepthPenalty(routeStop: number, z: number, depth: number): number {
    const usableDepth = Math.max(this.container.depth - depth, 0)
    if (usableDepth <= 0) return 0

    if (this.maxRouteStop <= 1) {
      return z
    }

    // stop 1 should stay near doors (rear, larger z), later stops toward front.
    const normalizedStop = clamp((routeStop - 1) / (this.maxRouteStop - 1), 0, 1)
    const desiredZ = (1 - normalizedStop) * usableDepth
    return Math.abs(z - desiredZ)
  }

  private evaluatePlacement(
    item: BinPackingItem,
    position: Position,
    rotation: RotationVariant
  ): PlacementEvaluation {
    if (item.handlingRules.floorOnly && position.y > 0) {
      return { ok: false, reason: 'stack_support' }
    }

    const grid = this.toGridBounds(position, rotation)
    if (!grid) return { ok: false, reason: 'container_bounds' }

    if (!this.hasSpaceAvailable(grid)) return { ok: false, reason: 'collision' }

    if (grid.startY === 0) {
      return {
        ok: true,
        candidate: {
          position,
          rotation,
          grid,
          stackLevel: 1,
          supporterIds: [],
        },
      }
    }

    const supporterIds = new Set<number>()

    for (let x = grid.startX; x < grid.endX; x++) {
      for (let z = grid.startZ; z < grid.endZ; z++) {
        const belowId = this.spaceMap[x]?.[grid.startY - 1]?.[z] ?? -1
        if (belowId < 0) return { ok: false, reason: 'stack_support' }
        supporterIds.add(belowId)
      }
    }

    const supporters = Array.from(supporterIds)
    if (supporters.length === 0) return { ok: false, reason: 'stack_support' }

    let stackLevel = 1

    for (const supporterId of supporters) {
      const supporter = this.placedItems[supporterId]
      if (!supporter) return { ok: false, reason: 'stack_support' }

      if (supporter.handlingRules.noStackAbove) return { ok: false, reason: 'no_stack_above' }
      if (!supporter.product.stackable) return { ok: false, reason: 'stack_support' }

      const nextLevel = supporter.stackLevel + 1
      const configuredMax = Number(supporter.product.maxStackHeight ?? 1)
      const maxStackHeight = configuredMax > 1
        ? configuredMax
        : this.getDefaultStackHeightByFragility(supporter.product.fragility)
      if (nextLevel > maxStackHeight) return { ok: false, reason: 'stack_height' }

      if (!this.canPlaceByFragility(supporter.product.fragility, item.product.fragility)) {
        return { ok: false, reason: 'fragility' }
      }

      const projectedTopLoadKg = (this.topLoadByPlacedIndex[supporterId] ?? 0) + item.weight
      if (projectedTopLoadKg > supporter.handlingRules.maxTopLoadKg) {
        return { ok: false, reason: 'top_load' }
      }

      stackLevel = Math.max(stackLevel, nextLevel)
    }

    return {
      ok: true,
      candidate: {
        position,
        rotation,
        grid,
        stackLevel,
        supporterIds: supporters,
      },
    }
  }

  private propagateTopLoadToSupporters(initialSupporters: number[], addedWeight: number) {
    if (addedWeight <= 0 || initialSupporters.length === 0) return

    const visited = new Set<number>()
    const queue = [...initialSupporters]

    while (queue.length > 0) {
      const supporterId = queue.pop()
      if (supporterId === undefined || supporterId < 0 || visited.has(supporterId)) continue
      visited.add(supporterId)

      this.topLoadByPlacedIndex[supporterId] = (this.topLoadByPlacedIndex[supporterId] ?? 0) + addedWeight
      const parentSupporters = this.placedItems[supporterId]?.supporterIds ?? []
      for (const parentId of parentSupporters) queue.push(parentId)
    }
  }

  private getRotations(item: BinPackingItem): RotationVariant[] {
    const allRotations: RotationVariant[] = [
      {
        w: item.width,
        h: item.height,
        d: item.depth,
        rotation: { x: 0, y: 0, z: 0 },
      },
    ]

    if (item.handlingRules.allowRotate90 && item.width !== item.depth) {
      allRotations.push({
        w: item.depth,
        h: item.height,
        d: item.width,
        rotation: { x: 0, y: 90, z: 0 },
      })
    }

    const preferred = this.preferredRotationByProductId.get(item.product.id)
    if (preferred === undefined) return allRotations

    const preferredRotations = allRotations.filter(r => r.rotation.y === preferred)
    return preferredRotations.length > 0 ? preferredRotations : allRotations
  }

  private toGridBounds(position: Position, rotation: RotationVariant): GridBounds | null {
    const res = this.resolution
    const startX = Math.floor(position.x / res)
    const startY = Math.floor(position.y / res)
    const startZ = Math.floor(position.z / res)

    const endX = startX + Math.ceil(rotation.w / res)
    const endY = startY + Math.ceil(rotation.h / res)
    const endZ = startZ + Math.ceil(rotation.d / res)

    if (
      startX < 0 ||
      startY < 0 ||
      startZ < 0 ||
      endX > this.spaceMap.length ||
      endY > this.spaceMap[0].length ||
      endZ > this.spaceMap[0][0].length
    ) {
      return null
    }

    return { startX, startY, startZ, endX, endY, endZ }
  }

  private hasSpaceAvailable(grid: GridBounds): boolean {
    for (let x = grid.startX; x < grid.endX; x++) {
      for (let y = grid.startY; y < grid.endY; y++) {
        for (let z = grid.startZ; z < grid.endZ; z++) {
          if ((this.spaceMap[x]?.[y]?.[z] ?? -1) >= 0) {
            return false
          }
        }
      }
    }
    return true
  }

  private getFragilityRank(fragility: FragilityValue): number {
    return FRAGILITY_ORDER[String(fragility ?? 'media')] ?? FRAGILITY_ORDER.media
  }

  private getDefaultStackHeightByFragility(fragility: FragilityValue): number {
    return FRAGILITY_DEFAULT_STACK_HEIGHT[String(fragility ?? 'media')] ?? FRAGILITY_DEFAULT_STACK_HEIGHT.media
  }

  private canPlaceByFragility(baseFragility: FragilityValue, topFragility: FragilityValue): boolean {
    // No colocar producto mas "duro" sobre otro mas fragil.
    return this.getFragilityRank(topFragility) >= this.getFragilityRank(baseFragility)
  }

  private markSpaceAsOccupied(grid: GridBounds, placedIndex: number) {
    for (let x = grid.startX; x < grid.endX; x++) {
      for (let y = grid.startY; y < grid.endY; y++) {
        for (let z = grid.startZ; z < grid.endZ; z++) {
          this.spaceMap[x][y][z] = placedIndex
        }
      }
    }
  }

  private calculateUtilization(): number {
    const containerVolume = this.container.width * this.container.height * this.container.depth
    const usedVolume = this.placedItems.reduce(
      (sum, item) => sum + item.placedDims.w * item.placedDims.h * item.placedDims.d,
      0
    )

    return containerVolume > 0 ? (usedVolume / containerVolume) * 100 : 0
  }
}

function computeWeightDistribution(placedItems: PlacedItem[], depth: number) {
  let frontWeight = 0
  let centerWeight = 0
  let rearWeight = 0

  for (const item of placedItems) {
    const centerZ = item.position.z + item.placedDims.d / 2
    const zone = zoneByDepth(centerZ, Math.max(depth, 1))
    if (zone === 'front') frontWeight += item.weight
    else if (zone === 'center') centerWeight += item.weight
    else rearWeight += item.weight
  }

  const totalWeight = placedItems.reduce((sum, item) => sum + item.weight, 0)

  return {
    totalWeight,
    weightDistribution: {
      front: totalWeight > 0 ? round2((frontWeight / totalWeight) * 100) : 0,
      center: totalWeight > 0 ? round2((centerWeight / totalWeight) * 100) : 0,
      rear: totalWeight > 0 ? round2((rearWeight / totalWeight) * 100) : 0,
    },
  }
}

function computeCenterOfGravity(
  placedItems: PlacedItem[],
  container: { width: number; height: number; depth: number }
): CenterOfGravityData {
  const totalWeight = placedItems.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight <= 0) {
    return {
      x: 0,
      y: 0,
      z: 0,
      normalized: { x: 0, y: 0, z: 0 },
      zone: 'critical',
    }
  }

  let wx = 0
  let wy = 0
  let wz = 0

  for (const item of placedItems) {
    const centerX = item.position.x + item.placedDims.w / 2
    const centerY = item.position.y + item.placedDims.h / 2
    const centerZ = item.position.z + item.placedDims.d / 2

    wx += centerX * item.weight
    wy += centerY * item.weight
    wz += centerZ * item.weight
  }

  const x = wx / totalWeight
  const y = wy / totalWeight
  const z = wz / totalWeight

  const normalized = {
    x: container.width > 0 ? clamp(x / container.width, 0, 1) : 0,
    y: container.height > 0 ? clamp(y / container.height, 0, 1) : 0,
    z: container.depth > 0 ? clamp(z / container.depth, 0, 1) : 0,
  }

  const lateralOffset = Math.abs(normalized.x - 0.5) * 2
  const longitudinalOffset = Math.abs(normalized.z - 0.5) * 2
  const heightRatio = normalized.y
  const risk = clamp(lateralOffset * 0.45 + longitudinalOffset * 0.3 + heightRatio * 0.35, 0, 1)

  const zone: CenterOfGravityData['zone'] =
    risk < 0.35 ? 'stable' : risk < 0.65 ? 'caution' : 'critical'

  return {
    x: round2(x),
    y: round2(y),
    z: round2(z),
    normalized: {
      x: round2(normalized.x),
      y: round2(normalized.y),
      z: round2(normalized.z),
    },
    zone,
  }
}

function computeStability(centerOfGravity: CenterOfGravityData): StabilityData {
  const lateralBalancePct = round2((1 - Math.abs(centerOfGravity.normalized.x - 0.5) * 2) * 100)
  const longitudinalBalancePct = round2((1 - Math.abs(centerOfGravity.normalized.z - 0.5) * 2) * 100)
  const centerOfGravityHeightPct = round2(centerOfGravity.normalized.y * 100)

  const tippingRisk = clamp(
    (100 - lateralBalancePct) * 0.45 +
      (100 - longitudinalBalancePct) * 0.3 +
      centerOfGravityHeightPct * 0.35,
    0,
    100
  )

  const score = round2(clamp(100 - tippingRisk, 0, 100))
  const level: StabilityData['level'] = score >= 70 ? 'stable' : score >= 45 ? 'caution' : 'critical'

  return {
    score,
    level,
    tippingRisk: round2(tippingRisk),
    lateralBalancePct,
    longitudinalBalancePct,
    centerOfGravityHeightPct,
  }
}

function resolveAxleProfile(vehicle: Vehicle): AxleProfile {
  const type = String(vehicle.type ?? '').toLowerCase()
  const axles = Number(vehicle.axles ?? 2)

  if (type === 'refrigerado') {
    return { name: 'reefer', frontPctRange: { min: 30, max: 50 } }
  }
  if (type === 'plataforma') {
    return { name: 'flatbed', frontPctRange: { min: 25, max: 45 } }
  }
  if (type === 'cisterna') {
    return { name: 'tanker', frontPctRange: { min: 35, max: 55 } }
  }
  if (axles >= 4) {
    return { name: 'multi_axle_heavy', frontPctRange: { min: 28, max: 48 } }
  }
  return { name: 'dry_van_standard', frontPctRange: { min: 30, max: 50 } }
}

function computeAxleDistribution(placedItems: PlacedItem[], vehicle: Vehicle): AxleDistributionData {
  const depth = Math.max(Number(vehicle.internalLength ?? 0), 1)
  const profile = resolveAxleProfile(vehicle)
  let frontKg = 0
  let rearKg = 0

  for (const item of placedItems) {
    const centerZ = item.position.z + item.placedDims.d / 2
    const rearShare = clamp(centerZ / depth, 0, 1)
    const frontShare = 1 - rearShare

    frontKg += item.weight * frontShare
    rearKg += item.weight * rearShare
  }

  const total = frontKg + rearKg
  const frontLimitKg = Number(vehicle.frontAxleMaxWeight ?? 0)
  const rearLimitKg = Number(vehicle.rearAxleMaxWeight ?? 0)

  const frontOverKg = Math.max(0, frontKg - frontLimitKg)
  const rearOverKg = Math.max(0, rearKg - rearLimitKg)

  return {
    frontKg: round2(frontKg),
    rearKg: round2(rearKg),
    frontPct: total > 0 ? round2((frontKg / total) * 100) : 0,
    rearPct: total > 0 ? round2((rearKg / total) * 100) : 0,
    profile: profile.name,
    expectedFrontPctRange: profile.frontPctRange,
    frontLimitKg,
    rearLimitKg,
    frontOverKg: round2(frontOverKg),
    rearOverKg: round2(rearOverKg),
    isCompliant: frontOverKg <= 0 && rearOverKg <= 0,
  }
}

function computeHeatmap(
  placedItems: PlacedItem[],
  container: { width: number; depth: number },
  resolutionCm = 40
): HeatmapData {
  const cols = Math.max(1, Math.ceil(container.width / resolutionCm))
  const rows = Math.max(1, Math.ceil(container.depth / resolutionCm))

  const cells = Array(rows)
    .fill(null)
    .map(() => Array(cols).fill(0))

  for (const item of placedItems) {
    const x1 = clamp(Math.floor(item.position.x / resolutionCm), 0, cols - 1)
    const x2 = clamp(Math.ceil((item.position.x + item.placedDims.w) / resolutionCm) - 1, 0, cols - 1)
    const z1 = clamp(Math.floor(item.position.z / resolutionCm), 0, rows - 1)
    const z2 = clamp(Math.ceil((item.position.z + item.placedDims.d) / resolutionCm) - 1, 0, rows - 1)

    for (let r = z1; r <= z2; r++) {
      for (let c = x1; c <= x2; c++) {
        cells[r][c] += 1
      }
    }
  }

  let freeCells = 0
  let occupiedCells = 0
  for (const row of cells) {
    for (const v of row) {
      if (v > 0) occupiedCells += 1
      else freeCells += 1
    }
  }

  return {
    resolutionCm,
    rows,
    cols,
    cells,
    freeCells,
    occupiedCells,
  }
}

function computeSequenceScore(placedItems: PlacedItem[]): { score: number; violations: number; pairs: number } {
  let pairs = 0
  let violations = 0

  for (let i = 0; i < placedItems.length; i++) {
    for (let j = i + 1; j < placedItems.length; j++) {
      const a = placedItems[i]
      const b = placedItems[j]
      if (a.routeStop === b.routeStop) continue

      pairs += 1

      // Lower stop number should stay closer to doors (rear, larger z).
      if (a.routeStop < b.routeStop) {
        if (a.position.z + 10 < b.position.z) violations += 1
      } else {
        if (b.position.z + 10 < a.position.z) violations += 1
      }
    }
  }

  if (pairs === 0) return { score: 100, violations: 0, pairs: 0 }

  const compliance = clamp(1 - violations / pairs, 0, 1)
  return {
    score: round2(compliance * 100),
    violations,
    pairs,
  }
}

function overlap1D(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd - 0.01 && aEnd > bStart + 0.01
}

function overlapsXZ(a: PlacedItem, b: PlacedItem) {
  const aX1 = a.position.x
  const aX2 = a.position.x + a.placedDims.w
  const aZ1 = a.position.z
  const aZ2 = a.position.z + a.placedDims.d

  const bX1 = b.position.x
  const bX2 = b.position.x + b.placedDims.w
  const bZ1 = b.position.z
  const bZ2 = b.position.z + b.placedDims.d

  return overlap1D(aX1, aX2, bX1, bX2) && overlap1D(aZ1, aZ2, bZ1, bZ2)
}

function settlePlacedItems(placedItems: PlacedItem[]) {
  const sorted = [...placedItems].sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y
    if (a.position.z !== b.position.z) return a.position.z - b.position.z
    return a.position.x - b.position.x
  })

  const settled: PlacedItem[] = []
  const idToSettledIndex = new Map<string, number>()

  for (const item of sorted) {
    let supportTop = 0
    const supporterIndexes: number[] = []

    for (let i = 0; i < settled.length; i++) {
      const base = settled[i]
      if (!overlapsXZ(item, base)) continue
      const top = base.position.y + base.placedDims.h
      if (top > supportTop && top <= item.position.y + 10.01) {
        supportTop = top
      }
    }

    for (let i = 0; i < settled.length; i++) {
      const base = settled[i]
      if (!overlapsXZ(item, base)) continue
      const top = base.position.y + base.placedDims.h
      if (Math.abs(top - supportTop) <= 1.01) {
        const idx = idToSettledIndex.get(base.id)
        if (idx !== undefined) supporterIndexes.push(idx)
      }
    }

    const nextY = supportTop <= item.position.y + 10.01 ? supportTop : item.position.y
    const nextStackLevel =
      supporterIndexes.length === 0
        ? 1
        : Math.max(
            1,
            ...supporterIndexes.map((idx) => {
              const s = settled[idx]
              return (s?.stackLevel ?? 1) + 1
            })
          )

    const next: PlacedItem = {
      ...item,
      position: {
        ...item.position,
        y: round2(nextY),
      },
      supporterIds: supporterIndexes,
      stackLevel: nextStackLevel,
    }

    idToSettledIndex.set(next.id, settled.length)
    settled.push(next)
  }

  return settled
}

function computeKpis(
  utilization: number,
  weightDistribution: { front: number; center: number; rear: number },
  stability: StabilityData,
  sequenceScore: number,
  validations: ValidationIssue[]
): KpiSummary {
  const utilScore = round2(clamp(utilization, 0, 100))

  const ideal = 33.33
  const balanceDelta =
    Math.abs(weightDistribution.front - ideal) +
    Math.abs(weightDistribution.center - ideal) +
    Math.abs(weightDistribution.rear - ideal)
  const balanceScore = round2(clamp(100 - balanceDelta * 1.1, 0, 100))

  const criticalCount = validations.filter((v) => v.severity === 'critical').length
  const warningCount = validations.filter((v) => v.severity === 'warning').length
  const complianceScore = round2(clamp(100 - criticalCount * 25 - warningCount * 8, 0, 100))

  const overallScore = round2(
    utilScore * 0.22 +
      balanceScore * 0.2 +
      stability.score * 0.26 +
      sequenceScore * 0.16 +
      complianceScore * 0.16
  )

  const grade: KpiSummary['grade'] =
    overallScore >= 85 ? 'A' : overallScore >= 70 ? 'B' : overallScore >= 55 ? 'C' : 'D'

  return {
    utilizationScore: utilScore,
    balanceScore,
    stabilityScore: stability.score,
    sequenceScore: round2(sequenceScore),
    complianceScore,
    overallScore,
    grade,
  }
}

function buildValidationIssues(input: {
  requestedItemsCount: number
  placedItemsCount: number
  unplacedItems: UnplacedItem[]
  axleDistribution: AxleDistributionData
  centerOfGravity: CenterOfGravityData
  stability: StabilityData
  weightDistribution: { front: number; center: number; rear: number }
  vehicle: Vehicle
  placedItems: PlacedItem[]
}): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (input.placedItemsCount < input.requestedItemsCount) {
    issues.push({
      code: 'NOT_ALL_ITEMS_PLACED',
      severity: 'warning',
      message: `Se acomodaron ${input.placedItemsCount} de ${input.requestedItemsCount} piezas.`,
      details: {
        unplaced: input.requestedItemsCount - input.placedItemsCount,
      },
    })
  }

  if (!input.axleDistribution.isCompliant) {
    issues.push({
      code: 'AXLE_OVERLOAD',
      severity: 'critical',
      message: 'La distribucion por ejes excede limites permitidos.',
      details: {
        frontOverKg: input.axleDistribution.frontOverKg,
        rearOverKg: input.axleDistribution.rearOverKg,
      },
    })
  }

  if (
    input.axleDistribution.frontPct < input.axleDistribution.expectedFrontPctRange.min ||
    input.axleDistribution.frontPct > input.axleDistribution.expectedFrontPctRange.max
  ) {
    issues.push({
      code: 'AXLE_PROFILE_IMBALANCE',
      severity: 'warning',
      message: `Perfil ${input.axleDistribution.profile}: porcentaje frontal fuera del rango objetivo (${input.axleDistribution.expectedFrontPctRange.min}-${input.axleDistribution.expectedFrontPctRange.max}%).`,
      details: {
        frontPct: input.axleDistribution.frontPct,
        expectedFrontPctRange: input.axleDistribution.expectedFrontPctRange,
      },
    })
  }

  if (input.stability.level !== 'stable') {
    issues.push({
      code: 'STABILITY_RISK',
      severity: input.stability.level === 'critical' ? 'critical' : 'warning',
      message:
        input.stability.level === 'critical'
          ? 'El centro de gravedad es riesgoso para operacion segura.'
          : 'El centro de gravedad requiere revision.',
      details: {
        cog: input.centerOfGravity,
        stability: input.stability,
      },
    })
  }

  if (input.weightDistribution.front < 20 || input.weightDistribution.rear < 20) {
    issues.push({
      code: 'LENGTH_IMBALANCE',
      severity: 'warning',
      message: 'La distribucion longitudinal de peso esta desbalanceada.',
      details: input.weightDistribution,
    })
  }

  const totalWeight = input.placedItems.reduce((sum, item) => sum + item.weight, 0)
  if (totalWeight > Number(input.vehicle.maxWeight ?? 0) * 0.95) {
    issues.push({
      code: 'WEIGHT_NEAR_LIMIT',
      severity: 'warning',
      message: 'El peso total se acerca al limite maximo de la unidad.',
      details: {
        totalWeight,
        maxWeight: Number(input.vehicle.maxWeight ?? 0),
      },
    })
  }

  const tempReqs = new Set(input.placedItems.map((item) => item.product.temperatureReq))
  if (tempReqs.has('congelado') && tempReqs.has('caliente')) {
    issues.push({
      code: 'TEMPERATURE_CONFLICT',
      severity: 'critical',
      message: 'No se recomienda mezclar productos congelados y calientes en la misma unidad.',
    })
  }

  const groupedFailures = new Map<PlacementFailureReason, number>()
  for (const u of input.unplacedItems) {
    groupedFailures.set(u.reason, (groupedFailures.get(u.reason) ?? 0) + 1)
  }

  for (const [reason, count] of groupedFailures.entries()) {
    issues.push({
      code: `UNPLACED_${reason.toUpperCase()}`,
      severity: reason === 'weight_limit' ? 'critical' : 'warning',
      message: `${count} pieza(s) no colocadas por: ${reasonToDetails(reason)}`,
      details: { reason, count },
    })
  }

  if (issues.length === 0) {
    issues.push({
      code: 'PLAN_OK',
      severity: 'info',
      message: 'Plan sin hallazgos criticos de cumplimiento.',
    })
  }

  return issues
}

function buildInstructions(placedItems: PlacedItem[], containerDepth: number): OptimizeLoadOutput['instructions'] {
  const sorted = placedItems
    .slice()
    .sort((a, b) => {
      if (a.routeStop !== b.routeStop) return b.routeStop - a.routeStop
      if (a.position.y !== b.position.y) return a.position.y - b.position.y
      if (a.position.z !== b.position.z) return a.position.z - b.position.z
      return a.position.x - b.position.x
    })

  return sorted.map((item, index) => {
    const centerZ = item.position.z + item.placedDims.d / 2
    const loadingZone = zoneByDepth(centerZ, Math.max(containerDepth, 1))

    return {
      step: index + 1,
      description: `Paso ${index + 1}: cargar ${item.product.name} (parada ${item.routeStop}) en (${item.position.x.toFixed(0)}, ${item.position.y.toFixed(0)}, ${item.position.z.toFixed(0)})`,
      productName: item.product.name,
      instanceId: item.id,
      routeStop: item.routeStop,
      loadingZone,
      position: item.position,
    }
  })
}

function runOptimizationCandidate(
  products: OptimizeLoadInputItem[],
  vehicle: Vehicle,
  tuning: Partial<BinPackingSearchTuning> = {}
): OptimizeLoadOutput {
  const binPacker = new BinPacking3D(
    Number(vehicle.internalWidth ?? 0),
    Number(vehicle.internalHeight ?? 0),
    Number(vehicle.internalLength ?? 0),
    Number(vehicle.maxWeight ?? 0),
    tuning
  )

  let requestedItemsCount = 0
  for (const { product, quantity, routeStop } of products) {
    const normalizedQty = Math.max(0, Number(quantity ?? 0))
    requestedItemsCount += normalizedQty

    for (let i = 0; i < normalizedQty; i++) {
      binPacker.addItem({
        id: `${product.id}-${routeStop ?? 1}-${i}`,
        width: Number(product.width ?? 0),
        height: Number(product.height ?? 0),
        depth: Number(product.length ?? 0),
        weight: Number(product.weight ?? 0),
        product,
        quantity: 1,
        color: getCategoryColor(product.category),
        routeStop: Math.max(1, Number(routeStop ?? 1)),
        handlingRules: parseHandlingRules(product),
      })
    }
  }

  const rawResult = binPacker.optimize()
  const result: OptimizationCoreResult = {
    ...rawResult,
    placedItems: settlePlacedItems(rawResult.placedItems),
  }
  const { totalWeight, weightDistribution } = computeWeightDistribution(
    result.placedItems,
    Number(vehicle.internalLength ?? 0)
  )

  const centerOfGravity = computeCenterOfGravity(result.placedItems, {
    width: Number(vehicle.internalWidth ?? 0),
    height: Number(vehicle.internalHeight ?? 0),
    depth: Number(vehicle.internalLength ?? 0),
  })

  const stability = computeStability(centerOfGravity)
  const axleDistribution = computeAxleDistribution(result.placedItems, vehicle)
  const heatmap = computeHeatmap(result.placedItems, {
    width: Number(vehicle.internalWidth ?? 0),
    depth: Number(vehicle.internalLength ?? 0),
  })

  const sequence = computeSequenceScore(result.placedItems)

  const validations = buildValidationIssues({
    requestedItemsCount,
    placedItemsCount: result.placedItems.length,
    unplacedItems: result.unplacedItems,
    axleDistribution,
    centerOfGravity,
    stability,
    weightDistribution,
    vehicle,
    placedItems: result.placedItems,
  })

  const kpis = computeKpis(
    result.utilization,
    weightDistribution,
    stability,
    sequence.score,
    validations
  )

  const instructions = buildInstructions(result.placedItems, Number(vehicle.internalLength ?? 0))

  return {
    placedItems: result.placedItems.map((item) => ({
      instanceId: item.id,
      product: item.product,
      quantity: item.quantity,
      routeStop: item.routeStop,
      stackLevel: item.stackLevel,
      supporterIds: item.supporterIds,
      position: item.position,
      rotation: item.rotation,
    })),
    requestedItemsCount,
    placedItemsCount: result.placedItems.length,
    unplacedItems: result.unplacedItems.map((entry) => ({
      instanceId: entry.item.id,
      product: entry.item.product,
      routeStop: entry.item.routeStop,
      reason: entry.reason,
      details: reasonToDetails(entry.reason),
    })),
    utilization: round2(result.utilization),
    totalWeight: round2(totalWeight),
    weightDistribution,
    axleDistribution,
    centerOfGravity,
    stability,
    heatmap,
    validations,
    kpis,
    instructions,
  }
}

function createDeterministicRng(seedInput: number) {
  let seed = Math.floor(seedInput) % 2147483647
  if (seed <= 0) seed += 2147483646
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

function countCriticalIssues(validations: OptimizeLoadOutput['validations']) {
  return validations.filter((v) => v.severity === 'critical').length
}

function isBetterCandidate(next: OptimizeLoadOutput, current: OptimizeLoadOutput) {
  const nextCritical = countCriticalIssues(next.validations)
  const currentCritical = countCriticalIssues(current.validations)
  if (nextCritical !== currentCritical) return nextCritical < currentCritical

  if (next.placedItemsCount !== current.placedItemsCount) {
    return next.placedItemsCount > current.placedItemsCount
  }

  if (next.unplacedItems.length !== current.unplacedItems.length) {
    return next.unplacedItems.length < current.unplacedItems.length
  }

  if (next.kpis.overallScore !== current.kpis.overallScore) {
    return next.kpis.overallScore > current.kpis.overallScore
  }

  if (next.utilization !== current.utilization) {
    return next.utilization > current.utilization
  }

  return false
}

function buildTuningVariant(rng: () => number): Partial<BinPackingSearchTuning> {
  const pickOrder = (): 'asc' | 'desc' => (rng() > 0.5 ? 'desc' : 'asc')
  return {
    routeWeight: round2(0.75 + rng() * 0.9), // 0.75..1.65
    layerWeight: round2(0.65 + rng() * 0.9), // 0.65..1.55
    lateralWeight: round2(0.55 + rng() * 1.1), // 0.55..1.65
    xOrder: pickOrder(),
    zOrder: pickOrder(),
    tieBreakerJitter: round2(rng() * 0.25),
  }
}

function resolveIntelligentIterations(products: OptimizeLoadInputItem[], vehicle: Vehicle) {
  let requestedItems = 0
  let totalWeight = 0
  let totalVolume = 0

  for (const entry of products) {
    const qty = Math.max(0, Math.floor(Number(entry.quantity ?? 0)))
    if (qty <= 0) continue

    const itemWeight = Math.max(0, Number(entry.product.weight ?? 0))
    const itemVolume =
      Math.max(0, Number(entry.product.length ?? 0)) *
      Math.max(0, Number(entry.product.width ?? 0)) *
      Math.max(0, Number(entry.product.height ?? 0))

    requestedItems += qty
    totalWeight += itemWeight * qty
    totalVolume += itemVolume * qty
  }

  if (requestedItems <= 0) return 4

  const vehicleVolume =
    Math.max(1, Number(vehicle.internalLength ?? 0)) *
    Math.max(1, Number(vehicle.internalWidth ?? 0)) *
    Math.max(1, Number(vehicle.internalHeight ?? 0))
  const weightRatio = Number(vehicle.maxWeight ?? 0) > 0 ? totalWeight / Number(vehicle.maxWeight) : 0
  const volumeRatio = totalVolume / vehicleVolume
  const avgItemWeight = totalWeight / requestedItems

  const isLargeOptimization =
    requestedItems >= 28 || weightRatio >= 0.58 || volumeRatio >= 0.62 || avgItemWeight >= 350

  return isLargeOptimization ? 4 : 6
}

export async function optimizeLoad(
  products: OptimizeLoadInputItem[],
  vehicle: Vehicle,
  options: OptimizeLoadOptions = {}
): Promise<OptimizeLoadOutput> {
  const strategy = options.strategy ?? 'baseline'
  if (strategy !== 'intelligent') {
    const baseline = runOptimizationCandidate(products, vehicle, DEFAULT_TUNING)
    return {
      ...baseline,
      ai: {
        strategy: 'baseline',
        candidatesEvaluated: 1,
        selectedCandidateIndex: 0,
        baselineScore: baseline.kpis.overallScore,
        bestScore: baseline.kpis.overallScore,
        baselineCriticalCount: countCriticalIssues(baseline.validations),
        bestCriticalCount: countCriticalIssues(baseline.validations),
        improved: false,
      },
    }
  }

  const iterations =
    options.iterations === undefined
      ? resolveIntelligentIterations(products, vehicle)
      : clamp(Math.floor(options.iterations), 2, 40)
  const rng = createDeterministicRng(Number(options.seed ?? 20260218))

  const baseline = runOptimizationCandidate(products, vehicle, DEFAULT_TUNING)
  let best = baseline
  let selectedCandidateIndex = 0

  for (let i = 1; i < iterations; i++) {
    const tuning = buildTuningVariant(rng)
    const candidate = runOptimizationCandidate(products, vehicle, tuning)
    if (isBetterCandidate(candidate, best)) {
      best = candidate
      selectedCandidateIndex = i
    }
  }

  const baselineCritical = countCriticalIssues(baseline.validations)
  const bestCritical = countCriticalIssues(best.validations)
  const improved =
    selectedCandidateIndex !== 0 &&
    (best.kpis.overallScore > baseline.kpis.overallScore ||
      best.placedItemsCount > baseline.placedItemsCount ||
      bestCritical < baselineCritical)

  return {
    ...best,
    ai: {
      strategy: 'intelligent',
      candidatesEvaluated: iterations,
      selectedCandidateIndex,
      baselineScore: baseline.kpis.overallScore,
      bestScore: best.kpis.overallScore,
      baselineCriticalCount: baselineCritical,
      bestCriticalCount: bestCritical,
      improved,
    },
  }
}

function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    automotriz: '#3B82F6',
    electronica: '#8B5CF6',
    maquinaria: '#6366F1',
    medico: '#EC4899',
    energia: '#F59E0B',
    infraestructura: '#6B7280',
    carnicos: '#EF4444',
    lacteos: '#10B981',
    frutas_verduras: '#84CC16',
    procesados: '#F97316',
    congelados: '#06B6D4',
    granos: '#D97706',
    peligrosas: '#DC2626',
    generales: '#9CA3AF',
  }
  return colors[category] || '#9CA3AF'
}

export function validateLoadConstraints(
  placedItems: Array<{ product: Product; position: { y: number } }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (let i = 0; i < placedItems.length; i++) {
    const item = placedItems[i]
    const itemsAbove = placedItems.filter(
      other => other.position.y > item.position.y
    )

    if (itemsAbove.length > item.product.maxStackHeight - 1) {
      errors.push(
        `${item.product.name} tiene demasiados items encima (max: ${item.product.maxStackHeight})`
      )
    }
  }

  const tempReqs = new Set(placedItems.map(item => item.product.temperatureReq))
  if (tempReqs.has('congelado') && tempReqs.has('caliente')) {
    errors.push('No se pueden mezclar productos congelados y calientes')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
