import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { vehicles, loadPlans, userAlertReads } from '@/db/schema'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'
import { isVehicleNom012Compliant } from '@/lib/nom012'

type Alert = {
  id: string
  message: string
  type: 'warning' | 'success' | 'info'
  vehicle?: string
  isRead?: boolean
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
      if (!isVehicleNom012Compliant(v)) {
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

    const limitedAlerts = alerts.slice(0, 10)
    const alertIds = limitedAlerts.map((a) => a.id)

    let readSet = new Set<string>()
    if (alertIds.length > 0) {
      const reads = await db.query.userAlertReads.findMany({
        where: and(
          eq(userAlertReads.userId, auth.userId),
          inArray(userAlertReads.alertId, alertIds)
        ),
      })
      readSet = new Set(reads.map((r) => String(r.alertId)))
    }

    return NextResponse.json({
      success: true,
      data: limitedAlerts.map((a) => ({
        ...a,
        isRead: readSet.has(a.id),
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo alertas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const body = await request.json().catch(() => ({}))
    const alertIdsRaw = Array.isArray(body?.alertIds) ? body.alertIds : []
    const alertIds: string[] = Array.from(
      new Set(
        alertIdsRaw
          .map((id: unknown) => String(id || '').trim())
          .filter((id: string) => id.length > 0)
      )
    )

    if (alertIds.length === 0) {
      return NextResponse.json({ error: 'alertIds es requerido' }, { status: 400 })
    }

    await db
      .insert(userAlertReads)
      .values(
        alertIds.map((alertId) => ({
          userId: auth.userId,
          alertId,
          readAt: new Date(),
        }))
      )
      .onConflictDoNothing()

    return NextResponse.json({
      success: true,
      message: 'Alertas marcadas como leidas',
      count: alertIds.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error marcando alertas como leidas:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
