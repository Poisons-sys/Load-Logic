'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Eye, FileDown, Trash2, Box, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: any }> = {
  pendiente: { label: 'Pendiente', variant: 'outline', icon: Clock },
  optimizado: { label: 'Optimizado', variant: 'secondary', icon: CheckCircle2 },
  aprobado: { label: 'Aprobado', variant: 'default', icon: CheckCircle2 },
  ejecutado: { label: 'Ejecutado', variant: 'default', icon: CheckCircle2 },
}

interface LoadPlan {
  id: string
  name: string
  vehicle: string
  vehiclePlate: string
  status: string
  totalWeight: number
  utilization: number
  createdAt: string
  createdBy: string
  items: number
  nomCompliant: boolean
}

export default function LoadPlansPage() {
  const router = useRouter()
  const [loadPlans, setLoadPlans] = useState<LoadPlan[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<LoadPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    fetchLoadPlans()
  }, [])

  const fetchLoadPlans = async () => {
    try {
      const response = await fetch('/api/load-plans')
      const data = await response.json()
      setLoadPlans(data.data || [])
    } catch (error) {
      console.error('Error fetching load plans:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredPlans = loadPlans.filter(plan =>
    plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.vehicle.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return <div className="p-6">Cargando planes de carga...</div>
  }

  const goTo3D = (id: string) => {
    router.push(`/load-plans/${id}/view`)
  }

  const deletePlan = async (id: string) => {
    const ok = confirm('¿Eliminar este plan de carga?')
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

      // Refrescar lista
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
      if (!plan) throw new Error('Respuesta inválida del servidor')

      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('Plan de Carga', 14, 16)

      doc.setFontSize(10)
      doc.text(`ID: ${plan.id}`, 14, 24)
      doc.text(`Nombre: ${plan.name ?? ''}`, 14, 30)
      doc.text(`Unidad: ${plan.vehicle?.name ?? ''} (${plan.vehicle?.plateNumber ?? ''})`, 14, 36)
      doc.text(`Estado: ${plan.status ?? ''}`, 14, 42)
      doc.text(`Peso total: ${((plan.totalWeight ?? 0) / 1000).toFixed(2)} ton`, 14, 48)
      doc.text(`Utilización: ${Number(plan.spaceUtilization ?? 0).toFixed(1)}%`, 14, 54)

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
        head: [['Producto', 'Cant.', 'Dimensiones', 'Peso', 'Categoría']],
        body: rows,
        styles: { fontSize: 9 },
      })

      // Instrucciones (si hay)
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
          head: [['Paso', 'Descripción', 'Posición']],
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planes de Carga</h1>
          <p className="text-gray-500">Historial y gestión de planes de carga optimizados</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar planes de carga..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Load Plans Table */}
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
                <TableHead>Peso</TableHead>
                <TableHead>Utilización</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlans.map((plan) => {
                const status = statusConfig[plan.status] ?? { label: plan.status, variant: 'outline' as const, icon: Clock }
                const StatusIcon = status.icon
                return (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.id}</TableCell>
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
                    <TableCell>{(plan.totalWeight / 1000).toFixed(1)} ton</TableCell>
                    <TableCell>
                      <span className={`font-medium ${
                        plan.utilization > 80 ? 'text-green-600' :
                        plan.utilization > 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {plan.utilization.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell>{plan.createdAt}</TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => setSelectedPlan(plan)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Detalles del Plan de Carga</DialogTitle>
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
                                <p className="font-medium">{plan.createdBy}</p>
                                <p className="text-sm text-gray-500">{plan.createdAt}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Estado</p>
                                <Badge variant={status.variant} className="mt-1">
                                  {status.label}
                                </Badge>
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <p className="text-sm text-gray-500">Peso Total</p>
                                <p className="font-medium">{(plan.totalWeight / 1000).toFixed(2)} toneladas</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Utilización del Espacio</p>
                                <p className="font-medium">{plan.utilization.toFixed(1)}%</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-500">Total de Items</p>
                                <p className="font-medium">{plan.items} productos</p>
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
                                    No Cumple
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
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
