import 'dotenv/config'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index'
import { companies, products, users, vehicles } from '../db/schema'

type ProductSeed = {
  name: string
  description: string
  category:
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
  subcategory: string
  hsCode: string
  length: number
  width: number
  height: number
  weight: number
  fragility: 'baja' | 'media' | 'alta' | 'muy_alta'
  stackable: boolean
  maxStackHeight: number
  maxTopLoadKg: number
  allowRotate90: boolean
  noStackAbove: boolean
  floorOnly: boolean
  temperatureReq: 'ambiente' | 'refrigerado' | 'congelado' | 'caliente'
  temperatureMin: number | null
  temperatureMax: number | null
  humiditySensitive: boolean
  isHazardous: boolean
  hazardClass: string | null
  unNumber: string | null
  incompatibleWith: string[]
  specialInstructions: string
}

type VehicleSeed = {
  name: string
  type: 'remolque' | 'caja_seca' | 'refrigerado' | 'plataforma' | 'cisterna'
  plateNumber: string
  internalLength: number
  internalWidth: number
  internalHeight: number
  maxWeight: number
  hasRefrigeration: boolean
  minTemperature: number | null
  maxTemperature: number | null
  axles: number
  frontAxleMaxWeight: number
  rearAxleMaxWeight: number
  hazardousMaterialAuthorized: boolean
}

function computeVolume(length: number, width: number, height: number) {
  return Number(((length * width * height) / 1_000_000).toFixed(3))
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

async function resolveCompanyId() {
  const targetCompanyId = process.env.CATALOG_COMPANY_ID?.trim()
  if (targetCompanyId) {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, targetCompanyId),
    })
    if (!company) throw new Error(`CATALOG_COMPANY_ID no existe: ${targetCompanyId}`)
    return company.id
  }

  const targetRfc = process.env.CATALOG_COMPANY_RFC?.trim()
  if (targetRfc) {
    const company = await db.query.companies.findFirst({
      where: eq(companies.rfc, targetRfc),
    })
    if (!company) throw new Error(`CATALOG_COMPANY_RFC no existe: ${targetRfc}`)
    return company.id
  }

  const preferredEmail = normalizeEmail(
    process.env.CATALOG_TARGET_EMAIL ||
      process.env.SEED_ADMIN_EMAIL ||
      process.env.SMOKE_EMAIL ||
      'admin@local.test'
  )

  const targetUser = await db.query.users.findFirst({
    where: eq(users.email, preferredEmail),
  })
  if (targetUser?.companyId) return targetUser.companyId

  const firstAdmin = await db.query.users.findFirst({
    where: eq(users.role, 'admin'),
  })
  if (firstAdmin?.companyId) return firstAdmin.companyId

  throw new Error(
    `No se pudo resolver companyId. Define CATALOG_TARGET_EMAIL/CATALOG_COMPANY_RFC/CATALOG_COMPANY_ID.`
  )
}

