import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  loadPlanItems,
  loadPlanPlacements,
  loadPlanVersions,
  loadPlans,
  loadingInstructions,
  products,
  vehicles,
} from '@/db/schema'
import { requireAuth } from '@/lib/auth-server'
import { updateLoadPlanSchema, zodErrorMessage } from '@/lib/validation/load-plans'

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
        placements: {
          orderBy: (placements, { asc }) => [asc(placements.loadingOrder)],
          with: {
            product: true,
          },
        },
        instructions: {
          orderBy: (instructions, { asc }) => [asc(instructions.step)],
        },
        versions: {
          orderBy: (versions, { desc }) => [desc(versions.version)],
        },
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

    const rawBody = await request.json().catch(() => null)
    const parsedBody = updateLoadPlanSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: zodErrorMessage(parsedBody.error) },
        { status: 400 }
      )
    }

    const { name, description, status, items } = parsedBody.data

    let totalWeight = existingLoadPlan.totalWeight
    let totalVolume = existingLoadPlan.totalVolume
    let spaceUtilization = existingLoadPlan.spaceUtilization
    const nextName = name || existingLoadPlan.name
    const nextDescription = description !== undefined ? description : existingLoadPlan.description
    const nextStatus = status || existingLoadPlan.status

    if (items && Array.isArray(items) && items.length > 0) {
      if (!existingLoadPlan.vehicleId) {
        return NextResponse.json(
          { error: 'Plan de carga sin vehiculo asignado' },
          { status: 400 }
        )
      }

      const vehicle = await db.query.vehicles.findFirst({
        where: eq(vehicles.id, existingLoadPlan.vehicleId),
      })

      if (!vehicle) {
        return NextResponse.json({ error: 'Vehiculo no encontrado' }, { status: 404 })
      }

      const allProducts = await db.query.products.findMany({
        where: eq(products.companyId, auth.companyId),
      })
      const productsById = new Map(allProducts.map((p) => [p.id, p] as const))

      totalWeight = 0
      totalVolume = 0
      const nextItemsRows: Array<{ loadPlanId: string; productId: string; quantity: number; routeStop: number }> = []

      for (const item of items) {
        const product = productsById.get(item.productId)
        if (!product) continue

        totalWeight += product.weight * item.quantity
        totalVolume += product.volume * item.quantity
        nextItemsRows.push({
          loadPlanId: id,
          productId: item.productId,
          quantity: item.quantity,
          routeStop: item.routeStop ?? 1,
        })
      }

      const maxVol = Number(vehicle.maxVolume ?? 0)
      spaceUtilization = maxVol > 0 ? (totalVolume / maxVol) * 100 : 0

      await db.transaction(async (tx) => {
        await tx.delete(loadPlanPlacements).where(eq(loadPlanPlacements.loadPlanId, id))
        await tx.delete(loadPlanVersions).where(eq(loadPlanVersions.loadPlanId, id))
        await tx.delete(loadingInstructions).where(eq(loadingInstructions.loadPlanId, id))
        await tx.delete(loadPlanItems).where(eq(loadPlanItems.loadPlanId, id))
        if (nextItemsRows.length > 0) {
          await tx.insert(loadPlanItems).values(nextItemsRows)
        }

        await tx
          .update(loadPlans)
          .set({
            name: nextName,
            description: nextDescription,
            status: nextStatus,
            totalWeight,
            totalVolume,
            spaceUtilization,
            updatedAt: new Date(),
          })
          .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
      })
    } else {
      await db
        .update(loadPlans)
        .set({
          name: nextName,
          description: nextDescription,
          status: nextStatus,
          totalWeight,
          totalVolume,
          spaceUtilization,
          updatedAt: new Date(),
        })
        .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
    }

    const completeLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        items: { with: { product: true } },
        placements: {
          orderBy: (placements, { asc }) => [asc(placements.loadingOrder)],
          with: {
            product: true,
          },
        },
        instructions: {
          orderBy: (instructions, { asc }) => [asc(instructions.step)],
        },
        versions: {
          orderBy: (versions, { desc }) => [desc(versions.version)],
        },
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

    await db.transaction(async (tx) => {
      await tx.delete(loadPlanPlacements).where(eq(loadPlanPlacements.loadPlanId, id))
      await tx.delete(loadPlanVersions).where(eq(loadPlanVersions.loadPlanId, id))
      await tx.delete(loadingInstructions).where(eq(loadingInstructions.loadPlanId, id))
      await tx.delete(loadPlanItems).where(eq(loadPlanItems.loadPlanId, id))
      await tx
        .delete(loadPlans)
        .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
    })

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
