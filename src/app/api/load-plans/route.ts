import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { loadPlans, loadPlanItems, products, vehicles } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { optimizeLoad } from '@/lib/optimization'
import { requireAuth } from '@/lib/auth-server'

// GET - Listar todos los planes de carga
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const vehicleId = searchParams.get('vehicleId')

    let conditions = [eq(loadPlans.companyId, auth.companyId)]

    if (status) {
      conditions.push(eq(loadPlans.status, status as any))
    }

    if (vehicleId) {
      conditions.push(eq(loadPlans.vehicleId, vehicleId))
    }

    const allLoadPlans = await db.query.loadPlans.findMany({
      where: and(...conditions),
      with: {
        vehicle: true,
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          with: {
            product: true,
          },
        },
      },
      orderBy: desc(loadPlans.createdAt),
    })

    const normalized = allLoadPlans.map((p) => {
      const createdAt = p.createdAt ? new Date(p.createdAt).toISOString() : ''
      return {
        id: p.id,
        name: p.name,
        vehicle: p.vehicle?.name || '—',
        vehiclePlate: p.vehicle?.plateNumber || '',
        status: p.status,
        totalWeight: p.totalWeight || 0,
        utilization: Math.round((p.spaceUtilization || 0) * 1),
        createdAt,
        createdBy: p.createdByUser?.name || '',
        items: p.items?.length || 0,
        nomCompliant: Boolean(p.nom002Compliant && p.nom012Compliant && p.nom015Compliant),
      }
    })

    return NextResponse.json({
      success: true,
      data: normalized,
      count: normalized.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo planes de carga:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Crear nuevo plan de carga
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const body = await request.json()
    const { name, description, vehicleId, items } = body

    // Validaciones
    if (!name || !vehicleId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Nombre, vehículo y items son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que el vehículo existe y pertenece a la empresa
    const vehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.companyId, auth.companyId)
      ),
    })

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    // Verificar que todos los productos existen
    const productIds = items.map((item: any) => item.productId)
    const existingProducts = await db.query.products.findMany({
      where: and(
        eq(products.companyId, auth.companyId),
        eq(products.isActive, true)
      ),
    })

    const validProductIds = new Set(existingProducts.map(p => p.id))
    const invalidProductIds = productIds.filter((id: string) => !validProductIds.has(id))

    if (invalidProductIds.length > 0) {
      return NextResponse.json(
        { error: `Productos no válidos: ${invalidProductIds.join(', ')}` },
        { status: 400 }
      )
    }

    // Calcular totales
    let totalWeight = 0
    let totalVolume = 0

    for (const item of items) {
      const product = existingProducts.find(p => p.id === item.productId)
      if (product) {
        totalWeight += product.weight * item.quantity
        totalVolume += product.volume * item.quantity
      }
    }

    // Validar límites del vehículo
    if (totalWeight > vehicle.maxWeight) {
      return NextResponse.json(
        { error: `El peso total (${totalWeight}kg) excede la capacidad del vehículo (${vehicle.maxWeight}kg)` },
        { status: 400 }
      )
    }

    if (totalVolume > vehicle.maxVolume) {
      return NextResponse.json(
        { error: `El volumen total (${totalVolume}m³) excede la capacidad del vehículo (${vehicle.maxVolume}m³)` },
        { status: 400 }
      )
    }

    // Calcular utilización del espacio
    const spaceUtilization = (totalVolume / vehicle.maxVolume) * 100

    // Crear plan de carga
    const [newLoadPlan] = await db.insert(loadPlans)
      .values({
        name,
        description,
        vehicleId,
        totalWeight,
        totalVolume,
        spaceUtilization,
        weightDistribution: { front: 0, center: 0, rear: 0 }, // Se calculará en la optimización
        status: 'pendiente',
        nom002Compliant: true,
        nom012Compliant: vehicle.nom012Compliant,
        nom015Compliant: true,
        companyId: auth.companyId,
        createdBy: auth.userId,
      })
      .returning()

    // Crear items del plan de carga
    for (const item of items) {
      await db.insert(loadPlanItems)
        .values({
          loadPlanId: newLoadPlan.id,
          productId: item.productId,
          quantity: item.quantity,
        })
    }

    // Obtener el plan completo con relaciones
    const completeLoadPlan = await db.query.loadPlans.findFirst({
      where: eq(loadPlans.id, newLoadPlan.id),
      with: {
        vehicle: true,
        items: {
          with: {
            product: true,
          },
        },
        createdByUser: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Plan de carga creado exitosamente',
      data: completeLoadPlan,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error creando plan de carga:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
