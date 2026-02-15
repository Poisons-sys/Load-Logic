'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { FileText, Download, Calendar, BarChart3, TrendingUp, Package, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type ReportType = 'summary' | 'efficiency' | 'vehicles' | 'compliance' | 'products'
type DateRange = 'last-7' | 'last-30' | 'last-90' | 'this-month' | 'last-month' | 'custom'

type ReportHistoryItem = {
  id: string
  type: string
  format: string
  fileUrl?: string | null
  generatedAt?: string | null
  generatedBy?: string
}

const reportTypes: Array<{ id: ReportType; name: string; description: string }> = [
  { id: 'summary', name: 'Resumen de Cargas', description: 'Totales de cargas, peso y utilizacion.' },
  { id: 'efficiency', name: 'Eficiencia de Estiba', description: 'Utilizacion promedio por unidad y global.' },
  { id: 'vehicles', name: 'Uso de Unidades', description: 'Cargas y peso transportado por unidad.' },
  { id: 'compliance', name: 'Cumplimiento NOM', description: 'Estado de cumplimiento NOM de los planes.' },
  { id: 'products', name: 'Productos por Categoria', description: 'Distribucion de productos por categoria.' },
]

const reportTypeLabel: Record<string, string> = Object.fromEntries(reportTypes.map(t => [t.id, t.name]))

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getDateBounds(range: DateRange, customStart: string, customEnd: string) {
  const now = new Date()
  const end = new Date(now)
  let start: Date | null = null

  switch (range) {
    case 'last-7':
      start = new Date(now)
      start.setDate(start.getDate() - 6)
      break
    case 'last-30':
      start = new Date(now)
      start.setDate(start.getDate() - 29)
      break
    case 'last-90':
      start = new Date(now)
      start.setDate(start.getDate() - 89)
      break
    case 'this-month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      break
    case 'last-month': {
      const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      end.setTime(firstThisMonth.getTime() - 24 * 60 * 60 * 1000)
      start = new Date(end.getFullYear(), end.getMonth(), 1)
      break
    }
    case 'custom':
      if (customStart && customEnd) {
        start = new Date(customStart)
        end.setTime(new Date(customEnd).getTime())
      }
      break
  }

  if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }

  return { startDate: formatDateValue(start), endDate: formatDateValue(end) }
}

