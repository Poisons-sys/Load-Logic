import { withAuth } from 'next-auth/middleware'

// Rutas públicas que no requieren autenticación
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)',
  ],
}

// Proxy que protege todas las rutas excepto /login
export default withAuth(
  function proxy() {
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
