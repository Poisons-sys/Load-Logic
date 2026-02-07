import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { loadPlans, products, vehicles, reports } from '@/db/schema'
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

// GET - Generar reportes y estadísticas
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'summary'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    // Construir condiciones de fecha
    let dateCondition = undefined
    if (startDate && endDate) {
      dateCondition = and(
        gte(loadPlans.createdAt, new Date(startDate)),
        lte(loadPlans.createdAt, new Date(endDate))
      )
    }

    switch (type) {
      case 'summary':
        return await generateSummaryReport(auth.companyId, dateCondition)
      
      case 'efficiency':
        return await generateEfficiencyReport(auth.companyId, dateCondition)
      
      case 'products':
        return await generateProductsReport(auth.companyId, dateCondition)
      
      case 'vehicles':
        return await generateVehiclesReport(auth.companyId, dateCondition)
      
      case 'compliance':
        return await generateComplianceReport(auth.companyId, dateCondition)
      
      default:
        return NextResponse.json(
          { error: 'Tipo de reporte no válido' },
          { status: 400 }
        )
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error generando reporte:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Reporte de resumen general
async function generateSummaryReport(companyId: string, dateCondition: any) {
  const conditions = [eq(loadPlans.companyId, companyId)]
  if (dateCondition) conditions.push(dateCondition)

  const allLoadPlans = await db.query.loadPlans.findMany({
    where: and(...conditions),
  })

  const totalLoads = allLoadPlans.length
  const completedLoads = allLoadPlans.filter(lp => lp.status === 'completado').length
  const pendingLoads = allLoadPlans.filter(lp => lp.status === 'pendiente').length
  const optimizedLoads = allLoadPlans.filter(lp => lp.status === 'optimizado').length

  const totalWeight = allLoadPlans.reduce((sum, lp) => sum + (lp.totalWeight || 0), 0)
  const avgUtilization = allLoadPlans.length > 0
    ? allLoadPlans.reduce((sum, lp) => sum + (lp.spaceUtilization || 0), 0) / allLoadPlans.length
    : 0

  const productCount = await db.query.products.findMany({
    where: eq(products.companyId, companyId),
  })

  const vehicleCount = await db.query.vehicles.findMany({
    where: eq(vehicles.companyId, companyId),
  })

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        totalLoads,
        completedLoads,
        pendingLoads,
        optimizedLoads,
        totalWeight: (totalWeight / 1000).toFixed(2), // en toneladas
        avgUtilization: avgUtilization.toFixed(2),
        productCount: productCount.length,
        vehicleCount: vehicleCount.length,
      },
    },
  })
}

// Reporte de eficiencia
async function generateEfficiencyReport(companyId: string, dateCondition: any) {
  const conditions = [eq(loadPlans.companyId, companyId)]
  if (dateCondition) conditions.push(dateCondition)

  const allLoadPlans = await db.query.loadPlans.findMany({
    where: and(...conditions),
    with: {
      vehicle: true,
    },
  })

  const utilizationByVehicle: Record<string, { name: string; loads: number; avgUtilization: number }> = {}

  for (const loadPlan of allLoadPlans) {
    if (loadPlan.vehicle) {
      const vehicleId = loadPlan.vehicle.id
      if (!utilizationByVehicle[vehicleId]) {
        utilizationByVehicle[vehicleId] = {
          name: loadPlan.vehicle.name,
          loads: 0,
          avgUtilization: 0,
        }
      }
      utilizationByVehicle[vehicleId].loads++
      utilizationByVehicle[vehicleId].avgUtilization += loadPlan.spaceUtilization || 0
    }
  }

  // Calcular promedios
  for (const key in utilizationByVehicle) {
    const vehicle = utilizationByVehicle[key]
    vehicle.avgUtilization = vehicle.loads > 0 
      ? vehicle.avgUtilization / vehicle.loads 
      : 0
  }

  const overallAvg = allLoadPlans.length > 0
    ? allLoadPlans.reduce((sum, lp) => sum + (lp.spaceUtilization || 0), 0) / allLoadPlans.length
    : 0

  return NextResponse.json({
    success: true,
    data: {
      overallAvg: overallAvg.toFixed(2),
      byVehicle: Object.values(utilizationByVehicle),
    },
  })
}