export default function ReportsPage() {
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('summary')
  const [dateRange, setDateRange] = useState<DateRange>('last-30')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  const [history, setHistory] = useState<ReportHistoryItem[]>([])
  const [reportPreview, setReportPreview] = useState<any>(null)
  const [quickSummary, setQuickSummary] = useState({
    totalLoads: 0,
    avgUtilization: 0,
    activeVehicles: 0,
    overallCompliance: 100,
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const bounds = useMemo(
    () => getDateBounds(dateRange, customStartDate, customEndDate),
    [dateRange, customEndDate, customStartDate]
  )

  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true)
      const res = await fetch('/api/reports?type=history', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'No se pudo cargar historial')
      setHistory(json?.data?.reports || [])
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error cargando historial',
      })
    } finally {
      setIsLoadingHistory(false)
    }
  }

  const loadQuickSummary = async () => {
    try {
      const [summaryRes, vehiclesRes, complianceRes] = await Promise.all([
        fetch('/api/reports?type=summary', { cache: 'no-store' }),
        fetch('/api/reports?type=vehicles', { cache: 'no-store' }),
        fetch('/api/reports?type=compliance', { cache: 'no-store' }),
      ])

      const [summaryJson, vehiclesJson, complianceJson] = await Promise.all([
        summaryRes.json(),
        vehiclesRes.json(),
        complianceRes.json(),
      ])

      if (!summaryRes.ok || !vehiclesRes.ok || !complianceRes.ok) {
        return
      }

      setQuickSummary({
        totalLoads: Number(summaryJson?.data?.summary?.totalLoads || 0),
        avgUtilization: Number(summaryJson?.data?.summary?.avgUtilization || 0),
        activeVehicles: Number(vehiclesJson?.data?.activeVehicles || 0),
        overallCompliance: Number(complianceJson?.data?.overallCompliance || 100),
      })
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void loadHistory()
    void loadQuickSummary()
  }, [])

  const fetchReportData = async (type: ReportType) => {
    const params = new URLSearchParams({ type })
    if (bounds) {
      params.set('startDate', bounds.startDate)
      params.set('endDate', bounds.endDate)
    }

    const res = await fetch(`/api/reports?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo generar reporte')
    return json?.data
  }

  const exportReportPdf = async (type: ReportType, data: any) => {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(`Reporte: ${reportTypeLabel[type]}`, 14, 16)
    doc.setFontSize(10)
    doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 24)
    doc.text(`Rango: ${bounds ? `${bounds.startDate} a ${bounds.endDate}` : 'Sin filtro de fecha'}`, 14, 30)

    if (type === 'summary') {
      const summary = data?.summary || {}
      autoTable(doc, {
        startY: 36,
        head: [['Metrica', 'Valor']],
        body: [
          ['Total de cargas', String(summary.totalLoads ?? 0)],
          ['Cargas ejecutadas', String(summary.completedLoads ?? 0)],
          ['Cargas pendientes', String(summary.pendingLoads ?? 0)],
          ['Cargas optimizadas', String(summary.optimizedLoads ?? 0)],
          ['Peso total (ton)', String(summary.totalWeightTon ?? 0)],
          ['Utilizacion promedio (%)', String(summary.avgUtilization ?? 0)],
          ['Productos registrados', String(summary.productCount ?? 0)],
          ['Unidades registradas', String(summary.vehicleCount ?? 0)],
        ],
      })
    }

    if (type === 'efficiency') {
      const byVehicle = data?.byVehicle || []
      autoTable(doc, {
        startY: 36,
        head: [['Unidad', 'Cargas', 'Utilizacion Promedio (%)']],
        body: byVehicle.map((row: any) => [
          String(row.name ?? '-'),
          String(row.loads ?? 0),
          String(row.avgUtilization ?? 0),
        ]),
      })
    }

    if (type === 'vehicles') {
      const rows = data?.vehicleUsage || []
      autoTable(doc, {
        startY: 36,
        head: [['Unidad', 'Placa', 'Cargas', 'Peso (ton)', 'Utilizacion (%)']],
        body: rows.map((row: any) => [
          String(row.name ?? '-'),
          String(row.plateNumber ?? '-'),
          String(row.totalLoads ?? 0),
          String(row.totalWeightTon ?? 0),
          String(row.avgUtilization ?? 0),
        ]),
      })
    }

    if (type === 'products') {
      const rows = data?.byCategory || []
      autoTable(doc, {
        startY: 36,
        head: [['Categoria', 'Productos', 'Peso Total', 'Volumen Total']],
        body: rows.map((row: any) => [
          String(row.category ?? '-'),
          String(row.count ?? 0),
          String(row.totalWeight ?? 0),
          String(row.totalVolume ?? 0),
        ]),
      })
    }

    if (type === 'compliance') {
      const c = data?.compliance || {}
      autoTable(doc, {
        startY: 36,
        head: [['Norma', 'Cumplen', 'Porcentaje']],
        body: [
          ['NOM-002', String(c?.nom002?.compliant ?? 0), `${c?.nom002?.percentage ?? 0}%`],
          ['NOM-012', String(c?.nom012?.compliant ?? 0), `${c?.nom012?.percentage ?? 0}%`],
          ['NOM-015', String(c?.nom015?.compliant ?? 0), `${c?.nom015?.percentage ?? 0}%`],
          ['General', String(data?.totalLoads ?? 0), `${data?.overallCompliance ?? 0}%`],
        ],
      })
    }

    doc.save(`reporte-${type}-${Date.now()}.pdf`)
  }

  const generateReport = async (forcedType?: ReportType) => {
    const reportType = forcedType || selectedReportType
    if (!reportType) return

    if (dateRange === 'custom' && !bounds) {
      setFeedback({ type: 'error', message: 'Selecciona rango personalizado valido.' })
      return
    }

    try {
      setIsGenerating(true)
      setFeedback(null)

      const data = await fetchReportData(reportType)
      setReportPreview({ type: reportType, data })

      await exportReportPdf(reportType, data)

      await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reportType,
          format: 'pdf',
        }),
      })

      await loadHistory()
      setFeedback({ type: 'success', message: `Reporte ${reportTypeLabel[reportType]} generado correctamente.` })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error generando reporte',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
        <p className="text-gray-500">Genere y descargue reportes de operaciones</p>
      </div>

      {feedback && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${feedback.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {feedback.message}
        </div>
      )}

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate">Generar Reporte</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="analytics">Analisis</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generar Nuevo Reporte</CardTitle>
              <CardDescription>Seleccione el tipo de reporte y rango de fechas</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tipo de Reporte</label>
                  <Select value={selectedReportType} onValueChange={(v) => setSelectedReportType(v as ReportType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {reportTypes.map(type => (
                        <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Rango de Fechas</label>
                  <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione rango" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="last-7">Ultimos 7 dias</SelectItem>
                      <SelectItem value="last-30">Ultimos 30 dias</SelectItem>
                      <SelectItem value="last-90">Ultimos 90 dias</SelectItem>
                      <SelectItem value="this-month">Este mes</SelectItem>
                      <SelectItem value="last-month">Mes anterior</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={() => generateReport()} disabled={isGenerating}>
                    <FileText className="h-4 w-4 mr-2" />
                    {isGenerating ? 'Generando...' : 'Generar Reporte'}
                  </Button>
                </div>
              </div>

              {dateRange === 'custom' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fecha inicio</label>
                    <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fecha fin</label>
                    <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} />
                  </div>
                </div>
              )}

              {selectedReportType && (
                <div className="rounded-lg bg-blue-50 p-4">
                  <h4 className="font-medium text-blue-900">{reportTypeLabel[selectedReportType]}</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    {reportTypes.find(t => t.id === selectedReportType)?.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {reportPreview && (
            <Card>
              <CardHeader>
                <CardTitle>Ultimo reporte generado</CardTitle>
                <CardDescription>{reportTypeLabel[reportPreview.type] || reportPreview.type}</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
                  {JSON.stringify(reportPreview.data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Reportes Generados</CardTitle>
              <CardDescription>Historial real de reportes generados en tu cuenta</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <p className="text-sm text-gray-500">Cargando historial...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-500">No hay reportes guardados aun.</p>
              ) : (
                <div className="space-y-3">
                  {history.map(report => (
                    <div key={report.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
                      <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-blue-100 p-2">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium">{reportTypeLabel[report.type] || report.type}</p>
                          <p className="text-sm text-gray-500">
                            {report.id} • {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : '-'} • {report.generatedBy || 'Usuario'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{String(report.format || '').toUpperCase()}</Badge>
                        <Button variant="outline" size="sm" onClick={() => generateReport(report.type as ReportType)}>
                          <Download className="h-4 w-4 mr-2" />
                          Regenerar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Cargas registradas</p>
                    <p className="text-3xl font-bold">{quickSummary.totalLoads}</p>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <Package className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Utilizacion promedio</p>
                    <p className="text-3xl font-bold">{quickSummary.avgUtilization.toFixed(1)}%</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-sm text-green-600">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Basado en planes de carga reales
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Unidades activas</p>
                    <p className="text-3xl font-bold">{quickSummary.activeVehicles}</p>
                  </div>
                  <div className="bg-amber-50 p-3 rounded-lg">
                    <Truck className="h-6 w-6 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Cumplimiento NOM</p>
                    <p className="text-3xl font-bold">{quickSummary.overallCompliance.toFixed(1)}%</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg">
                    <Calendar className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