const realisticProducts: ProductSeed[] = [
  {
    name: 'Motor Diesel Industrial 6.7L',
    description: 'Motor completo para maquinaria pesada, embalado en base metalica con puntos de izaje.',
    category: 'automotriz',
    subcategory: 'motores_diesel',
    hsCode: '8408.90',
    length: 120,
    width: 90,
    height: 110,
    weight: 780,
    fragility: 'media',
    stackable: false,
    maxStackHeight: 1,
    maxTopLoadKg: 0,
    allowRotate90: false,
    noStackAbove: true,
    floorOnly: true,
    temperatureReq: 'ambiente',
    temperatureMin: null,
    temperatureMax: null,
    humiditySensitive: false,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'FLOOR_ONLY; NO_STACK_ABOVE; ORIENTATION_LOCK',
  },
  {
    name: 'Servidor Rack 4U Empaquetado',
    description: 'Servidor empresarial en empaque antiestatico con refuerzo de espuma.',
    category: 'electronica',
    subcategory: 'servidores',
    hsCode: '8471.50',
    length: 80,
    width: 60,
    height: 45,
    weight: 38,
    fragility: 'alta',
    stackable: true,
    maxStackHeight: 3,
    maxTopLoadKg: 400,
    allowRotate90: false,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: 10,
    temperatureMax: 30,
    humiditySensitive: true,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'ORIENTATION_LOCK',
  },
  {
    name: 'Bomba Hidraulica Industrial',
    description: 'Bomba de desplazamiento positivo para lineas de produccion.',
    category: 'maquinaria',
    subcategory: 'bombas',
    hsCode: '8413.60',
    length: 90,
    width: 70,
    height: 75,
    weight: 220,
    fragility: 'media',
    stackable: true,
    maxStackHeight: 2,
    maxTopLoadKg: 1200,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: null,
    temperatureMax: null,
    humiditySensitive: false,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'MAX_TOP_LOAD_KG=1200',
  },
  {
    name: 'Ultrasonido Diagnostico Portatil',
    description: 'Equipo medico en gabinete con proteccion antivibracion.',
    category: 'medico',
    subcategory: 'diagnostico_imagen',
    hsCode: '9018.12',
    length: 78,
    width: 62,
    height: 92,
    weight: 115,
    fragility: 'muy_alta',
    stackable: false,
    maxStackHeight: 1,
    maxTopLoadKg: 0,
    allowRotate90: false,
    noStackAbove: true,
    floorOnly: true,
    temperatureReq: 'ambiente',
    temperatureMin: 15,
    temperatureMax: 30,
    humiditySensitive: true,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'FLOOR_ONLY; NO_STACK_ABOVE; ORIENTATION_LOCK',
  },
  {
    name: 'Modulo Fotovoltaico 550W en Tarima',
    description: 'Tarima de paneles solares de alta eficiencia con separadores.',
    category: 'energia',
    subcategory: 'paneles_solares',
    hsCode: '8541.43',
    length: 230,
    width: 115,
    height: 45,
    weight: 320,
    fragility: 'alta',
    stackable: true,
    maxStackHeight: 2,
    maxTopLoadKg: 700,
    allowRotate90: false,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: null,
    temperatureMax: null,
    humiditySensitive: true,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'ORIENTATION_LOCK; MAX_TOP_LOAD_KG=700',
  },
  {
    name: 'Valvula de Compuerta DN200',
    description: 'Valvula industrial de hierro nodular para conduccion de fluidos.',
    category: 'infraestructura',
    subcategory: 'valvulas_industriales',
    hsCode: '8481.80',
    length: 100,
    width: 80,
    height: 95,
    weight: 410,
    fragility: 'baja',
    stackable: true,
    maxStackHeight: 2,
    maxTopLoadKg: 2500,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: null,
    temperatureMax: null,
    humiditySensitive: false,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'MAX_TOP_LOAD_KG=2500',
  },
  {
    name: 'Canal Bovina Refrigerada en Caja Isotermica',
    description: 'Producto carnico refrigerado para distribucion nacional.',
    category: 'carnicos',
    subcategory: 'res_refrigerada',
    hsCode: '0201.30',
    length: 120,
    width: 80,
    height: 95,
    weight: 180,
    fragility: 'media',
    stackable: false,
    maxStackHeight: 1,
    maxTopLoadKg: 0,
    allowRotate90: true,
    noStackAbove: true,
    floorOnly: true,
    temperatureReq: 'refrigerado',
    temperatureMin: 0,
    temperatureMax: 4,
    humiditySensitive: false,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: ['quimicos'],
    specialInstructions: 'FLOOR_ONLY; NO_STACK_ABOVE',
  },
  {
    name: 'Queso Madurado en Caja Plastica',
    description: 'Caja retornable de lacteos para cadena fria.',
    category: 'lacteos',
    subcategory: 'quesos',
    hsCode: '0406.90',
    length: 60,
    width: 40,
    height: 30,
    weight: 28,
    fragility: 'baja',
    stackable: true,
    maxStackHeight: 6,
    maxTopLoadKg: 300,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'refrigerado',
    temperatureMin: 2,
    temperatureMax: 6,
    humiditySensitive: false,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: ['quimicos'],
    specialInstructions: 'MAX_TOP_LOAD_KG=300',
  },
  {
    name: 'Aguacate Hass en Caja Ventilada',
    description: 'Caja de exportacion de aguacate con ventilacion lateral.',
    category: 'frutas_verduras',
    subcategory: 'aguacate',
    hsCode: '0804.40',
    length: 60,
    width: 40,
    height: 25,
    weight: 12,
    fragility: 'media',
    stackable: true,
    maxStackHeight: 7,
    maxTopLoadKg: 120,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'refrigerado',
    temperatureMin: 5,
    temperatureMax: 8,
    humiditySensitive: true,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: ['quimicos'],
    specialInstructions: 'MAX_TOP_LOAD_KG=120',
  },
  {
    name: 'Bebida Isotonica en Tarima',
    description: 'Tarima filmada de bebidas en PET para retail.',
    category: 'procesados',
    subcategory: 'bebidas',
    hsCode: '2202.99',
    length: 120,
    width: 100,
    height: 150,
    weight: 980,
    fragility: 'baja',
    stackable: true,
    maxStackHeight: 2,
    maxTopLoadKg: 3000,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: null,
    temperatureMax: null,
    humiditySensitive: false,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'MAX_TOP_LOAD_KG=3000',
  },
  {
    name: 'Camaron Congelado IQF en Tarima',
    description: 'Tarima de producto congelado para exportacion.',
    category: 'congelados',
    subcategory: 'mariscos',
    hsCode: '0306.17',
    length: 120,
    width: 100,
    height: 140,
    weight: 760,
    fragility: 'media',
    stackable: true,
    maxStackHeight: 3,
    maxTopLoadKg: 1800,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'congelado',
    temperatureMin: -22,
    temperatureMax: -18,
    humiditySensitive: false,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: ['quimicos'],
    specialInstructions: 'MAX_TOP_LOAD_KG=1800',
  },
  {
    name: 'Super Sack de Maiz Amarillo 1T',
    description: 'Saco big bag para materia prima agroindustrial.',
    category: 'granos',
    subcategory: 'maiz_amarillo',
    hsCode: '1005.90',
    length: 95,
    width: 95,
    height: 120,
    weight: 1000,
    fragility: 'baja',
    stackable: true,
    maxStackHeight: 2,
    maxTopLoadKg: 2000,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: null,
    temperatureMax: null,
    humiditySensitive: true,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: ['liquidos'],
    specialInstructions: 'MAX_TOP_LOAD_KG=2000',
  },
  {
    name: 'Pintura Base Solvente UN1263',
    description: 'Pintura industrial inflamable en tambores certificados.',
    category: 'peligrosas',
    subcategory: 'pinturas',
    hsCode: '3208.90',
    length: 120,
    width: 100,
    height: 120,
    weight: 650,
    fragility: 'media',
    stackable: true,
    maxStackHeight: 2,
    maxTopLoadKg: 1000,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: 5,
    temperatureMax: 30,
    humiditySensitive: false,
    isHazardous: true,
    hazardClass: '3',
    unNumber: 'UN1263',
    incompatibleWith: ['oxidantes', 'alimentos'],
    specialInstructions: 'Ventilacion constante; MAX_TOP_LOAD_KG=1000',
  },
  {
    name: 'Mueble Modular Desmontado',
    description: 'Kit de mobiliario en empaque de carton reforzado.',
    category: 'generales',
    subcategory: 'mobiliario',
    hsCode: '9403.60',
    length: 200,
    width: 80,
    height: 60,
    weight: 95,
    fragility: 'media',
    stackable: true,
    maxStackHeight: 3,
    maxTopLoadKg: 400,
    allowRotate90: true,
    noStackAbove: false,
    floorOnly: false,
    temperatureReq: 'ambiente',
    temperatureMin: null,
    temperatureMax: null,
    humiditySensitive: true,
    isHazardous: false,
    hazardClass: null,
    unNumber: null,
    incompatibleWith: [],
    specialInstructions: 'MAX_TOP_LOAD_KG=400',
  },
  {
    name: 'Bateria de Litio para Montacargas',
    description: 'Bateria industrial Li-ion en pallet con proteccion de bornes.',
    category: 'electronica',
    subcategory: 'baterias_industriales',
    hsCode: '8507.60',
    length: 120,
    width: 80,
    height: 85,
    weight: 520,
    fragility: 'alta',
    stackable: false,
    maxStackHeight: 1,
    maxTopLoadKg: 0,
    allowRotate90: false,
    noStackAbove: true,
    floorOnly: true,
    temperatureReq: 'ambiente',
    temperatureMin: 10,
    temperatureMax: 30,
    humiditySensitive: false,
    isHazardous: true,
    hazardClass: '9',
    unNumber: 'UN3480',
    incompatibleWith: ['fuentes_calor'],
    specialInstructions: 'FLOOR_ONLY; NO_STACK_ABOVE; ORIENTATION_LOCK',
  },
]

