import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { loadPlans, products, vehicles, reports, users } from '@/db/schema'
import { eq, and, gte, lte, inArray, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

function buildDateCondition(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return undefined
  return and(
    gte(loadPlans.createdAt, new Date(startDate)),
    lte(loadPlans.createdAt, new Date(endDate))
  )
}

async function generateSummaryReport(companyId: string, dateCondition?: ReturnType<typeof and>) {
  const conditions = [eq(loadPlans.companyId, companyId)]
  if (dateCondition) conditions.push(dateCondition)

  const allLoadPlans = await db.query.loadPlans.findMany({
    where: and(...conditions),
  })

  const totalLoads = allLoadPlans.length
  const completedLoads = allLoadPlans.filter(lp => lp.status === 'ejecutado').length
  const pendingLoads = allLoadPlans.filter(lp => lp.status === 'pendiente' || lp.status === null).length
  const optimizedLoads = allLoadPlans.filter(lp => lp.status === 'optimizado').length

  const totalWeight = allLoadPlans.reduce((sum, lp) => sum + Number(lp.totalWeight || 0), 0)
  const avgUtilization = totalLoads > 0
    ? allLoadPlans.reduce((sum, lp) => sum + Number(lp.spaceUtilization || 0), 0) / totalLoads
    : 0

  const productCount = await db.query.products.findMany({
    where: eq(products.companyId, companyId),
    columns: { id: true },
  })

  const vehicleCount = await db.query.vehicles.findMany({
    where: eq(vehicles.companyId, companyId),
    columns: { id: true },
  })

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        totalLoads,
        completedLoads,
        pendingLoads,
        optimizedLoads,
        totalWeightTon: Number((totalWeight / 1000).toFixed(2)),
        avgUtilization: Number(avgUtilization.toFixed(2)),
        productCount: productCount.length,
        vehicleCount: vehicleCount.length,
      },
    },
  })
}

async function generateEfficiencyReport(companyId: string, dateCondition?: ReturnType<typeof and>) {
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
    if (!loadPlan.vehicle) continue
    const vehicleId = loadPlan.vehicle.id
    if (!utilizationByVehicle[vehicleId]) {
      utilizationByVehicle[vehicleId] = {
        name: loadPlan.vehicle.name,
        loads: 0,
        avgUtilization: 0,
      }
    }
    utilizationByVehicle[vehicleId].loads++
    utilizationByVehicle[vehicleId].avgUtilization += Number(loadPlan.spaceUtilization || 0)
  }

  for (const key in utilizationByVehicle) {
    const vehicle = utilizationByVehicle[key]
    vehicle.avgUtilization = vehicle.loads > 0
      ? Number((vehicle.avgUtilization / vehicle.loads).toFixed(2))
      : 0
  }

  const overallAvg = allLoadPlans.length > 0
    ? Number((
      allLoadPlans.reduce((sum, lp) => sum + Number(lp.spaceUtilization || 0), 0) / allLoadPlans.length
    ).toFixed(2))
    : 0

  return NextResponse.json({
    success: true,
    data: {
      overallAvg,
      byVehicle: Object.values(utilizationByVehicle).sort((a, b) => b.loads - a.loads),
    },
  })
}

