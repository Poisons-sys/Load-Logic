'use client'

import React, { useState } from 'react'
import { FileText, Download, Calendar, BarChart3, TrendingUp, Package, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const reportTypes = [
  { id: 'load-summary', name: 'Resumen de Cargas', description: 'Resumen general de todas las cargas' },
  { id: 'efficiency', name: 'Eficiencia de Estiba', description: 'Análisis de utilización del espacio' },
  { id: 'weight-distribution', name: 'Distribución de Peso', description: 'Análisis por ejes y distribución' },
  { id: 'compliance', name: 'Cumplimiento Normativo', description: 'Reporte de cumplimiento NOM' },
  { id: 'product-usage', name: 'Uso de Productos', description: 'Productos más transportados' },
]

const generatedReports = [
  { id: 'RPT-001', name: 'Resumen Mensual - Enero 2024', type: 'load-summary', date: '2024-02-01', format: 'PDF' },
  { id: 'RPT-002', name: 'Análisis de Eficiencia Q4 2023', type: 'efficiency', date: '2024-01-15', format: 'PDF' },
  { id: 'RPT-003', name: 'Cumplimiento NOM-012', type: 'compliance', date: '2024-01-10', format: 'PDF' },
  { id: 'RPT-004', name: 'Distribución de Peso - Trailer 001', type: 'weight-distribution', date: '2024-01-05', format: 'CSV' },
]

export default function ReportsPage() {
  const [selectedReportType, setSelectedReportType] = useState('')
  const [dateRange, setDateRange] = useState('last-30')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-500">Genere y descargue reportes de operaciones</p>
      </div>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate">Generar Reporte</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="analytics">Análisis</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
          {/* Report Generator */}
          <Card>
            <CardHeader>
              <CardTitle>Generar Nuevo Reporte</CardTitle>
              <CardDescription>
                Seleccione el tipo de reporte y el rango de fechas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo de Reporte</label>
                  <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {reportTypes.map(type => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rango de Fechas</label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione rango" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last-7">Últimos 7 días</SelectItem>
                      <SelectItem value="last-30">Últimos 30 días</SelectItem>
                      <SelectItem value="last-90">Últimos 90 días</SelectItem>
                      <SelectItem value="this-month">Este mes</SelectItem>
                      <SelectItem value="last-month">Mes anterior</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button className="w-full">
                    <FileText className="h-4 w-4 mr-2" />
                    Generar Reporte
                  </Button>
                </div>
              </div>

              {selectedReportType && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900">
                    {reportTypes.find(t => t.id === selectedReportType)?.name}
                  </h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {reportTypes.find(t => t.id === selectedReportType)?.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Report Types Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportTypes.map(report => (
              <Card key={report.id} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium">{report.name}</h4>
                      <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Reportes Generados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {generatedReports.map(report => (
                  <div 
                    key={report.id} 
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{report.name}</p>
                        <p className="text-sm text-gray-500">
                          {report.id} • {report.date} • 
                          <Badge variant="outline" className="ml-2">{report.format}</Badge>
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Descargar
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Cargas este mes</p>
                    <p className="text-3xl font-bold">47</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <Package className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                  <span className="text-sm text-green-600">+12%</span>
                  <span className="text-sm text-gray-500 ml-2">vs mes anterior</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Eficiencia promedio</p>
                    <p className="text-3xl font-bold">78%</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center">
                  <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                  <span className="text-sm text-green-600">+5%</span>
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
                    <p className="text-sm text-gray-500">Cumplimiento NOM</p>
                    <p className="text-3xl font-bold">100%</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <Calendar className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center">
                  <span className="text-sm text-green-600">Todas las cargas cumplen</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