const realisticVehicles: VehicleSeed[] = [
  {
    name: "Remolque Caja Seca 53' - TrailMax TX53",
    type: 'remolque',
    plateNumber: '53-TX-901',
    internalLength: 1360,
    internalWidth: 250,
    internalHeight: 270,
    maxWeight: 26000,
    hasRefrigeration: false,
    minTemperature: null,
    maxTemperature: null,
    axles: 3,
    frontAxleMaxWeight: 7000,
    rearAxleMaxWeight: 19000,
    hazardousMaterialAuthorized: true,
  },
  {
    name: "Unidad Refrigerada 53' - ThermoKing R53",
    type: 'refrigerado',
    plateNumber: 'RF-53-442',
    internalLength: 1330,
    internalWidth: 245,
    internalHeight: 255,
    maxWeight: 24000,
    hasRefrigeration: true,
    minTemperature: -25,
    maxTemperature: 8,
    axles: 3,
    frontAxleMaxWeight: 7000,
    rearAxleMaxWeight: 17000,
    hazardousMaterialAuthorized: false,
  },
  {
    name: "Plataforma 48' - FlatDeck F48",
    type: 'plataforma',
    plateNumber: 'PL-48-117',
    internalLength: 1463,
    internalWidth: 250,
    internalHeight: 260,
    maxWeight: 28000,
    hasRefrigeration: false,
    minTemperature: null,
    maxTemperature: null,
    axles: 3,
    frontAxleMaxWeight: 7000,
    rearAxleMaxWeight: 20000,
    hazardousMaterialAuthorized: true,
  },
  {
    name: 'Cisterna 43m3 - TankPro T43',
    type: 'cisterna',
    plateNumber: 'TZ-43-305',
    internalLength: 1180,
    internalWidth: 250,
    internalHeight: 250,
    maxWeight: 32000,
    hasRefrigeration: false,
    minTemperature: null,
    maxTemperature: null,
    axles: 4,
    frontAxleMaxWeight: 9000,
    rearAxleMaxWeight: 23000,
    hazardousMaterialAuthorized: true,
  },
  {
    name: "Caja Seca 40' - DryBox D40",
    type: 'caja_seca',
    plateNumber: 'CS-40-778',
    internalLength: 1200,
    internalWidth: 245,
    internalHeight: 260,
    maxWeight: 22000,
    hasRefrigeration: false,
    minTemperature: null,
    maxTemperature: null,
    axles: 3,
    frontAxleMaxWeight: 7000,
    rearAxleMaxWeight: 17000,
    hazardousMaterialAuthorized: false,
  },
]

