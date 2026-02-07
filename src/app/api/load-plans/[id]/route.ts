import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { loadPlans, loadPlanItems, vehicles, products } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

// GET - Obtener plan de carga por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)

    const loadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
        items: { with: { product: true } },
        instructions: true,
      },
    })

    if (!loadPlan) {
      return NextResponse.json({ error: 'Plan de carga no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: loadPlan })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo plan de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// PUT - Actualizar plan de carga
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)

    const existingLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
    })

    if (!existingLoadPlan) {
      return NextResponse.json({ error: 'Plan de carga no encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const { name, description, status, items } = body

    // Si se proporcionan nuevos items, recalcular totales
    let totalWeight = existingLoadPlan.totalWeight
    let totalVolume = existingLoadPlan.totalVolume
    let spaceUtilization = existingLoadPlan.spaceUtilization

    if (items && Array.isArray(items) && items.length > 0) {
      // ✅ FIX: vehicleId puede ser null, y Drizzle no permite eq(column, null)
      if (!existingLoadPlan.vehicleId) {
        return NextResponse.json(
          { error: 'Plan de carga sin vehículo asignado' },
          { status: 400 }
        )
      }

      const vehicle = await db.query.vehicles.findFirst({
        where: eq(vehicles.id, existingLoadPlan.vehicleId),
      })

      if (!vehicle) {
        return NextResponse.json({ error: 'Vehículo no encontrado' }, { status: 404 })
      }

      // Eliminar items existentes
      await db.delete(loadPlanItems).where(eq(loadPlanItems.loadPlanId, id))

      // Crear nuevos items
      totalWeight = 0
      totalVolume = 0

      for (const item of items) {
        const product = await db.query.products.findFirst({
          where: and(eq(products.id, item.productId), eq(products.companyId, auth.companyId)),
        })

        if (product) {
          totalWeight += product.weight * item.quantity
          totalVolume += product.volume * item.quantity

          await db.insert(loadPlanItems).values({
            loadPlanId: id,
            productId: item.productId,
            quantity: item.quantity,
          })
        }
      }

      // ✅ Evitar NaN / Infinity si maxVolume llegara 0/null (por schema debería ser number)
      const maxVol = Number((vehicle as any).maxVolume ?? 0)
      spaceUtilization = maxVol > 0 ? (totalVolume / maxVol) * 100 : 0
    }

    await db
      .update(loadPlans)
      .set({
        name: name || existingLoadPlan.name,
        description: description !== undefined ? description : existingLoadPlan.description,
        status: status || existingLoadPlan.status,
        totalWeight,
        totalVolume,
        spaceUtilization,
        updatedAt: new Date(),
      })
      .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
      .returning()

    // Obtener el plan completo actualizado
    const completeLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        items: { with: { product: true } },
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Plan de carga actualizado exitosamente',
      data: completeLoadPlan,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando plan de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE - Eliminar plan de carga
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)

    // Solo admin o el creador puede eliminar
    const existingLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
    })

    if (!existingLoadPlan) {
      return NextResponse.json({ error: 'Plan de carga no encontrado' }, { status: 404 })
    }

    if (auth.role !== 'admin' && existingLoadPlan.createdBy !== auth.userId) {
      return NextResponse.json(
        { error: 'No tiene permisos para eliminar este plan de carga' },
        { status: 403 }
      )
    }

    // Eliminar items primero (cascade)
    await db.delete(loadPlanItems).where(eq(loadPlanItems.loadPlanId, id))

    // Eliminar plan de carga
    await db
      .delete(loadPlans)
      .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))

    return NextResponse.json({
      success: true,
      message: 'Plan de carga eliminado exitosamente',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error eliminando plan de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
