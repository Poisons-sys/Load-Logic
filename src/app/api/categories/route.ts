import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

// Categorías de productos con información de normativas
const productCategories = [
  {
    id: 'automotriz',
    name: 'Automotriz',
    description: 'Autopartes, accesorios, motores y transmisiones',
    norms: ['NOM-068-SCT-2-2014'],
    characteristics: {
      fragility: 'media',
      temperature: 'ambiente',
      stackable: true,
    },
  },
  {
    id: 'electronica',
    name: 'Electrónica',
    description: 'Computadoras, teléfonos, equipos de telecomunicaciones',
    norms: ['NOM-068-SCT-2-2014'],
    characteristics: {
      fragility: 'muy_alta',
      temperature: 'ambiente',
      stackable: false,
    },
  },
  {
    id: 'maquinaria',
    name: 'Maquinaria Industrial',
    description: 'Motores industriales, partes de avión, equipos de producción',
    norms: ['NOM-068-SCT-2-2014'],
    characteristics: {
      fragility: 'baja',
      temperature: 'ambiente',
      stackable: true,
    },
  },
  {
    id: 'medico',
    name: 'Dispositivos Médicos',
    description: 'Equipamiento hospitalario, instrumentos de diagnóstico',
    norms: ['NOM-120-SSA1-1994', 'NOM-251-SSA1-2009'],
    characteristics: {
      fragility: 'alta',
      temperature: 'refrigerado',
      stackable: false,
    },
  },
  {
    id: 'energia',
    name: 'Energía y Baterías',
    description: 'Baterías eléctricas, equipos de almacenamiento',
    norms: ['NOM-002-SCT/2023', 'NOM-002-1-SCT2/2023'],
    characteristics: {
      fragility: 'alta',
      temperature: 'ambiente',
      stackable: true,
    },
  },
  {
    id: 'infraestructura',
    name: 'Infraestructura',
    description: 'Válvulas, tuberías, herramientas industriales',
    norms: ['NOM-068-SCT-2-2014'],
    characteristics: {
      fragility: 'baja',
      temperature: 'ambiente',
      stackable: true,
    },
  },
  {
    id: 'carnicos',
    name: 'Cárnicos',
    description: 'Carne de res, cerdo, pollo, embutidos, congelados',
    norms: ['NOM-120-SSA1-1994', 'NOM-213-SSA1-2002', 'NOM-194-SSA1-2004'],
    characteristics: {
      fragility: 'baja',
      temperature: 'congelado',
      stackable: true,
    },
  },
  {
    id: 'lacteos',
    name: 'Lácteos',
    description: 'Leche, quesos, yogurt, crema, mantequilla',
    norms: ['NOM-120-SSA1-1994', 'NOM-251-SSA1-2009', 'NOM-194-SSA1-2004'],
    characteristics: {
      fragility: 'baja',
      temperature: 'refrigerado',
      stackable: true,
    },
  },
  {
    id: 'frutas_verduras',
    name: 'Frutas y Verduras',
    description: 'Aguacate, tomate, cebolla, limón, mango, berries',
    norms: ['NOM-120-SSA1-1994', 'NOM-251-SSA1-2009'],
    characteristics: {
      fragility: 'media',
      temperature: 'refrigerado',
      stackable: true,
    },
  },
  {
    id: 'procesados',
    name: 'Alimentos Procesados',
    description: 'Cereales, galletas, botanas, harinas, enlatados',
    norms: ['NOM-120-SSA1-1994', 'NOM-251-SSA1-2009'],
    characteristics: {
      fragility: 'baja',
      temperature: 'ambiente',
      stackable: true,
    },
  },
  {
    id: 'congelados',
    name: 'Alimentos Congelados',
    description: 'Verduras, carnes, pescados, alimentos preparados',
    norms: ['NOM-120-SSA1-1994', 'NOM-194-SSA1-2004', 'FSMA'],
    characteristics: {
      fragility: 'baja',
      temperature: 'congelado',
      stackable: true,
    },
  },
  {
    id: 'granos',
    name: 'Granos',
    description: 'Maíz, trigo, arroz, soya, alimentos para ganado',
    norms: ['NOM-120-SSA1-1994'],
    characteristics: {
      fragility: 'baja',
      temperature: 'ambiente',
      stackable: true,
    },
  },
  {
    id: 'peligrosas',
    name: 'Materiales Peligrosos',
    description: 'Sustancias químicas, baterías de litio, productos peligrosos',
    norms: ['NOM-002-SCT/2023', 'NOM-002-1-SCT2/2023', 'NOM-003-SCT2/2008', '49 CFR'],
    characteristics: {
      fragility: 'alta',
      temperature: 'ambiente',
      stackable: false,
    },
  },
  {
    id: 'generales',
    name: 'Productos Generales',
    description: 'Productos de consumo general',
    norms: ['NOM-068-SCT-2-2014'],
    characteristics: {
      fragility: 'baja',
      temperature: 'ambiente',
      stackable: true,
    },
  },
]

