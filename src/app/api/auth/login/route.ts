import { NextRequest, NextResponse } from 'next/server'

// Este endpoint ya no es necesario, NextAuth maneja el login automáticamente
// Pero lo dejamos como referencia para solicitudes REST

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // NextAuth maneja la autenticación a través de /api/auth/callback/credentials
    // Este endpoint es solo para referencia. El login real debe hacerse desde el cliente con:
    // await signIn('credentials', { email, password, redirect: false })

    return NextResponse.json(
      { 
        error: 'Use POST /api/auth/signin o signIn() desde el cliente',
        message: 'El login debe hacerse a través de NextAuth'
      },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error en login:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
