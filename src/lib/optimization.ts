import { Product, Vehicle } from '@/types'

type FragilityValue = Product['fragility'] | null | undefined

const FRAGILITY_ORDER: Record<string, number> = {
  baja: 0,
  media: 1,
  alta: 2,
  muy_alta: 3,
}

const FRAGILITY_SUPPORT_FACTOR: Record<string, number> = {
  baja: 2.5,
  media: 1.5,
  alta: 0.8,
  muy_alta: 0.25,
}

const FRAGILITY_DEFAULT_STACK_HEIGHT: Record<string, number> = {
  baja: 4,
  media: 3,
  alta: 2,
  muy_alta: 1,
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

interface PlacedItem extends BinPackingItem {
  position: Position
  rotation: { x: number; y: number; z: number }
  stackLevel: number
  loadAboveWeight: number
  placedDims: { w: number; h: number; d: number }
}

export class BinPacking3D {
  private readonly resolution = 10
  private container: { width: number; height: number; depth: number }
  private items: BinPackingItem[]
  private placedItems: PlacedItem[]
  private maxWeight: number
  private currentWeight: number
  private spaceMap: number[][][]

  constructor(
    containerWidth: number,
    containerHeight: number,
    containerDepth: number,
    maxWeight: number
  ) {
    this.container = { width: containerWidth, height: containerHeight, depth: containerDepth }
    this.items = []
    this.placedItems = []
    this.maxWeight = maxWeight
    this.currentWeight = 0

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
  }

  optimize(): { placedItems: PlacedItem[]; utilization: number } {
    this.items.sort((a, b) => {
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
      utilization: this.calculateUtilization(),
    }
  }

  private tryPlaceItem(item: BinPackingItem): boolean {
    if (this.currentWeight + item.weight > this.maxWeight) {
      return false
    }

    const bestPlacement = this.findBestPlacement(item)
    if (!bestPlacement) return false

    const placedIndex = this.placedItems.length
    const placedItem: PlacedItem = {
      ...item,
      position: bestPlacement.position,
      rotation: bestPlacement.rotation.rotation,
      stackLevel: bestPlacement.stackLevel,
      loadAboveWeight: 0,
      placedDims: {
        w: bestPlacement.rotation.w,
        h: bestPlacement.rotation.h,
        d: bestPlacement.rotation.d,
      },
    }

    this.placedItems.push(placedItem)
    this.currentWeight += item.weight
    this.markSpaceAsOccupied(bestPlacement.grid, placedIndex)

    if (bestPlacement.supporterIds.length > 0) {
      const distributedLoad = item.weight / bestPlacement.supporterIds.length
      for (const supporterId of bestPlacement.supporterIds) {
        const supporter = this.placedItems[supporterId]
        if (supporter) {
          supporter.loadAboveWeight += distributedLoad
        }
      }
    }

    return true
  }

  private findBestPlacement(item: BinPackingItem): PlacementCandidate | null {
    const rotations = this.getRotations(item)
    let best: PlacementCandidate | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const rotation of rotations) {
      const stepsX = Math.floor((this.container.width - rotation.w) / this.resolution) + 1
      const stepsY = Math.floor((this.container.height - rotation.h) / this.resolution) + 1
      const stepsZ = Math.floor((this.container.depth - rotation.d) / this.resolution) + 1

      if (stepsX <= 0 || stepsY <= 0 || stepsZ <= 0) continue

      for (let y = 0; y < stepsY; y++) {
        for (let z = 0; z < stepsZ; z++) {
          for (let x = 0; x < stepsX; x++) {
            const position: Position = {
              x: x * this.resolution,
              y: y * this.resolution,
              z: z * this.resolution,
            }

            const candidate = this.evaluatePlacement(item, position, rotation)
            if (!candidate) continue

            const score = y * 100000 + z * 100 + x
            if (score < bestScore) {
              bestScore = score
              best = candidate
            }
          }
        }
      }
    }

    return best
  }

  private evaluatePlacement(
    item: BinPackingItem,
    position: Position,
    rotation: RotationVariant
  ): PlacementCandidate | null {
    const grid = this.toGridBounds(position, rotation)
    if (!grid) return null

    if (!this.hasSpaceAvailable(grid)) return null

    if (grid.startY === 0) {
      return {
        position,
        rotation,
        grid,
        stackLevel: 1,
        supporterIds: [],
      }
    }

    const supporterIds = new Set<number>()

    for (let x = grid.startX; x < grid.endX; x++) {
      for (let z = grid.startZ; z < grid.endZ; z++) {
        const belowId = this.spaceMap[x]?.[grid.startY - 1]?.[z] ?? -1
        if (belowId < 0) return null
        supporterIds.add(belowId)
      }
    }

    const supporters = Array.from(supporterIds)
    if (supporters.length === 0) return null

    const distributedLoad = item.weight / supporters.length
    let stackLevel = 1

    for (const supporterId of supporters) {
      const supporter = this.placedItems[supporterId]
      if (!supporter) return null

      if (!supporter.product.stackable) return null

      const nextLevel = supporter.stackLevel + 1
      const configuredMax = Number(supporter.product.maxStackHeight ?? 1)
      const maxStackHeight = configuredMax > 1
        ? configuredMax
        : this.getDefaultStackHeightByFragility(supporter.product.fragility)
      if (nextLevel > maxStackHeight) return null

      if (!this.canPlaceByFragility(supporter.product.fragility, item.product.fragility)) return null

      const capacity = supporter.weight * this.getSupportFactor(supporter.product.fragility)
      if (supporter.loadAboveWeight + distributedLoad > capacity) return null

      stackLevel = Math.max(stackLevel, nextLevel)
    }

    return {
      position,
      rotation,
      grid,
      stackLevel,
      supporterIds: supporters,
    }
  }

  private getRotations(item: BinPackingItem): RotationVariant[] {
    const rotations: RotationVariant[] = [
      {
        w: item.width,
        h: item.height,
        d: item.depth,
        rotation: { x: 0, y: 0, z: 0 },
      },
    ]

    if (item.width !== item.depth) {
      rotations.push({
        w: item.depth,
        h: item.height,
        d: item.width,
        rotation: { x: 0, y: 90, z: 0 },
      })
    }

    return rotations
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

  private getSupportFactor(fragility: FragilityValue): number {
    return FRAGILITY_SUPPORT_FACTOR[String(fragility ?? 'media')] ?? FRAGILITY_SUPPORT_FACTOR.media
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

export async function optimizeLoad(
  products: Array<{ product: Product; quantity: number }>,
  vehicle: Vehicle
): Promise<{
  placedItems: Array<{
    product: Product
    quantity: number
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
  }>
  utilization: number
  totalWeight: number
  weightDistribution: { front: number; center: number; rear: number }
  instructions: Array<{
    step: number
    description: string
    productName: string
    position: { x: number; y: number; z: number }
  }>
}> {
  const binPacker = new BinPacking3D(
    vehicle.internalWidth,
    vehicle.internalHeight,
    vehicle.internalLength,
    vehicle.maxWeight
  )

  for (const { product, quantity } of products) {
    for (let i = 0; i < quantity; i++) {
      binPacker.addItem({
        id: `${product.id}-${i}`,
        width: product.width,
        height: product.height,
        depth: product.length,
        weight: product.weight,
        product,
        quantity: 1,
        color: getCategoryColor(product.category),
      })
    }
  }

  const result = binPacker.optimize()

  let frontWeight = 0
  let centerWeight = 0
  let rearWeight = 0
  const containerDepth = Math.max(vehicle.internalLength, 1)

  for (const item of result.placedItems) {
    const relativeZ = item.position.z / containerDepth
    if (relativeZ < 0.33) {
      frontWeight += item.weight
    } else if (relativeZ < 0.66) {
      centerWeight += item.weight
    } else {
      rearWeight += item.weight
    }
  }

  const totalWeight = result.placedItems.reduce((sum, item) => sum + item.weight, 0)
  const weightDistribution = {
    front: totalWeight > 0 ? (frontWeight / totalWeight) * 100 : 0,
    center: totalWeight > 0 ? (centerWeight / totalWeight) * 100 : 0,
    rear: totalWeight > 0 ? (rearWeight / totalWeight) * 100 : 0,
  }

  const instructions = result.placedItems
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
    placedItems: result.placedItems.map(item => ({
      product: item.product,
      quantity: item.quantity,
      position: item.position,
      rotation: item.rotation,
    })),
    utilization: result.utilization,
    totalWeight,
    weightDistribution,
    instructions,
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
  placedItems: Array<{ product: Product; position: { y: number } }>,
  vehicle: Vehicle
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