// Tipos de vehículos
const vehicleTypes = [
  { id: 'camion', name: 'Camión', description: 'Camión de carga general' },
  { id: 'remolque', name: 'Remolque', description: 'Remolque para tractocamión' },
  { id: 'caja_seca', name: 'Caja Seca', description: 'Caja seca cerrada' },
  { id: 'refrigerado', name: 'Refrigerado', description: 'Unidad con refrigeración' },
  { id: 'plataforma', name: 'Plataforma', description: 'Plataforma abierta' },
  { id: 'cisterna', name: 'Cisterna', description: 'Tanque para líquidos' },
]

// Niveles de fragilidad
const fragilityLevels = [
  { id: 'baja', name: 'Baja', description: 'Productos resistentes' },
  { id: 'media', name: 'Media', description: 'Requiere cuidado moderado' },
  { id: 'alta', name: 'Alta', description: 'Requiere cuidado especial' },
  { id: 'muy_alta', name: 'Muy Alta', description: 'Productos delicados' },
]

// Requisitos de temperatura
const temperatureRequirements = [
  { id: 'ambiente', name: 'Ambiente', min: null, max: null },
  { id: 'refrigerado', name: 'Refrigerado', min: 0, max: 8 },
  { id: 'congelado', name: 'Congelado', min: -25, max: -12 },
  { id: 'caliente', name: 'Caliente', min: 60, max: null },
]

// Normativas soportadas
const supportedNorms = [
  { code: 'NOM-002-SCT/2023', name: 'Materiales Peligrosos', country: 'MX' },
  { code: 'NOM-002-1-SCT2/2023', name: 'Embalajes para Materiales Peligrosos', country: 'MX' },
  { code: 'NOM-003-SCT2/2008', name: 'Etiquetas para Materiales Peligrosos', country: 'MX' },
  { code: 'NOM-012-SCT-2-2017', name: 'Peso y Dimensiones', country: 'MX' },
  { code: 'NOM-015-SCT-2-2022', name: 'Estiba y Sujeción', country: 'MX' },
  { code: 'NOM-068-SCT-2-2014', name: 'Condiciones Físico-Mecánicas', country: 'MX' },
  { code: 'NOM-120-SSA1-1994', name: 'Prácticas de Higiene', country: 'MX' },
  { code: 'NOM-251-SSA1-2009', name: 'Manejo de Alimentos', country: 'MX' },
  { code: 'NOM-194-SSA1-2004', name: 'Transporte Refrigerado', country: 'MX' },
  { code: '49 CFR', name: 'Hazardous Materials Regulations', country: 'US' },
  { code: 'FMCSR', name: 'Federal Motor Carrier Safety', country: 'US' },
  { code: 'FSMA', name: 'Food Safety Modernization Act', country: 'US' },
]

// GET - Obtener todas las categorías y opciones
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    switch (type) {
      case 'products':
        return NextResponse.json({
          success: true,
          data: productCategories,
        })
      
      case 'vehicles':
        return NextResponse.json({
          success: true,
          data: vehicleTypes,
        })
      
      case 'fragility':
        return NextResponse.json({
          success: true,
          data: fragilityLevels,
        })
      
      case 'temperature':
        return NextResponse.json({
          success: true,
          data: temperatureRequirements,
        })
      
      case 'norms':
        return NextResponse.json({
          success: true,
          data: supportedNorms,
        })
      
      default:
        // Retornar todas las categorías
        return NextResponse.json({
          success: true,
          data: {
            productCategories,
            vehicleTypes,
            fragilityLevels,
            temperatureRequirements,
            supportedNorms,
          },
        })
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo categorías:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
