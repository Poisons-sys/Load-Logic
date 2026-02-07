import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users, companies } from '@/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { requireAuth } from '@/lib/auth-server'

// GET - Listar todos los usuarios
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    // Solo admin puede ver todos los usuarios
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para ver todos los usuarios' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role')
    const isActive = searchParams.get('isActive')

    let conditions = [eq(users.companyId, auth.companyId)]

    if (role) {
      conditions.push(eq(users.role, role as any))
    }

    if (isActive !== null) {
      conditions.push(eq(users.isActive, isActive === 'true'))
    }

    const allUsers = await db.query.users.findMany({
      where: and(...conditions),
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
      orderBy: desc(users.createdAt),
    })

    return NextResponse.json({
      success: true,
      data: allUsers,
      count: allUsers.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo usuarios:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST - Crear nuevo usuario
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    // Solo admin puede crear usuarios
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para crear usuarios' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password, name, role } = body

    // Validaciones
    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'Email, contraseña, nombre y rol son requeridos' },
        { status: 400 }
      )
    }

    // Validar rol
    if (!['admin', 'operativo', 'supervisor'].includes(role)) {
      return NextResponse.json(
        { error: 'Rol no válido' },
        { status: 400 }
      )
    }

    // Verificar límite de usuarios
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, auth.companyId),
    })

    if (company) {
      const userCount = await db.query.users.findMany({
        where: and(
          eq(users.companyId, auth.companyId),
          eq(users.isActive, true)
        ),
      })

      if (userCount.length >= company.maxUsers) {
        return NextResponse.json(
          { error: `Límite de usuarios alcanzado (${company.maxUsers})` },
          { status: 403 }
        )
      }
    }

    // Verificar si el email ya existe
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'El email ya está registrado' },
        { status: 409 }
      )
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10)

    const [newUser] = await db.insert(users)
      .values({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: role as any,
        companyId: auth.companyId,
        isActive: true,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
        companyId: users.companyId,
      })

    return NextResponse.json({
      success: true,
      message: 'Usuario creado exitosamente',
      data: newUser,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error creando usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