// Reporte de productos
async function generateProductsReport(companyId: string, dateCondition: any) {
  const allProducts = await db.query.products.findMany({
    where: eq(products.companyId, companyId),
  })

  const byCategory: Record<string, { count: number; totalWeight: number; totalVolume: number }> = {}

  for (const product of allProducts) {
    const category = product.category
    if (!byCategory[category]) {
      byCategory[category] = { count: 0, totalWeight: 0, totalVolume: 0 }
    }
    byCategory[category].count++
    byCategory[category].totalWeight += product.weight
    byCategory[category].totalVolume += product.volume
  }

  return NextResponse.json({
    success: true,
    data: {
      totalProducts: allProducts.length,
      byCategory: Object.entries(byCategory).map(([category, data]) => ({
        category,
        ...data,
      })),
    },
  })
}

// Reporte de vehículos
async function generateVehiclesReport(companyId: string, dateCondition: any) {
  const allVehicles = await db.query.vehicles.findMany({
    where: eq(vehicles.companyId, companyId),
  })

  const conditions = [eq(loadPlans.companyId, companyId)]
  if (dateCondition) conditions.push(dateCondition)

  const allLoadPlans = await db.query.loadPlans.findMany({
    where: and(...conditions),
  })

  const vehicleUsage = allVehicles.map(vehicle => {
    const vehicleLoads = allLoadPlans.filter(lp => lp.vehicleId === vehicle.id)
    const totalWeight = vehicleLoads.reduce((sum, lp) => sum + (lp.totalWeight || 0), 0)

    return {
      id: vehicle.id,
      name: vehicle.name,
      plateNumber: vehicle.plateNumber,
      type: vehicle.type,
      totalLoads: vehicleLoads.length,
      totalWeight: (totalWeight / 1000).toFixed(2),
      avgUtilization: vehicleLoads.length > 0
        ? (vehicleLoads.reduce((sum, lp) => sum + (lp.spaceUtilization || 0), 0) / vehicleLoads.length).toFixed(2)
        : '0',
      isActive: vehicle.isActive,
    }
  })

  return NextResponse.json({
    success: true,
    data: {
      totalVehicles: allVehicles.length,
      activeVehicles: allVehicles.filter(v => v.isActive).length,
      vehicleUsage,
    },
  })
}

// Reporte de cumplimiento normativo
async function generateComplianceReport(companyId: string, dateCondition: any) {
  const conditions = [eq(loadPlans.companyId, companyId)]
  if (dateCondition) conditions.push(dateCondition)

  const allLoadPlans = await db.query.loadPlans.findMany({
    where: and(...conditions),
  })

  const totalLoads = allLoadPlans.length
  const nom002Compliant = allLoadPlans.filter(lp => lp.nom002Compliant).length
  const nom012Compliant = allLoadPlans.filter(lp => lp.nom012Compliant).length
  const nom015Compliant = allLoadPlans.filter(lp => lp.nom015Compliant).length

  return NextResponse.json({
    success: true,
    data: {
      totalLoads,
      compliance: {
        nom002: {
          compliant: nom002Compliant,
          percentage: totalLoads > 0 ? ((nom002Compliant / totalLoads) * 100).toFixed(2) : '100',
        },
        nom012: {
          compliant: nom012Compliant,
          percentage: totalLoads > 0 ? ((nom012Compliant / totalLoads) * 100).toFixed(2) : '100',
        },
        nom015: {
          compliant: nom015Compliant,
          percentage: totalLoads > 0 ? ((nom015Compliant / totalLoads) * 100).toFixed(2) : '100',
        },
      },
      overallCompliance: totalLoads > 0
        ? (((nom002Compliant + nom012Compliant + nom015Compliant) / (totalLoads * 3)) * 100).toFixed(2)
        : '100',
    },
  })
}

// POST - Guardar reporte generado
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const body = await request.json()
    const { loadPlanId, type, format, fileUrl } = body

    if (!type || !format) {
      return NextResponse.json(
        { error: 'Tipo y formato son requeridos' },
        { status: 400 }
      )
    }

    const [newReport] = await db.insert(reports)
      .values({
        loadPlanId,
        type,
        format,
        fileUrl,
        companyId: auth.companyId,
        generatedBy: auth.userId,
      })
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Reporte guardado exitosamente',
      data: newReport,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error guardando reporte:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
