import { getServerSession } from 'next-auth'
import type { NextRequest } from 'next/server'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export type AuthContext = {
  userId: string
  companyId: string
  role: string
  isActive: boolean
}

export async function requireAuth(_request?: NextRequest): Promise<AuthContext> {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) throw new Error('UNAUTHORIZED')
  if (session.user.isActive === false) throw new Error('UNAUTHORIZED')

  return {
    userId: session.user.id,
    companyId: session.user.companyId,
    role: session.user.role,
    isActive: session.user.isActive,
  }
}