async function upsertProducts(companyId: string) {
  let inserted = 0
  let updated = 0

  for (const item of realisticProducts) {
    const existing = await db.query.products.findFirst({
      where: and(eq(products.companyId, companyId), eq(products.name, item.name)),
    })

    const payload = {
      name: item.name,
      description: item.description,
      category: item.category,
      subcategory: item.subcategory,
      hsCode: item.hsCode,
      length: item.length,
      width: item.width,
      height: item.height,
      weight: item.weight,
      volume: computeVolume(item.length, item.width, item.height),
      fragility: item.fragility,
      stackable: item.stackable,
      maxStackHeight: item.maxStackHeight,
      maxTopLoadKg: item.maxTopLoadKg,
      allowRotate90: item.allowRotate90,
      noStackAbove: item.noStackAbove,
      floorOnly: item.floorOnly,
      temperatureReq: item.temperatureReq,
      temperatureMin: item.temperatureMin,
      temperatureMax: item.temperatureMax,
      humiditySensitive: item.humiditySensitive,
      isHazardous: item.isHazardous,
      hazardClass: item.hazardClass,
      unNumber: item.unNumber,
      nom002Compliance: item.isHazardous,
      incompatibleWith: item.incompatibleWith,
      specialInstructions: item.specialInstructions,
      companyId,
      isActive: true,
      updatedAt: new Date(),
    } as const

    if (existing) {
      await db.update(products).set(payload).where(eq(products.id, existing.id))
      updated += 1
    } else {
      await db.insert(products).values({
        ...payload,
        createdAt: new Date(),
      })
      inserted += 1
    }
  }

  return { inserted, updated }
}

