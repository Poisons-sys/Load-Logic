'use client'

import React from 'react'
import { BarChart3, TrendingUp, Package, Truck, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const monthlyData = [
  { month: 'Ene', loads: 42, efficiency: 76 },
  { month: 'Feb', loads: 38, efficiency: 78 },
  { month: 'Mar', loads: 45, efficiency: 80 },
  { month: 'Abr', loads: 50, efficiency: 82 },
  { month: 'May', loads: 48, efficiency: 79 },
  { month: 'Jun', loads: 55, efficiency: 83 },
]

const topProducts = [
  { name: 'Autopartes', count: 156, percentage: 28 },
  { name: 'Electrónicos', count: 124, percentage: 22 },
  { name: 'Alimentos', count: 98, percentage: 17 },
  { name: 'Maquinaria', count: 87, percentage: 15 },
  { name: 'Otros', count: 102, percentage: 18 },
]

export default function AnalyticsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Análisis</h1>
        <p className="text-gray-500">Métricas y estadísticas de operaciones</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Cargas este mes</p>
                <p className="text-3xl font-bold">55</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
              <span className="text-sm text-green-600">+14.5%</span>
              <span className="text-sm text-gray-500 ml-2">vs mes anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Eficiencia promedio</p>
                <p className="text-3xl font-bold">83%</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <ArrowUpRight className="h-4 w-4 text-green-600 mr-1" />
              <span className="text-sm text-green-600">+5.1%</span>
              <span className="text-sm text-gray-500 ml-2">vs mes anterior</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Unidades activas</p>
                <p className="text-3xl font-bold">24</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-lg">
                <Truck className="h-6 w-6 text-amber-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <span className="text-sm text-gray-500">3 en mantenimiento</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Tiempo promedio</p>
                <p className="text-3xl font-bold">12m</p>
              </div>
              <div className="bg-purple-50 p-3 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <ArrowDownRight className="h-4 w-4 text-green-600 mr-1" />
              <span className="text-sm text-green-600">-2.3m</span>
              <span className="text-sm text-gray-500 ml-2">vs mes anterior</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Rendimiento Mensual
            </CardTitle>
            <CardDescription>
              Cargas procesadas y eficiencia de estiba
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {monthlyData.map((data) => (
                <div key={data.month} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{data.month}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">{data.loads} cargas</span>
                      <span className="text-sm text-blue-600">{data.efficiency}% ef.</span>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${data.efficiency}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader>
            <CardTitle>Productos Más Transportados</CardTitle>
            <CardDescription>
              Distribución por categoría de producto
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topProducts.map((product) => (
                <div key={product.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ 
                        backgroundColor: 
                          product.name === 'Autopartes' ? '#3B82F6' :
                          product.name === 'Electrónicos' ? '#8B5CF6' :
                          product.name === 'Alimentos' ? '#10B981' :
                          product.name === 'Maquinaria' ? '#F59E0B' : '#6B7280'
                      }}
                    />
                    <span className="font-medium">{product.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{product.count} cargas</span>
                    <Badge variant="outline">{product.percentage}%</Badge>
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-900">Total de cargas</span>
                <span className="text-lg font-bold text-blue-900">
                  {topProducts.reduce((sum, p) => sum + p.count, 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <h4 className="font-medium text-gray-900 mb-4">Distribución de Peso</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Peso promedio por carga</span>
                <span className="font-medium">14.2 ton</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Carga más pesada</span>
                <span className="font-medium">23.8 ton</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Carga más ligera</span>
                <span className="font-medium">2.1 ton</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h4 className="font-medium text-gray-900 mb-4">Unidades Más Usadas</h4>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Trailer 001</span>
                <span className="font-medium">28 cargas</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Caja Seca 003</span>
                <span className="font-medium">19 cargas</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Refrigerado 002</span>
                <span className="font-medium">15 cargas</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h4 className="font-medium text-gray-900 mb-4">Cumplimiento Normativo</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">NOM-012</span>
                <Badge className="bg-green-100 text-green-800">100%</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">NOM-015</span>
                <Badge className="bg-green-100 text-green-800">100%</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">NOM-068</span>
                <Badge className="bg-green-100 text-green-800">98%</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">49 CFR</span>
                <Badge className="bg-green-100 text-green-800">100%</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
