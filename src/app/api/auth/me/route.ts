import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.userId),
      with: {
        company: true,
      },
    })

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Usuario no encontrado o desactivado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          isActive: user.isActive,
        },
        company: user.company ? { id: user.company.id, name: user.company.name } : undefined,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo usuario:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const body = await request.json()
    const { name, email } = body

    // Verificar si el email ya está en uso por otro usuario
    if (email) {
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
      })

      if (existingUser && existingUser.id !== auth.userId) {
        return NextResponse.json(
          { error: 'El email ya está en uso' },
          { status: 409 }
        )
      }
    }

    const [updatedUser] = await db.update(users)
      .set({
        name: name || undefined,
        email: email ? email.toLowerCase() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.userId))
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Perfil actualizado exitosamente',
      data: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando usuario:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
