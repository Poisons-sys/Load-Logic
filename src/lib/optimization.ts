import { Product, Vehicle, LoadItem, Cube3D, Container3D } from '@/types'

// Algoritmo de Bin Packing 3D para optimización de estiba
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

interface PlacedItem extends BinPackingItem {
  position: Position
  rotation: { x: number; y: number; z: number }
}

// Clase para el algoritmo de Bin Packing 3D
export class BinPacking3D {
  private container: { width: number; height: number; depth: number }
  private items: BinPackingItem[]
  private placedItems: PlacedItem[]
  private maxWeight: number
  private currentWeight: number
  private spaceMap: boolean[][][]

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
    
    // Inicializar mapa de espacio (resolución de 10cm)
    const res = 10
    this.spaceMap = Array(Math.ceil(containerWidth / res))
      .fill(null)
      .map(() =>
        Array(Math.ceil(containerHeight / res))
          .fill(null)
          .map(() => Array(Math.ceil(containerDepth / res)).fill(false))
      )
  }

  addItem(item: BinPackingItem) {
    this.items.push(item)
  }

  // Algoritmo principal de empaquetado
  optimize(): { placedItems: PlacedItem[]; utilization: number } {
    // Ordenar items por volumen (mayor a menor) y fragilidad
    this.items.sort((a, b) => {
      const volumeA = a.width * a.height * a.depth
      const volumeB = b.width * b.height * b.depth
      
      // Priorizar items no frágiles en la base
      if (a.product.fragility !== b.product.fragility) {
        const fragilityOrder = { baja: 0, media: 1, alta: 2, muy_alta: 3 }
        return fragilityOrder[a.product.fragility] - fragilityOrder[b.product.fragility]
      }
      
      return volumeB - volumeA
    })

    for (const item of this.items) {
      this.tryPlaceItem(item)
    }

    const utilization = this.calculateUtilization()
    
    return {
      placedItems: this.placedItems,
      utilization,
    }
  }

  private tryPlaceItem(item: BinPackingItem): boolean {
    if (this.currentWeight + item.weight > this.maxWeight) {
      return false
    }

    // Intentar diferentes rotaciones
    const rotations = this.getRotations(item)
    
    for (const rotation of rotations) {
      const position = this.findBestPosition(rotation)
      
      if (position) {
        const placedItem: PlacedItem = {
          ...item,
          position,
          rotation: this.getRotationAngles(rotation, item),
        }
        
        this.placedItems.push(placedItem)
        this.currentWeight += item.weight
        this.markSpaceAsOccupied(position, rotation)
        
        return true
      }
    }
    
    return false
  }

  private getRotations(item: BinPackingItem): Array<{ w: number; h: number; d: number }> {
    const dims = [item.width, item.height, item.depth]
    const rotations: Array<{ w: number; h: number; d: number }> = []
    
    // Generar todas las rotaciones posibles
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ]
    
    for (const perm of permutations) {
      rotations.push({
        w: dims[perm[0]],
        h: dims[perm[1]],
        d: dims[perm[2]],
      })
    }
    
    return rotations
  }

  private getRotationAngles(
    rotated: { w: number; h: number; d: number },
    original: BinPackingItem
  ): { x: number; y: number; z: number } {
    // Determinar ángulos de rotación
    if (rotated.w === original.width && rotated.h === original.height && rotated.d === original.depth) {
      return { x: 0, y: 0, z: 0 }
    } else if (rotated.w === original.width && rotated.h === original.depth && rotated.d === original.height) {
      return { x: 90, y: 0, z: 0 }
    } else if (rotated.w === original.height && rotated.h === original.width && rotated.d === original.depth) {
      return { x: 0, y: 0, z: 90 }
    }
    return { x: 0, y: 0, z: 0 }
  }

  private findBestPosition(rotation: { w: number; h: number; d: number }): Position | null {
    const res = 10
    const stepsX = Math.floor((this.container.width - rotation.w) / res) + 1
    const stepsY = Math.floor((this.container.height - rotation.h) / res) + 1
    const stepsZ = Math.floor((this.container.depth - rotation.d) / res) + 1

    let bestPosition: Position | null = null
    let bestScore = Infinity

    // Estrategia: Bottom-Left-Back Fill
    for (let y = 0; y < stepsY; y++) {
      for (let z = 0; z < stepsZ; z++) {
        for (let x = 0; x < stepsX; x++) {
          const position = { x: x * res, y: y * res, z: z * res }
          
          if (this.canPlaceAt(position, rotation)) {
            // Puntuar posición (preferir más abajo y más atrás)
            const score = y * 1000 + z * 100 + x
            
            if (score < bestScore) {
              bestScore = score
              bestPosition = position
            }
          }
        }
      }
    }

    return bestPosition
  }

  private canPlaceAt(
    position: Position,
    rotation: { w: number; h: number; d: number }
  ): boolean {
    const res = 10
    const startX = Math.floor(position.x / res)
    const startY = Math.floor(position.y / res)
    const startZ = Math.floor(position.z / res)
    const endX = startX + Math.ceil(rotation.w / res)
    const endY = startY + Math.ceil(rotation.h / res)
    const endZ = startZ + Math.ceil(rotation.d / res)

    // Verificar límites del contenedor
    if (endX > this.spaceMap.length ||
        endY > this.spaceMap[0].length ||
        endZ > this.spaceMap[0][0].length) {
      return false
    }

    // Verificar si el espacio está libre
    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        for (let z = startZ; z < endZ; z++) {
          if (this.spaceMap[x]?.[y]?.[z]) {
            return false
          }
        }
      }
    }

    return true
  }

  private markSpaceAsOccupied(
    position: Position,
    rotation: { w: number; h: number; d: number }
  ) {
    const res = 10
    const startX = Math.floor(position.x / res)
    const startY = Math.floor(position.y / res)
    const startZ = Math.floor(position.z / res)
    const endX = startX + Math.ceil(rotation.w / res)
    const endY = startY + Math.ceil(rotation.h / res)
    const endZ = startZ + Math.ceil(rotation.d / res)

    for (let x = startX; x < endX; x++) {
      for (let y = startY; y < endY; y++) {
        for (let z = startZ; z < endZ; z++) {
          if (this.spaceMap[x]?.[y]) {
            this.spaceMap[x][y][z] = true
          }
        }
      }
    }
  }

  private calculateUtilization(): number {
    const containerVolume = this.container.width * this.container.height * this.container.depth
    let usedVolume = 0
    
    for (const item of this.placedItems) {
      usedVolume += item.width * item.height * item.depth
    }
    
    return (usedVolume / containerVolume) * 100
  }
}

