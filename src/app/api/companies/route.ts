import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { companies } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

// GET - Obtener información de la empresa
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para ver información de la empresa' },
        { status: 403 }
      )
    }

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, auth.companyId),
    })

    if (!company) {
      return NextResponse.json(
        { error: 'Empresa no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: company,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo empresa:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PUT - Actualizar información de la empresa
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para actualizar información de la empresa' },
        { status: 403 }
      )
    }

    const existingCompany = await db.query.companies.findFirst({
      where: eq(companies.id, auth.companyId),
    })

    if (!existingCompany) {
      return NextResponse.json(
        { error: 'Empresa no encontrada' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { name, address, phone, email, maxUsers } = body

    const [updatedCompany] = await db.update(companies)
      .set({
        name: name || existingCompany.name,
        address: address !== undefined ? address : existingCompany.address,
        phone: phone !== undefined ? phone : existingCompany.phone,
        email: email !== undefined ? email : existingCompany.email,
        maxUsers: maxUsers || existingCompany.maxUsers,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, auth.companyId))
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Empresa actualizada exitosamente',
      data: updatedCompany,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando empresa:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
