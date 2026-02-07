import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/auth-server'

// GET - Obtener usuario por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    const { id } = await params

    // Solo admin puede ver otros usuarios, los demás solo su propio perfil
    if (auth.role !== 'admin' && auth.userId !== id) {
      return NextResponse.json(
        { error: 'No tiene permisos para ver este usuario' },
        { status: 403 }
      )
    }

    const user = await db.query.users.findFirst({
      where: and(
        eq(users.id, id),
        eq(users.companyId, auth.companyId)
      ),
      columns: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        companyId: true,
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: user,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// PUT - Actualizar usuario
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    const { id } = await params

    // Solo admin puede actualizar otros usuarios, los demás solo su propio perfil
    if (auth.role !== 'admin' && auth.userId !== id) {
      return NextResponse.json(
        { error: 'No tiene permisos para actualizar este usuario' },
        { status: 403 }
      )
    }

    const existingUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, id),
        eq(users.companyId, auth.companyId)
      ),
    })

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { name, email, role, isActive, password } = body

    // Solo admin puede cambiar rol y estado
    if ((role || isActive !== undefined) && auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para cambiar rol o estado' },
        { status: 403 }
      )
    }

    // Verificar si el email ya está en uso
    if (email && email !== existingUser.email) {
      const emailExists = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
      })

      if (emailExists) {
        return NextResponse.json(
          { error: 'El email ya está en uso' },
          { status: 409 }
        )
      }
    }

    // Preparar datos de actualización
    const updateData: any = {
      name: name || existingUser.name,
      email: email ? email.toLowerCase() : existingUser.email,
      updatedAt: new Date(),
    }

    if (role && auth.role === 'admin') {
      updateData.role = role
    }

    if (isActive !== undefined && auth.role === 'admin') {
      updateData.isActive = isActive
    }

    if (password) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    const [updatedUser] = await db.update(users)
      .set(updateData)
      // 👇 importante: id + companyId para no tocar usuarios de otra empresa
      .where(and(
        eq(users.id, id),
        eq(users.companyId, auth.companyId)
      ))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        companyId: users.companyId,
      })

    return NextResponse.json({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: updatedUser,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE - Eliminar usuario (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    const { id } = await params

    // Solo admin puede eliminar usuarios
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para eliminar usuarios' },
        { status: 403 }
      )
    }

    // No permitir eliminarse a sí mismo
    if (auth.userId === id) {
      return NextResponse.json(
        { error: 'No puede eliminar su propio usuario' },
        { status: 400 }
      )
    }

    const existingUser = await db.query.users.findFirst({
      where: and(
        eq(users.id, id),
        eq(users.companyId, auth.companyId)
      ),
    })

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    // Soft delete
    await db.update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(
        eq(users.id, id),
        eq(users.companyId, auth.companyId)
      ))

    return NextResponse.json({
      success: true,
      message: 'Usuario eliminado exitosamente',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error eliminando usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