// Función principal de optimización
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
    vehicle.maxWeight * 1000 // Convertir a kg
  )

  // Agregar productos al empaquetador
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

  // Ejecutar optimización
  const result = binPacker.optimize()

  // Calcular distribución de peso
  let frontWeight = 0
  let centerWeight = 0
  let rearWeight = 0
  
  const containerDepth = vehicle.internalLength
  
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

  // Generar instrucciones de carga (orden inverso para descarga)
  const instructions = result.placedItems
    .map((item, index) => ({
      step: index + 1,
      description: `Colocar ${item.product.name} en posición (${item.position.x.toFixed(0)}, ${item.position.y.toFixed(0)}, ${item.position.z.toFixed(0)})`,
      productName: item.product.name,
      position: item.position,
    }))
    .reverse()

  return {
    placedItems: result.placedItems.map(item => ({
      product: item.product,
      quantity: item.quantity,
      position: item.position,
      rotation: item.rotation,
    })),
    utilization: result.utilization,
    totalWeight: result.placedItems.reduce((sum, item) => sum + item.weight, 0),
    weightDistribution: {
      front: frontWeight,
      center: centerWeight,
      rear: rearWeight,
    },
    instructions,
  }
}

// Función auxiliar para obtener color de categoría
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

// Validación de restricciones de carga
export function validateLoadConstraints(
  placedItems: Array<{ product: Product; position: { y: number } }>,
  vehicle: Vehicle
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Verificar apilamiento
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

  // Verificar compatibilidad de temperaturas
  const tempReqs = new Set(placedItems.map(item => item.product.temperatureReq))
  if (tempReqs.has('congelado') && tempReqs.has('caliente')) {
    errors.push('No se pueden mezclar productos congelados y calientes')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
