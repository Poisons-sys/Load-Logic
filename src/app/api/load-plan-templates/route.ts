import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { loadPlanTemplates } from '@/db/schema'
import { requireAuth } from '@/lib/auth-server'
import { loadPlanTemplateSchema, zodErrorMessage } from '@/lib/validation/load-plans'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const { searchParams } = new URL(request.url)
    const vehicleId = searchParams.get('vehicleId')

    const conditions = [eq(loadPlanTemplates.companyId, auth.companyId)]
    if (vehicleId) {
      conditions.push(eq(loadPlanTemplates.vehicleId, vehicleId))
    }

    const templates = await db.query.loadPlanTemplates.findMany({
      where: and(...conditions),
      with: {
        vehicle: true,
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
      orderBy: desc(loadPlanTemplates.updatedAt),
    })

    return NextResponse.json({
      success: true,
      data: templates,
      count: templates.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo plantillas de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const rawBody = await request.json().catch(() => null)
    const parsedBody = loadPlanTemplateSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json({ error: zodErrorMessage(parsedBody.error) }, { status: 400 })
    }

    const { name, description, vehicleId, items, metadata } = parsedBody.data

    const [created] = await db
      .insert(loadPlanTemplates)
      .values({
        name,
        description,
        companyId: auth.companyId,
        vehicleId: vehicleId ?? null,
        items,
        metadata: metadata ?? {},
        createdBy: auth.userId,
      })
      .returning()

    return NextResponse.json(
      {
        success: true,
        message: 'Plantilla creada exitosamente',
        data: created,
      },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error creando plantilla de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
