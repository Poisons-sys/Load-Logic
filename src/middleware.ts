import { withAuth } from 'next-auth/middleware'
import { NextRequest } from 'next/server'

// Rutas públicas que no requieren autenticación
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)',
  ],
}

// Middleware que protege todas las rutas excepto /login
export default withAuth(
  function middleware(req: NextRequest) {
    // Aquí puedes agregar lógica adicional si es necesaria
    return undefined
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/login',
    },
  }
)
