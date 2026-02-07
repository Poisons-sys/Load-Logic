// Tipos de Usuarios y Roles
export type UserRole = 'admin' | 'operativo' | 'supervisor'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  companyId: string
  createdAt: Date
  updatedAt: Date
}

export interface Company {
  id: string
  name: string
  rfc: string
  address: string
  phone: string
  licenseType: 'matriz'
  maxUsers: number
  createdAt: Date
  updatedAt: Date
}

// Tipos de Mercancía y Categorías
export type ProductCategory = 
  | 'automotriz'
  | 'electronica'
  | 'maquinaria'
  | 'medico'
  | 'energia'
  | 'infraestructura'
  | 'carnicos'
  | 'lacteos'
  | 'frutas_verduras'
  | 'procesados'
  | 'congelados'
  | 'granos'
  | 'peligrosas'
  | 'generales'

export type FragilityLevel = 'baja' | 'media' | 'alta' | 'muy_alta'
export type TemperatureRequirement = 'ambiente' | 'refrigerado' | 'congelado' | 'caliente'

export interface Product {
  id: string
  name: string
  description: string
  category: ProductCategory
  subcategory: string
  hsCode?: string
  
  // Dimensiones
  length: number
  width: number
  height: number
  weight: number
  volume: number
  
  // Características
  fragility: FragilityLevel
  stackable: boolean
  maxStackHeight: number
  
  // Requisitos especiales
  temperatureReq: TemperatureRequirement
  temperatureMin?: number
  temperatureMax?: number
  humiditySensitive: boolean
  
  // Normativas
  isHazardous: boolean
  hazardClass?: string
  unNumber?: string
  
  // Compatibilidad
  incompatibleWith: string[]
  specialInstructions?: string
  
  companyId: string
  createdAt: Date
  updatedAt: Date
}

// Tipos de Unidades de Transporte
export type VehicleType = 'camion' | 'remolque' | 'caja_seca' | 'refrigerado' | 'plataforma' | 'cisterna'

export interface Vehicle {
  id: string
  name: string
  type: VehicleType
  plateNumber: string
  
  // Dimensiones internas (cm)
  internalLength: number
  internalWidth: number
  internalHeight: number
  
  // Capacidades
  maxWeight: number
  maxVolume: number
  
  // Características
  hasRefrigeration: boolean
  minTemperature?: number
  maxTemperature?: number
  
  // Ejes y distribución de peso
  axles: number
  frontAxleMaxWeight: number
  rearAxleMaxWeight: number
  
  // Normativas
  nom012Compliant: boolean
  hazardousMaterialAuthorized: boolean
  
  companyId: string
  createdAt: Date
  updatedAt: Date
}

// Tipos para Optimización de Estiba
export interface LoadItem {
  id: string
  productId: string
  product: Product
  quantity: number
  
  // Posición en la estiba (se calcula)
  position?: {
    x: number
    y: number
    z: number
  }
  rotation?: {
    x: number
    y: number
    z: number
  }
}

export interface LoadPlan {
  id: string
  name: string
  description?: string
  vehicleId: string
  vehicle: Vehicle
  items: LoadItem[]
  
  // Métricas de la estiba
  totalWeight: number
  totalVolume: number
  spaceUtilization: number
  weightDistribution: {
    front: number
    center: number
    rear: number
  }
  
  // Estado
  status: 'pendiente' | 'optimizado' | 'aprobado' | 'ejecutado'
  
  // Instrucciones
  loadingInstructions: LoadingInstruction[]
  
  companyId: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface LoadingInstruction {
  step: number
  description: string
  itemId: string
  position: { x: number; y: number; z: number }
  orientation: 'horizontal' | 'vertical'
}

// Tipos para Reportes
export interface LoadReport {
  id: string
  loadPlanId: string
  generatedAt: Date
  format: 'pdf' | 'csv' | 'xml'
  url: string
}

// Tipos para Normativas
export interface RegulatoryCompliance {
  nom002SCT: boolean
  nom012SCT: boolean
  nom015SCT: boolean
  nom068SCT: boolean
  fsmaUS: boolean
  dot49CFR: boolean
}

// Tipos para el Visualizador 3D
export interface Cube3D {
  id: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  color: string
  productName: string
  weight: number
}

export interface Container3D {
  width: number
  height: number
  depth: number
  cubes: Cube3D[]
}
