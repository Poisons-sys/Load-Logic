import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'your-secret-key'

export interface TokenData {
  userId: string
  email: string
  role: string
  companyId: string
}

// Verificar token JWT y extraer datos del usuario
export async function verifyToken(request: NextRequest): Promise<TokenData | null> {
  const authHeader = request.headers.get('authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.split(' ')[1]

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenData
    return decoded
  } catch {
    return null
  }
}

// Verificar si el usuario tiene rol de administrador
export function isAdmin(tokenData: TokenData | null): boolean {
  return tokenData?.role === 'admin'
}

// Verificar si el usuario tiene permisos para acceder a un recurso
export function hasPermission(
  tokenData: TokenData | null,
  requiredRole: string | string[]
): boolean {
  if (!tokenData) return false
  
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(tokenData.role)
  }
  
  return tokenData.role === requiredRole
}

// Verificar si el usuario puede modificar un recurso (propietario o admin)
export function canModify(
  tokenData: TokenData | null,
  resourceOwnerId: string
): boolean {
  if (!tokenData) return false
  if (tokenData.role === 'admin') return true
  return tokenData.userId === resourceOwnerId
}

// Respuesta de error estandarizada
export function errorResponse(message: string, status: number = 500) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

// Respuesta exitosa estandarizada
export function successResponse(data: any, message?: string, status: number = 200) {
  return new Response(
    JSON.stringify({
      success: true,
      message,
      data,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

// Validar campos requeridos
export function validateRequiredFields(
  body: any,
  requiredFields: string[]
): { valid: boolean; missing: string[] } {
  const missing = requiredFields.filter(field => {
    const value = body[field]
    return value === undefined || value === null || value === ''
  })

  return {
    valid: missing.length === 0,
    missing,
  }
}

// Paginación
export function getPaginationParams(request: NextRequest): { page: number; limit: number } {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  return {
    page: Math.max(1, page),
    limit: Math.min(100, Math.max(1, limit)),
  }
}

// Calcular offset para paginación SQL
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit
}

// Formatear respuesta paginada
export function paginatedResponse(
  data: any[],
  total: number,
  page: number,
  limit: number
) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  }
}