async function upsertVehicles(companyId: string) {
  let inserted = 0
  let updated = 0

  for (const unit of realisticVehicles) {
    const existing = await db.query.vehicles.findFirst({
      where: and(eq(vehicles.companyId, companyId), eq(vehicles.plateNumber, unit.plateNumber)),
    })

    const payload = {
      name: unit.name,
      type: unit.type,
      plateNumber: unit.plateNumber,
      internalLength: unit.internalLength,
      internalWidth: unit.internalWidth,
      internalHeight: unit.internalHeight,
      maxWeight: unit.maxWeight,
      maxVolume: computeVolume(unit.internalLength, unit.internalWidth, unit.internalHeight),
      hasRefrigeration: unit.hasRefrigeration,
      minTemperature: unit.minTemperature,
      maxTemperature: unit.maxTemperature,
      axles: unit.axles,
      frontAxleMaxWeight: unit.frontAxleMaxWeight,
      rearAxleMaxWeight: unit.rearAxleMaxWeight,
      nom012Compliant: true,
      nom068Compliant: true,
      hazardousMaterialAuthorized: unit.hazardousMaterialAuthorized,
      companyId,
      isActive: true,
      updatedAt: new Date(),
    } as const

    if (existing) {
      await db.update(vehicles).set(payload).where(eq(vehicles.id, existing.id))
      updated += 1
    } else {
      await db.insert(vehicles).values({
        ...payload,
        createdAt: new Date(),
      })
      inserted += 1
    }
  }

  return { inserted, updated }
}

async function main() {
  const companyId = await resolveCompanyId()
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  })

  if (!company) {
    throw new Error(`Company no encontrada: ${companyId}`)
  }

  console.log(
    `[catalog] Empresa destino: ${company.name} (${company.rfc}) - ${company.id}`
  )

  const productResult = await upsertProducts(company.id)
  const vehicleResult = await upsertVehicles(company.id)

  const totalProducts = await db.query.products.findMany({
    where: and(eq(products.companyId, company.id), eq(products.isActive, true)),
    columns: { id: true },
  })
  const totalVehicles = await db.query.vehicles.findMany({
    where: and(eq(vehicles.companyId, company.id), eq(vehicles.isActive, true)),
    columns: { id: true },
  })

  console.log(
    `[catalog] Productos -> insertados: ${productResult.inserted}, actualizados: ${productResult.updated}, activos empresa: ${totalProducts.length}`
  )
  console.log(
    `[catalog] Unidades -> insertadas: ${vehicleResult.inserted}, actualizadas: ${vehicleResult.updated}, activas empresa: ${totalVehicles.length}`
  )
}

main()
  .then(() => {
    console.log('[catalog] Seed realista completado.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('[catalog] Error:', error)
    process.exit(1)
  })
