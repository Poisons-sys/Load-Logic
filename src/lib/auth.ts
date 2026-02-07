import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { redirect } from 'next/navigation'

/**
 * Hook para obtener la sesión del usuario en Server Components
 * Redirige a /login si no hay sesión activa
 */
export async function getSession() {
  const session = await getServerSession(authOptions)
  
  if (!session) {
    redirect('/login')
  }
  
  return session
}

/**
 * Hook para obtener la sesión sin redirigir
 * Útil para páginas públicas que pueden mostrar diferente contenido si hay sesión
 */
export async function getSessionOptional() {
  return await getServerSession(authOptions)
}
