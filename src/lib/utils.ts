import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Funciones de cálculo para cubicaje
export function calculateVolume(length: number, width: number, height: number): number {
  return (length * width * height) / 1000000 // Convertir a m³
}

export function calculateSpaceUtilization(usedVolume: number, totalVolume: number): number {
  if (totalVolume === 0) return 0
  return Math.round((usedVolume / totalVolume) * 100 * 100) / 100
}

// Validación de normativas NOM
export function validateNOM012(weight: number, axles: number): boolean {
  // NOM-012-SCT-2-2017: Peso máximo según número de ejes
  const maxWeights: Record<number, number> = {
    2: 17000,  // 2 ejes: 17 toneladas
    3: 26000,  // 3 ejes: 26 toneladas
    4: 36000,  // 4 ejes: 36 toneladas
    5: 43000,  // 5 ejes: 43 toneladas
    6: 48000,  // 6 ejes: 48 toneladas
    7: 50000,  // 7 ejes: 50 toneladas
    8: 52000,  // 8 ejes: 52 toneladas
    9: 54000,  // 9 ejes: 54 toneladas
  }
  
  const maxWeight = maxWeights[axles] || 36000
  return weight <= maxWeight
}

export function validateWeightDistribution(
  totalWeight: number,
  frontWeight: number,
  rearWeight: number,
  frontMax: number = 7000,
  rearMax: number = 17000
): boolean {
  return frontWeight <= frontMax && rearWeight <= rearMax
}

// Formateo de datos
export function formatWeight(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(2)} ton`
  }
  return `${kg.toFixed(2)} kg`
}

export function formatVolume(m3: number): string {
  return `${m3.toFixed(2)} m³`
}

export function formatDimensions(length: number, width: number, height: number): string {
  return `${length}×${width}×${height} cm`
}

// Generación de colores para categorías
export function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    automotriz: '#3B82F6',      // Azul
    electronica: '#8B5CF6',      // Violeta
    maquinaria: '#6366F1',       // Indigo
    medico: '#EC4899',           // Rosa
    energia: '#F59E0B',          // Ámbar
    infraestructura: '#6B7280',  // Gris
    carnicos: '#EF4444',         // Rojo
    lacteos: '#10B981',          // Verde
    frutas_verduras: '#84CC16',  // Lima
    procesados: '#F97316',       // Naranja
    congelados: '#06B6D4',       // Cyan
    granos: '#D97706',           // Marrón
    peligrosas: '#DC2626',       // Rojo oscuro
    generales: '#9CA3AF',        // Gris claro
  }
  return colors[category] || '#9CA3AF'
}

// Validación de compatibilidad de productos
export function areProductsCompatible(product1: any, product2: any): boolean {
  // Verificar incompatibilidades explícitas
  if (product1.incompatibleWith?.includes(product2.id)) return false
  if (product2.incompatibleWith?.includes(product1.id)) return false
  
  // Verificar temperaturas incompatibles
  if (product1.temperatureReq !== product2.temperatureReq) {
    // Algunas combinaciones son incompatibles
    const incompatibleTemps = [
      ['congelado', 'caliente'],
      ['refrigerado', 'caliente'],
    ]
    const tempPair = [product1.temperatureReq, product2.temperatureReq].sort()
    if (incompatibleTemps.some(pair => 
      pair[0] === tempPair[0] && pair[1] === tempPair[1]
    )) {
      return false
    }
  }
  
  // Verificar materiales peligrosos con alimentos
  if (product1.isHazardous && 
      ['carnicos', 'lacteos', 'frutas_verduras', 'procesados'].includes(product2.category)) {
    return false
  }
  
  return true
}
