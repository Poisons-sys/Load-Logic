import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { vehicles, loadPlans } from '@/db/schema'
import { and, desc, eq, lt } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

type Alert = {
  id: string
  message: string
  type: 'warning' | 'success' | 'info'
  vehicle?: string
}

/**
 * Alertas ligeras (sin tabla dedicada) calculadas desde datos reales.
 * - Vehículos no compatibles NOM-068 / NOM-012
 * - Planes "pendiente" con más de 7 días
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const alerts: Alert[] = []

    const nonCompliantVehicles = await db.query.vehicles.findMany({
      where: and(
        eq(vehicles.companyId, auth.companyId),
        eq(vehicles.isActive, true)
      ),
      orderBy: desc(vehicles.updatedAt),
    })

    for (const v of nonCompliantVehicles) {
      if (v.nom068Compliant === false) {
        alerts.push({
          id: `veh-nom068-${v.id}`,
          type: 'warning',
          message: 'Unidad con NOM-068 marcada como NO compatible',
          vehicle: `${v.name} (${v.plateNumber})`,
        })
      }
      if (v.nom012Compliant === false) {
        alerts.push({
          id: `veh-nom012-${v.id}`,
          type: 'warning',
          message: 'Unidad con NOM-012 marcada como NO compatible',
          vehicle: `${v.name} (${v.plateNumber})`,
        })
      }
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const stalePlans = await db.query.loadPlans.findMany({
      where: and(
        eq(loadPlans.companyId, auth.companyId),
        eq(loadPlans.status, 'pendiente'),
        lt(loadPlans.createdAt, sevenDaysAgo)
      ),
      orderBy: desc(loadPlans.createdAt),
      limit: 5,
    })

    for (const p of stalePlans) {
      alerts.push({
        id: `plan-stale-${p.id}`,
        type: 'info',
        message: `Plan pendiente hace más de 7 días: ${p.name}`,
      })
    }

    return NextResponse.json({ success: true, data: alerts.slice(0, 10) })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo alertas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
