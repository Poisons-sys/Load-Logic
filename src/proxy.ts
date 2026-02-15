import { withAuth } from 'next-auth/middleware'
import { NextRequest } from 'next/server'

// Rutas públicas que no requieren autenticación
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)',
  ],
}

// Proxy que protege todas las rutas excepto /login
export default withAuth(
  function proxy(_req: NextRequest) {
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
