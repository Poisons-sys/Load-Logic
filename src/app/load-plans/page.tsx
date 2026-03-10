'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  Box,
  CheckCircle2,
  Clock,
  Eye,
  FileDown,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const statusConfig: Record<
  string,
  {
    label: string
    variant: 'default' | 'secondary' | 'outline' | 'destructive'
    icon: any
  }
> = {
  pendiente: { label: 'Pendiente', variant: 'outline', icon: Clock },
  optimizado: { label: 'Optimizado', variant: 'secondary', icon: CheckCircle2 },
  aprobado: { label: 'Aprobado', variant: 'default', icon: CheckCircle2 },
  ejecutado: { label: 'Ejecutado', variant: 'default', icon: CheckCircle2 },
}

type SortMode =
  | 'recent'
  | 'oldest'
  | 'utilization_desc'
  | 'score_desc'
  | 'risk_desc'

interface LoadPlan {
  id: string
  name: string
  vehicle: string
  vehiclePlate: string
  status: string
  totalWeight: number
  utilization: number
  optimizationScore?: number
  layoutVersion?: number
  createdAt: string
  createdBy: string
  items: number
  requestedItemsCount?: number
  placedItemsCount?: number
  unplacedItemsCount?: number
  criticalIssues?: number
  warningIssues?: number
  hasCritical?: boolean
  aiStrategy?: string | null
  aiImproved?: boolean
  nomCompliant: boolean
}

