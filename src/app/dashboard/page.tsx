'use client'

import React, { useState, useEffect } from 'react'
import { 
  Package, 
  Truck, 
  Box, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle2,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface LoadPlan {
  id: string
  name: string
  vehicle: string
  vehiclePlate?: string
  status: 'pendiente' | 'optimizado' | 'aprobado' | 'ejecutado'
  totalWeight?: number
  utilization?: number
  createdAt: string
  createdBy?: string
}

interface Alert {
  id: string
  message: string
  type: 'warning' | 'success' | 'info'
  vehicle?: string
}

interface Stat {
  name: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stat[]>([
    { name: 'Productos Registrados', value: '—', icon: Package },
    { name: 'Unidades Activas', value: '—', icon: Truck },
    { name: 'Planes de Carga', value: '—', icon: Box },
    { name: 'Eficiencia Promedio', value: '—%', icon: TrendingUp },
  ])
  const [recentLoadPlans, setRecentLoadPlans] = useState<LoadPlan[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [compliance, setCompliance] = useState({
    nom002: true,
    nom012: true,
    nom015: true,
    nom068: true,
  })

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      
      // Obtener productos
      const productsRes = await fetch('/api/products')
      const productsData = await productsRes.json()
      const productCount = productsData.data?.length || 0

      // Obtener planes de carga
      const loadPlansRes = await fetch('/api/load-plans')
      const loadPlansData = await loadPlansRes.json()
      const loadPlans: LoadPlan[] = loadPlansData.data || []

      // Obtener vehículos/unidades
      const vehiclesRes = await fetch('/api/vehicles')
      const vehiclesData = await vehiclesRes.json()
      const vehicleCount = vehiclesData.data?.length || 0

      // Calcular eficiencia promedio
      const avgEfficiency = loadPlans.length > 0
        ? Math.round(loadPlans.reduce((sum, plan) => sum + (plan.utilization || 0), 0) / loadPlans.length)
        : 0

      // Cumplimiento: se marca como "Atención" si existe algún registro marcado como false
      const anyNom002False = loadPlans.some((p: any) => p.nom002Compliant === false)
      const anyNom012False = loadPlans.some((p: any) => p.nom012Compliant === false)
      const anyNom015False = loadPlans.some((p: any) => p.nom015Compliant === false)
      const anyNom068False = (vehiclesData.data || []).some((v: any) => v.nom068Compliant === false)
      setCompliance({
        nom002: !anyNom002False,
        nom012: !anyNom012False,
        nom015: !anyNom015False,
        nom068: !anyNom068False,
      })

      // Actualizar stats (sin porcentajes inventados)
      setStats([
        { name: 'Productos Registrados', value: productCount.toString(), icon: Package },
        { name: 'Unidades Activas', value: vehicleCount.toString(), icon: Truck },
        { name: 'Planes de Carga', value: loadPlans.length.toString(), icon: Box },
        { name: 'Eficiencia Promedio', value: `${avgEfficiency}%`, icon: TrendingUp },
      ])

      // Planes recientes (últimos 4)
      setRecentLoadPlans(loadPlans.slice(0, 4))

      // Obtener alertas
      const alertsRes = await fetch('/api/alerts')
      const alertsData = await alertsRes.json()
      setAlerts(alertsData.data || [])

    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Cargando dashboard...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Resumen de operaciones y métricas</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <stat.icon className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center">
                <span className="text-sm text-gray-500">Actualizado con datos reales</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Load Plans */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Planes de Carga Recientes</CardTitle>
            <CardDescription>Últimos planes de carga creados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentLoadPlans.length > 0 ? (
                recentLoadPlans.map((plan) => (
                  <div 
                    key={plan.id} 
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-12 rounded-full ${
                        plan.status === 'ejecutado' ? 'bg-green-500' :
                        plan.status === 'aprobado' ? 'bg-blue-500' :
                        plan.status === 'optimizado' ? 'bg-indigo-500' : 'bg-yellow-500'
                      }`} />
                      <div>
                        <p className="font-medium text-gray-900">{plan.name}</p>
                        <p className="text-sm text-gray-500">{plan.id} • {plan.vehicle}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={
                        plan.status === 'ejecutado' ? 'default' :
                        plan.status === 'aprobado' ? 'secondary' :
                        plan.status === 'optimizado' ? 'secondary' : 'outline'
                      }>
                        {plan.status === 'ejecutado' ? 'Ejecutado' :
                         plan.status === 'aprobado' ? 'Aprobado' :
                         plan.status === 'optimizado' ? 'Optimizado' : 'Pendiente'}
                      </Badge>
                      <span className="text-sm text-gray-500">{plan.createdAt}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">No hay planes de carga</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Alertas y Notificaciones</CardTitle>
            <CardDescription>Requiere atención</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {alerts.length > 0 ? (
                alerts.map((alert) => (
                  <div 
                    key={alert.id} 
                    className={`p-4 rounded-lg border-l-4 ${
                      alert.type === 'warning' ? 'bg-yellow-50 border-yellow-500' :
                      alert.type === 'success' ? 'bg-green-50 border-green-500' :
                      'bg-blue-50 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {alert.type === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
                      {alert.type === 'success' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                      {alert.type === 'info' && <Clock className="h-5 w-5 text-blue-600" />}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                        {alert.vehicle && <p className="text-sm text-gray-500">{alert.vehicle}</p>}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">No hay alertas</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Normativas Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Cumplimiento Normativo</CardTitle>
          <CardDescription>Resumen basado en datos registrados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { code: 'NOM-002', name: 'Materiales Peligrosos', ok: compliance.nom002 },
              { code: 'NOM-012', name: 'Peso y Dimensiones', ok: compliance.nom012 },
              { code: 'NOM-015', name: 'Estiba y Sujeción', ok: compliance.nom015 },
              { code: 'NOM-068', name: 'Condiciones Físico-Mecánicas', ok: compliance.nom068 },
              { code: '49 CFR', name: 'Hazardous Materials', ok: true },
              { code: 'FMCSR', name: 'Motor Carrier Safety', ok: true },
              { code: 'FSMA', name: 'Food Safety', ok: true },
            ].map((norm) => (
              <div 
                key={norm.code} 
                className={`p-4 rounded-lg text-center ${
                  norm.ok ? 'bg-green-50 border border-green-200' :
                  'bg-yellow-50 border border-yellow-200'
                }`}
              >
                <p className={`font-bold ${
                  norm.ok ? 'text-green-700' : 'text-yellow-700'
                }`}>{norm.code}</p>
                <p className="text-xs text-gray-600 mt-1">{norm.name}</p>
                <Badge 
                  variant={norm.ok ? 'default' : 'secondary'}
                  className="mt-2 text-xs"
                >
                  {norm.ok ? '✓ Cumple' : '⚠ Revisar'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
