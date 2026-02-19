import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { loadPlanTemplates } from '@/db/schema'
import { requireAuth } from '@/lib/auth-server'
import { loadPlanTemplateSchema, zodErrorMessage } from '@/lib/validation/load-plans'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)
    const template = await db.query.loadPlanTemplates.findFirst({
      where: and(eq(loadPlanTemplates.id, id), eq(loadPlanTemplates.companyId, auth.companyId)),
      with: {
        vehicle: true,
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
    })

    if (!template) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: template })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo plantilla:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)
    const existing = await db.query.loadPlanTemplates.findFirst({
      where: and(eq(loadPlanTemplates.id, id), eq(loadPlanTemplates.companyId, auth.companyId)),
    })
    if (!existing) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = loadPlanTemplateSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: zodErrorMessage(parsedBody.error) }, { status: 400 })
    }

    const { name, description, vehicleId, items, metadata } = parsedBody.data
    const [updated] = await db
      .update(loadPlanTemplates)
      .set({
        name,
        description,
        vehicleId: vehicleId ?? null,
        items,
        metadata: metadata ?? {},
        updatedAt: new Date(),
      })
      .where(and(eq(loadPlanTemplates.id, id), eq(loadPlanTemplates.companyId, auth.companyId)))
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Plantilla actualizada exitosamente',
      data: updated,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando plantilla:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)
    const existing = await db.query.loadPlanTemplates.findFirst({
      where: and(eq(loadPlanTemplates.id, id), eq(loadPlanTemplates.companyId, auth.companyId)),
    })
    if (!existing) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })
    }

    await db
      .delete(loadPlanTemplates)
      .where(and(eq(loadPlanTemplates.id, id), eq(loadPlanTemplates.companyId, auth.companyId)))

    return NextResponse.json({
      success: true,
      message: 'Plantilla eliminada exitosamente',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error eliminando plantilla:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
