import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { vehicles } from '@/db/schema'
import { eq, and, like, desc } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

// GET - Listar todos los vehículos
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const type = searchParams.get('type')
    const hasRefrigeration = searchParams.get('hasRefrigeration')

    // Por defecto: solo vehículos activos de la empresa
    const baseWhere = and(
      eq(vehicles.companyId, auth.companyId),
      eq(vehicles.isActive, true)
    )

    let query = db.query.vehicles.findMany({
      where: baseWhere,
      orderBy: desc(vehicles.createdAt),
    })

    // Aplicar filtros
    if (search) {
      query = db.query.vehicles.findMany({
        where: and(
          baseWhere,
          like(vehicles.name, `%${search}%`)
        ),
        orderBy: desc(vehicles.createdAt),
      })
    }

    if (type) {
      query = db.query.vehicles.findMany({
        where: and(
          baseWhere,
          eq(vehicles.type, type as any)
        ),
        orderBy: desc(vehicles.createdAt),
      })
    }

    if (hasRefrigeration !== null) {
      query = db.query.vehicles.findMany({
        where: and(
          baseWhere,
          eq(vehicles.hasRefrigeration, hasRefrigeration === 'true')
        ),
        orderBy: desc(vehicles.createdAt),
      })
    }

    const allVehicles = await query

    return NextResponse.json({
      success: true,
      data: allVehicles,
      count: allVehicles.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo vehículos:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST - Crear nuevo vehículo
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const body = await request.json()
    const {
      name,
      type,
      plateNumber,
      internalLength,
      internalWidth,
      internalHeight,
      maxWeight,
      hasRefrigeration,
      minTemperature,
      maxTemperature,
      axles,
      frontAxleMaxWeight,
      rearAxleMaxWeight,
      nom012Compliant,
      nom068Compliant,
      hazardousMaterialAuthorized,
    } = body

    // Validaciones
    if (!name || !type || !plateNumber || !internalLength || !internalWidth || !internalHeight || !maxWeight) {
      return NextResponse.json(
        { error: 'Nombre, tipo, placas, dimensiones y peso máximo son requeridos' },
        { status: 400 }
      )
    }

    // Verificar si la placa ya existe
    const existingVehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.companyId, auth.companyId),
        eq(vehicles.plateNumber, plateNumber.toUpperCase())
      ),
    })

    if (existingVehicle) {
      return NextResponse.json(
        { error: 'Ya existe un vehículo con esa placa' },
        { status: 409 }
      )
    }

    // Calcular volumen máximo
    const maxVolume = (internalLength * internalWidth * internalHeight) / 1000000 // en m³

    // Validar NOM-012 según número de ejes
    const axlesCount = axles || 2
    const maxWeightsByAxles: Record<number, number> = {
      2: 17000,
      3: 26000,
      4: 36000,
      5: 43000,
      6: 48000,
      7: 50000,
      8: 52000,
      9: 54000,
    }

    const isNom012Compliant = maxWeight <= (maxWeightsByAxles[axlesCount] || 36000)

    const [newVehicle] = await db.insert(vehicles)
      .values({
        name,
        type: type as any,
        plateNumber: plateNumber.toUpperCase(),
        internalLength,
        internalWidth,
        internalHeight,
        maxWeight,
        maxVolume,
        hasRefrigeration: hasRefrigeration || false,
        minTemperature,
        maxTemperature,
        axles: axlesCount,
        frontAxleMaxWeight: frontAxleMaxWeight || 7000,
        rearAxleMaxWeight: rearAxleMaxWeight || 17000,
        nom012Compliant: nom012Compliant !== undefined ? nom012Compliant : isNom012Compliant,
        nom068Compliant: nom068Compliant !== undefined ? nom068Compliant : true,
        hazardousMaterialAuthorized: hazardousMaterialAuthorized || false,
        companyId: auth.companyId,
        isActive: true,
      })
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Vehículo creado exitosamente',
      data: newVehicle,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error creando vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
