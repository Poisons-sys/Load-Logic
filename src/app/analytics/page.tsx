'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { BarChart3, TrendingUp, Package, Truck, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type MonthlyPoint = {
  month: string
  loads: number
  efficiency: number
}

type TopCategory = {
  name: string
  count: number
  percentage: number
}

type LoadPlanListItem = {
  id: string
  utilization: number
  totalWeight: number
  createdAt: string
  vehicle: string
}

function toMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function toMonthLabel(date: Date) {
  return date.toLocaleString('es-MX', { month: 'short' }).replace('.', '')
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [summary, setSummary] = useState({
    totalLoads: 0,
    optimizedLoads: 0,
    avgUtilization: 0,
  })

  const [vehicles, setVehicles] = useState({
    activeVehicles: 0,
    vehicleUsage: [] as Array<{ name: string; totalLoads: number }>,
  })

  const [products, setProducts] = useState({
    byCategory: [] as Array<{ category: string; count: number }>,
  })

  const [compliance, setCompliance] = useState({
    nom012: 100,
    nom015: 100,
    nom002: 100,
    overall: 100,
  })

  const [plans, setPlans] = useState<LoadPlanListItem[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const [
          summaryRes,
          vehiclesRes,
          productsRes,
          complianceRes,
          plansRes,
        ] = await Promise.all([
          fetch('/api/reports?type=summary', { cache: 'no-store' }),
          fetch('/api/reports?type=vehicles', { cache: 'no-store' }),
          fetch('/api/reports?type=products', { cache: 'no-store' }),
          fetch('/api/reports?type=compliance', { cache: 'no-store' }),
          fetch('/api/load-plans', { cache: 'no-store' }),
        ])

        const [
          summaryJson,
          vehiclesJson,
          productsJson,
          complianceJson,
          plansJson,
        ] = await Promise.all([
          summaryRes.json(),
          vehiclesRes.json(),
          productsRes.json(),
          complianceRes.json(),
          plansRes.json(),
        ])

        if (!summaryRes.ok) throw new Error(summaryJson?.error || 'No se pudo cargar resumen')
        if (!vehiclesRes.ok) throw new Error(vehiclesJson?.error || 'No se pudo cargar unidades')
        if (!productsRes.ok) throw new Error(productsJson?.error || 'No se pudo cargar productos')
        if (!complianceRes.ok) throw new Error(complianceJson?.error || 'No se pudo cargar cumplimiento')
        if (!plansRes.ok) throw new Error(plansJson?.error || 'No se pudo cargar planes')
        if (cancelled) return

        setSummary({
          totalLoads: Number(summaryJson?.data?.summary?.totalLoads || 0),
          optimizedLoads: Number(summaryJson?.data?.summary?.optimizedLoads || 0),
          avgUtilization: Number(summaryJson?.data?.summary?.avgUtilization || 0),
        })

        setVehicles({
          activeVehicles: Number(vehiclesJson?.data?.activeVehicles || 0),
          vehicleUsage: (vehiclesJson?.data?.vehicleUsage || []).map((v: any) => ({
            name: String(v.name || '-'),
            totalLoads: Number(v.totalLoads || 0),
          })),
        })

        setProducts({
          byCategory: (productsJson?.data?.byCategory || []).map((c: any) => ({
            category: String(c.category || 'generales'),
            count: Number(c.count || 0),
          })),
        })

        setCompliance({
          nom012: Number(complianceJson?.data?.compliance?.nom012?.percentage || 100),
          nom015: Number(complianceJson?.data?.compliance?.nom015?.percentage || 100),
          nom002: Number(complianceJson?.data?.compliance?.nom002?.percentage || 100),
          overall: Number(complianceJson?.data?.overallCompliance || 100),
        })

        const loadPlans = (plansJson?.data || []).map((p: any) => ({
          id: String(p.id || ''),
          utilization: Number(p.utilization || 0),
          totalWeight: Number(p.totalWeight || 0),
          createdAt: String(p.createdAt || ''),
          vehicle: String(p.vehicle || '-'),
        }))
        setPlans(loadPlans)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando analisis')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  const now = useMemo(() => new Date(), [])
  const thisMonthKey = toMonthKey(now)
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthKey = toMonthKey(prevMonth)

  const loadsThisMonth = plans.filter(p => {
    const d = new Date(p.createdAt)
    return toMonthKey(d) === thisMonthKey
  })

  const loadsPrevMonth = plans.filter(p => {
    const d = new Date(p.createdAt)
    return toMonthKey(d) === prevMonthKey
  })

  const thisMonthCount = loadsThisMonth.length
  const prevMonthCount = loadsPrevMonth.length
  const thisMonthEfficiency = thisMonthCount > 0
    ? loadsThisMonth.reduce((s, p) => s + p.utilization, 0) / thisMonthCount
    : 0
  const prevMonthEfficiency = prevMonthCount > 0
    ? loadsPrevMonth.reduce((s, p) => s + p.utilization, 0) / prevMonthCount
    : 0

  const loadsDelta = prevMonthCount > 0
    ? ((thisMonthCount - prevMonthCount) / prevMonthCount) * 100
    : 0

  const efficiencyDelta = prevMonthEfficiency > 0
    ? ((thisMonthEfficiency - prevMonthEfficiency) / prevMonthEfficiency) * 100
    : 0

  const monthlyData = useMemo<MonthlyPoint[]>(() => {
    const buckets: Record<string, { date: Date; loads: number; utilSum: number }> = {}

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = toMonthKey(d)
      buckets[key] = { date: d, loads: 0, utilSum: 0 }
    }

    for (const plan of plans) {
      const d = new Date(plan.createdAt)
      const key = toMonthKey(d)
      if (!buckets[key]) continue
      buckets[key].loads += 1
      buckets[key].utilSum += plan.utilization
    }

    return Object.values(buckets).map((bucket) => ({
      month: toMonthLabel(bucket.date),
      loads: bucket.loads,
      efficiency: bucket.loads > 0 ? Number((bucket.utilSum / bucket.loads).toFixed(1)) : 0,
    }))
  }, [plans, now])

  const topCategories = useMemo<TopCategory[]>(() => {
    const rows = [...products.byCategory].sort((a, b) => b.count - a.count).slice(0, 5)
    const total = rows.reduce((sum, row) => sum + row.count, 0)
    return rows.map((row) => ({
      name: row.category,
      count: row.count,
      percentage: total > 0 ? Math.round((row.count / total) * 100) : 0,
    }))
  }, [products.byCategory])

  const totalLoadsTopCategories = topCategories.reduce((sum, row) => sum + row.count, 0)
  const avgWeightTon = plans.length > 0
    ? plans.reduce((sum, plan) => sum + plan.totalWeight, 0) / plans.length / 1000
    : 0
  const maxWeightTon = plans.length > 0
    ? Math.max(...plans.map(p => p.totalWeight)) / 1000
    : 0
  const minWeightTon = plans.length > 0
    ? Math.min(...plans.map(p => p.totalWeight)) / 1000
    : 0

  if (loading) {
    return <div className="p-6">Cargando analisis...</div>
  }

  if (error) {
    return <div className="p-6 text-red-600">{error}</div>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analisis</h1>
        <p className="text-gray-500">Metricas y estadisticas de operaciones</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cargas este mes</p>
                <p className="text-3xl font-bold">{thisMonthCount}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              {loadsDelta >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-600 mr-1" />
              )}
              <span className={`text-sm ${loadsDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {loadsDelta >= 0 ? '+' : ''}{loadsDelta.toFixed(1)}%
              </span>
              <span className="text-sm text-gray-500 ml-2">vs mes anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Eficiencia promedio</p>
                <p className="text-3xl font-bold">{summary.avgUtilization.toFixed(1)}%</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              {efficiencyDelta >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-600 mr-1" />
              )}
              <span className={`text-sm ${efficiencyDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {efficiencyDelta >= 0 ? '+' : ''}{efficiencyDelta.toFixed(1)}%
              </span>
              <span className="text-sm text-gray-500 ml-2">vs mes anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Unidades activas</p>
                <p className="text-3xl font-bold">{vehicles.activeVehicles}</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-lg">
                <Truck className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <span className="text-sm text-gray-500">{summary.optimizedLoads} planes optimizados</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cumplimiento NOM</p>
                <p className="text-3xl font-bold">{compliance.overall.toFixed(1)}%</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <span className="text-sm text-gray-500">{summary.totalLoads} cargas evaluadas</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Rendimiento Mensual
            </CardTitle>
            <CardDescription>Cargas procesadas y eficiencia promedio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {monthlyData.map((data) => (
                <div key={data.month} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{data.month}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">{data.loads} cargas</span>
                      <span className="text-sm text-blue-600">{data.efficiency}% ef.</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, data.efficiency))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorias Mas Transportadas</CardTitle>
            <CardDescription>Distribucion por categoria de producto</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topCategories.map((category) => (
                <div key={category.name} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-600" />
                    <span className="font-medium">{category.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{category.count} productos</span>
                    <Badge variant="outline">{category.percentage}%</Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-lg bg-blue-50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-900">Total categorias top</span>
                <span className="text-lg font-bold text-blue-900">{totalLoadsTopCategories}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <h4 className="font-medium text-gray-900 mb-4">Distribucion de Peso</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Peso promedio por carga</span>
                <span className="font-medium">{avgWeightTon.toFixed(2)} ton</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Carga mas pesada</span>
                <span className="font-medium">{maxWeightTon.toFixed(2)} ton</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Carga mas ligera</span>
                <span className="font-medium">{minWeightTon.toFixed(2)} ton</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h4 className="font-medium text-gray-900 mb-4">Unidades Mas Usadas</h4>
            <div className="space-y-3">
              {vehicles.vehicleUsage.slice(0, 3).map((unit) => (
                <div key={unit.name} className="flex justify-between">
                  <span className="text-sm text-gray-500">{unit.name}</span>
                  <span className="font-medium">{unit.totalLoads} cargas</span>
                </div>
              ))}
              {vehicles.vehicleUsage.length === 0 && (
                <span className="text-sm text-gray-500">Sin datos de unidades.</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h4 className="font-medium text-gray-900 mb-4">Cumplimiento Normativo</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">NOM-002</span>
                <Badge className="bg-green-100 text-green-800">{compliance.nom002.toFixed(1)}%</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">NOM-012</span>
                <Badge className="bg-green-100 text-green-800">{compliance.nom012.toFixed(1)}%</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">NOM-015</span>
                <Badge className="bg-green-100 text-green-800">{compliance.nom015.toFixed(1)}%</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">General</span>
                <Badge className="bg-blue-100 text-blue-800">{compliance.overall.toFixed(1)}%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