async function generateProductsReport(companyId: string) {
  const allProducts = await db.query.products.findMany({
    where: eq(products.companyId, companyId),
    columns: {
      category: true,
      weight: true,
      volume: true,
    },
  })

  const byCategory: Record<string, { count: number; totalWeight: number; totalVolume: number }> = {}

  for (const product of allProducts) {
    const category = String(product.category || 'generales')
    if (!byCategory[category]) {
      byCategory[category] = { count: 0, totalWeight: 0, totalVolume: 0 }
    }
    byCategory[category].count++
    byCategory[category].totalWeight += Number(product.weight || 0)
    byCategory[category].totalVolume += Number(product.volume || 0)
  }

  const rows = Object.entries(byCategory)
    .map(([category, data]) => ({
      category,
      count: data.count,
      totalWeight: Number(data.totalWeight.toFixed(2)),
      totalVolume: Number(data.totalVolume.toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    success: true,
    data: {
      totalProducts: allProducts.length,
      byCategory: rows,
    },
  })
}

async function generateVehiclesReport(companyId: string, dateCondition?: ReturnType<typeof and>) {
  const allVehicles = await db.query.vehicles.findMany({
    where: eq(vehicles.companyId, companyId),
  })

  const conditions = [eq(loadPlans.companyId, companyId)]
  if (dateCondition) conditions.push(dateCondition)

  const allLoadPlans = await db.query.loadPlans.findMany({
    where: and(...conditions),
  })

  const vehicleUsage = allVehicles
    .map(vehicle => {
      const vehicleLoads = allLoadPlans.filter(lp => lp.vehicleId === vehicle.id)
      const totalWeightKg = vehicleLoads.reduce((sum, lp) => sum + Number(lp.totalWeight || 0), 0)
      const avgUtilization = vehicleLoads.length > 0
        ? vehicleLoads.reduce((sum, lp) => sum + Number(lp.spaceUtilization || 0), 0) / vehicleLoads.length
        : 0

      return {
        id: vehicle.id,
        name: vehicle.name,
        plateNumber: vehicle.plateNumber,
        type: vehicle.type,
        totalLoads: vehicleLoads.length,
        totalWeightTon: Number((totalWeightKg / 1000).toFixed(2)),
        avgUtilization: Number(avgUtilization.toFixed(2)),
        isActive: Boolean(vehicle.isActive),
      }
    })
    .sort((a, b) => b.totalLoads - a.totalLoads)

  return NextResponse.json({
    success: true,
    data: {
      totalVehicles: allVehicles.length,
      activeVehicles: allVehicles.filter(v => v.isActive).length,
      vehicleUsage,
    },
  })
}

async function generateComplianceReport(companyId: string, dateCondition?: ReturnType<typeof and>) {
  const conditions = [eq(loadPlans.companyId, companyId)]
  if (dateCondition) conditions.push(dateCondition)

  const allLoadPlans = await db.query.loadPlans.findMany({
    where: and(...conditions),
  })

  const totalLoads = allLoadPlans.length
  const nom002Compliant = allLoadPlans.filter(lp => lp.nom002Compliant).length
  const nom012Compliant = allLoadPlans.filter(lp => lp.nom012Compliant).length
  const nom015Compliant = allLoadPlans.filter(lp => lp.nom015Compliant).length

  const percentage = (compliant: number) =>
    totalLoads > 0 ? Number(((compliant / totalLoads) * 100).toFixed(2)) : 100

  return NextResponse.json({
    success: true,
    data: {
      totalLoads,
      compliance: {
        nom002: { compliant: nom002Compliant, percentage: percentage(nom002Compliant) },
        nom012: { compliant: nom012Compliant, percentage: percentage(nom012Compliant) },
        nom015: { compliant: nom015Compliant, percentage: percentage(nom015Compliant) },
      },
      overallCompliance: totalLoads > 0
        ? Number((((nom002Compliant + nom012Compliant + nom015Compliant) / (totalLoads * 3)) * 100).toFixed(2))
        : 100,
    },
  })
}

async function generateHistoryReport(companyId: string) {
  const companyUsers = await db.query.users.findMany({
    where: eq(users.companyId, companyId),
    columns: { id: true, name: true, email: true },
  })

  const userIds = companyUsers.map(u => u.id)
  if (userIds.length === 0) {
    return NextResponse.json({ success: true, data: { reports: [] } })
  }

  const history = await db.query.reports.findMany({
    where: inArray(reports.generatedBy, userIds),
    with: {
      generatedByUser: {
        columns: { id: true, name: true, email: true },
      },
    },
    orderBy: desc(reports.generatedAt),
    limit: 100,
  })

  return NextResponse.json({
    success: true,
    data: {
      reports: history.map(item => ({
        id: item.id,
        type: item.type,
        format: item.format,
        fileUrl: item.fileUrl,
        generatedAt: item.generatedAt,
        generatedBy: item.generatedByUser?.name || item.generatedByUser?.email || 'Usuario',
      })),
    },
  })
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'summary'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const dateCondition = buildDateCondition(startDate, endDate)

    switch (type) {
      case 'summary':
        return await generateSummaryReport(auth.companyId, dateCondition)
      case 'efficiency':
        return await generateEfficiencyReport(auth.companyId, dateCondition)
      case 'products':
        return await generateProductsReport(auth.companyId)
      case 'vehicles':
        return await generateVehiclesReport(auth.companyId, dateCondition)
      case 'compliance':
        return await generateComplianceReport(auth.companyId, dateCondition)
      case 'history':
        return await generateHistoryReport(auth.companyId)
      default:
        return NextResponse.json(
          { error: 'Tipo de reporte no valido' },
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

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const body = await request.json()
    const { type, format, fileUrl } = body

    if (!type || !format) {
      return NextResponse.json(
        { error: 'Tipo y formato son requeridos' },
        { status: 400 }
      )
    }

    const allowedFormats = new Set(['pdf', 'csv', 'json'])
    if (!allowedFormats.has(String(format).toLowerCase())) {
      return NextResponse.json(
        { error: 'Formato no valido' },
        { status: 400 }
      )
    }

    const [newReport] = await db.insert(reports)
      .values({
        type: String(type),
        format: String(format).toLowerCase(),
        fileUrl: fileUrl ? String(fileUrl) : undefined,
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
