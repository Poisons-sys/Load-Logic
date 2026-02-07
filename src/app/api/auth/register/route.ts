import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { users, companies } from '@/db/schema'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      email, 
      password, 
      name, 
      companyName, 
      companyRfc, 
      companyAddress, 
      companyPhone 
    } = body

    // Validar campos requeridos
    if (!email || !password || !name || !companyName || !companyRfc) {
      return NextResponse.json(
        { error: 'Todos los campos requeridos deben completarse' },
        { status: 400 }
      )
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

    // Verificar si el RFC ya existe
    const existingCompany = await db.query.companies.findFirst({
      where: eq(companies.rfc, companyRfc),
    })

    if (existingCompany) {
      return NextResponse.json(
        { error: 'El RFC de la empresa ya está registrado' },
        { status: 409 }
      )
    }

    // Crear empresa
    const [newCompany] = await db.insert(companies)
      .values({
        name: companyName,
        rfc: companyRfc,
        address: companyAddress,
        phone: companyPhone,
        licenseType: 'matriz',
        maxUsers: 10,
        isActive: true,
      })
      .returning()

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10)

    // Crear usuario administrador
    const [newUser] = await db.insert(users)
      .values({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role: 'admin',
        companyId: newCompany.id,
        isActive: true,
      })
      .returning()

    // Generar token JWT
    const token = jwt.sign(
      {
        userId: newUser.id,
        email: newUser.email,
        role: newUser.role,
        companyId: newUser.companyId,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    return NextResponse.json({
      success: true,
      message: 'Registro exitoso',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          companyId: newUser.companyId,
        },
        company: newCompany,
        token,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('Error en registro:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