function formatLocalDate(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function statusBadge(plan: LoadPlan) {
  const status = statusConfig[plan.status] ?? {
    label: plan.status,
    variant: 'outline' as const,
    icon: Clock,
  }
  return status
}

export default function LoadPlansPage() {
  const router = useRouter()
  const [loadPlans, setLoadPlans] = useState<LoadPlan[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<SortMode>('recent')
  const [selectedPlan, setSelectedPlan] = useState<LoadPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchLoadPlans = useCallback(async () => {
    try {
      const query = new URLSearchParams()
      if (statusFilter !== 'all') query.set('status', statusFilter)
      const response = await fetch(`/api/load-plans?${query.toString()}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      setLoadPlans(Array.isArray(data?.data) ? data.data : [])
    } catch (error) {
      console.error('Error fetching load plans:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void fetchLoadPlans()
  }, [fetchLoadPlans])

  const filteredPlans = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const filtered = loadPlans.filter((plan) => {
      const matchesSearch =
        term.length === 0 ||
        plan.name.toLowerCase().includes(term) ||
        plan.id.toLowerCase().includes(term) ||
        plan.vehicle.toLowerCase().includes(term) ||
        plan.vehiclePlate.toLowerCase().includes(term)

      const matchesStatus = statusFilter === 'all' || plan.status === statusFilter
      return matchesSearch && matchesStatus
    })

    const sorted = filtered.slice()
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'utilization_desc':
          return Number(b.utilization ?? 0) - Number(a.utilization ?? 0)
        case 'score_desc':
          return Number(b.optimizationScore ?? 0) - Number(a.optimizationScore ?? 0)
        case 'risk_desc': {
          const riskA = Number(a.criticalIssues ?? 0) * 100 + Number(a.warningIssues ?? 0)
          const riskB = Number(b.criticalIssues ?? 0) * 100 + Number(b.warningIssues ?? 0)
          return riskB - riskA
        }
        case 'recent':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })
    return sorted
  }, [loadPlans, searchTerm, sortBy, statusFilter])

  if (loading) {
    return <div className="p-6">Cargando planes de carga...</div>
  }

  const goTo3D = (id: string) => {
    router.push(`/load-plans/${id}/view`)
  }
  const goToEdit = (id: string) => {
    router.push(`/load-plans/${id}/edit`)
  }

  const deletePlan = async (id: string) => {
    const ok = confirm('Eliminar este plan de carga?')
    if (!ok) return

    try {
      setBusyId(id)
      const res = await fetch(`/api/load-plans/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo eliminar el plan')
      }

      await fetchLoadPlans()
      if (selectedPlan?.id === id) setSelectedPlan(null)
    } catch (e: any) {
      console.error(e)
      alert(e?.message ?? 'Error eliminando plan')
    } finally {
      setBusyId(null)
    }
  }

  const downloadPdf = async (id: string) => {
    try {
      setBusyId(id)
      const res = await fetch(`/api/load-plans/${id}`, {
        method: 'GET',
        credentials: 'include',
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo obtener el plan para PDF')
      }

      const json = await res.json()
      const plan = json?.data
      if (!plan) throw new Error('Respuesta invalida del servidor')

      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('Plan de Carga', 14, 16)

      doc.setFontSize(10)
      doc.text(`ID: ${plan.id}`, 14, 24)
      doc.text(`Nombre: ${plan.name ?? ''}`, 14, 30)
      doc.text(
        `Unidad: ${plan.vehicle?.name ?? ''} (${plan.vehicle?.plateNumber ?? ''})`,
        14,
        36
      )
      doc.text(`Estado: ${plan.status ?? ''}`, 14, 42)
      doc.text(`Peso total: ${((plan.totalWeight ?? 0) / 1000).toFixed(2)} ton`, 14, 48)
      doc.text(`Utilizacion: ${Number(plan.spaceUtilization ?? 0).toFixed(1)}%`, 14, 54)

      const rows = (plan.items ?? []).map((it: any) => {
        const p = it.product
        return [
          p?.name ?? '-',
          String(it.quantity ?? 0),
          `${p?.length ?? 0}x${p?.width ?? 0}x${p?.height ?? 0} cm`,
          `${p?.weight ?? 0} kg`,
          `${p?.category ?? ''}`,
        ]
      })

      autoTable(doc, {
        startY: 62,
        head: [['Producto', 'Cant.', 'Dimensiones', 'Peso', 'Categoria']],
        body: rows,
        styles: { fontSize: 9 },
      })

      const lastY = (doc as any).lastAutoTable?.finalY
      const y = (typeof lastY === 'number' ? lastY : 62) + 10

      const instructions = plan.instructions ?? []
      if (instructions.length > 0) {
        doc.setFontSize(12)
        doc.text('Instrucciones de Carga', 14, y)
        doc.setFontSize(9)
        const instRows = instructions
          .sort((a: any, b: any) => (a.step ?? 0) - (b.step ?? 0))
          .map((ins: any) => [String(ins.step ?? ''), ins.description ?? '', ins.position ?? ''])

        autoTable(doc, {
          startY: y + 4,
          head: [['Paso', 'Descripcion', 'Posicion']],
          body: instRows,
          styles: { fontSize: 8 },
        })
      }

      doc.save(`plan-carga-${plan.id}.pdf`)
    } catch (e: any) {
      console.error(e)
      alert(e?.message ?? 'Error generando PDF')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes de Carga</h1>
          <p className="text-gray-500">Historial y gestion de planes optimizados</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, ID, unidad o placa..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="optimizado">Optimizado</SelectItem>
                <SelectItem value="aprobado">Aprobado</SelectItem>
                <SelectItem value="ejecutado">Ejecutado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mas recientes</SelectItem>
                <SelectItem value="oldest">Mas antiguos</SelectItem>
                <SelectItem value="utilization_desc">Mayor utilizacion</SelectItem>
                <SelectItem value="score_desc">Mayor score</SelectItem>
                <SelectItem value="risk_desc">Mayor riesgo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            Lista de Planes de Carga
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Piezas</TableHead>
                <TableHead>Riesgo</TableHead>
                <TableHead>Utilizacion</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>IA</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlans.map((plan) => {
                const status = statusBadge(plan)
                const StatusIcon = status.icon
                const requested = Number(plan.requestedItemsCount ?? plan.items ?? 0)
                const placed = Number(plan.placedItemsCount ?? requested)
                const unplaced = Number(plan.unplacedItemsCount ?? Math.max(0, requested - placed))
                const critical = Number(plan.criticalIssues ?? 0)
                const warnings = Number(plan.warningIssues ?? 0)

                return (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.id.slice(0, 8)}...</TableCell>
                    <TableCell>{plan.name}</TableCell>
                    <TableCell>
                      <div>
                        <p>{plan.vehicle}</p>
                        <p className="text-sm text-gray-500">{plan.vehiclePlate}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant} className="flex items-center gap-1 w-fit">
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {placed}/{requested}
                      </p>
                      {unplaced > 0 && (
                        <p className="text-xs text-red-600">{unplaced} sin colocar</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {critical > 0 ? (
                        <Badge variant="destructive">{critical} criticos</Badge>
                      ) : warnings > 0 ? (
                        <Badge variant="outline" className="text-amber-700 border-amber-600">
                          {warnings} warnings
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-green-700 border-green-600">
                          OK
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-medium ${
                          plan.utilization > 80
                            ? 'text-green-600'
                            : plan.utilization > 50
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {Number(plan.utilization ?? 0).toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>{Number(plan.optimizationScore ?? 0).toFixed(1)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge variant="outline">{plan.aiStrategy ?? 'baseline'}</Badge>
                        {plan.aiImproved && (
                          <p className="text-xs text-green-700 font-medium">mejora detectada</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>v{plan.layoutVersion ?? 1}</TableCell>
                    <TableCell>{formatLocalDate(plan.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedPlan(plan)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Detalles del Plan</DialogTitle>
                            <DialogDescription>
                              {plan.id} - {plan.name}
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid grid-cols-2 gap-4 py-4">
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm text-gray-500">Unidad</p>
                                <p className="font-medium">{plan.vehicle}</p>
                                <p className="text-sm text-gray-500">{plan.vehiclePlate}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Creado por</p>
                                <p className="font-medium">{plan.createdBy || '-'}</p>
                                <p className="text-sm text-gray-500">{formatLocalDate(plan.createdAt)}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Estado</p>
                                <Badge variant={status.variant} className="mt-1">
                                  {status.label}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Version de layout</p>
                                <p className="font-medium">v{plan.layoutVersion ?? 1}</p>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm text-gray-500">Peso Total</p>
                                <p className="font-medium">
                                  {(Number(plan.totalWeight ?? 0) / 1000).toFixed(2)} ton
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Utilizacion del espacio</p>
                                <p className="font-medium">
                                  {Number(plan.utilization ?? 0).toFixed(1)}%
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Piezas</p>
                                <p className="font-medium">
                                  {Number(plan.placedItemsCount ?? plan.items ?? 0)}/
                                  {Number(plan.requestedItemsCount ?? plan.items ?? 0)}
                                </p>
                                {Number(plan.unplacedItemsCount ?? 0) > 0 && (
                                  <p className="text-xs text-red-600">
                                    {Number(plan.unplacedItemsCount)} sin colocar
                                  </p>
                                )}
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Cumplimiento NOM</p>
                                {plan.nomCompliant ? (
                                  <Badge variant="outline" className="text-green-600 border-green-600">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Cumple
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    No cumple
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button className="flex-1" onClick={() => goTo3D(plan.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              Ver 3D
                            </Button>
                            <Button variant="outline" className="flex-1" onClick={() => goToEdit(plan.id)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1"
                              disabled={busyId === plan.id}
                              onClick={() => downloadPdf(plan.id)}
                            >
                              <FileDown className="h-4 w-4 mr-2" />
                              Descargar PDF
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => goToEdit(plan.id)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyId === plan.id}
                        onClick={() => downloadPdf(plan.id)}
                        title="Descargar PDF"
                      >
                        <FileDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busyId === plan.id}
                        onClick={() => deletePlan(plan.id)}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredPlans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-sm text-gray-500 py-8">
                    No hay planes que coincidan con el filtro actual.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
