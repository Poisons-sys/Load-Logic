"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Edit2, Trash2, Truck, ThermometerSnowflake, AlertTriangle } from 'lucide-react'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

type Vehicle = {
  id: string
  name: string
  type: string
  plateNumber: string
  internalLength: number
  internalWidth: number
  internalHeight: number
  maxWeight: number
  maxVolume: number
  hasRefrigeration: boolean
  minTemperature: number | null
  maxTemperature: number | null
  axles: number
  nom012Compliant: boolean
  nom068Compliant: boolean
  hazardousMaterialAuthorized: boolean
  isActive: boolean
}

const vehicleTypeLabels: Record<string, string> = {
  camion: 'Camión',
  remolque: 'Remolque',
  caja_seca: 'Caja Seca',
  refrigerado: 'Refrigerado',
  plataforma: 'Plataforma',
  cisterna: 'Cisterna',
}

const vehicleSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  type: z.string().min(1, 'Tipo requerido'),
  plateNumber: z.string().min(1, 'Placas requeridas'),
  internalLength: z.coerce.number().positive('Largo requerido'),
  internalWidth: z.coerce.number().positive('Ancho requerido'),
  internalHeight: z.coerce.number().nonnegative('Alto requerido'),
  maxWeight: z.coerce.number().positive('Peso máximo requerido'),
  hasRefrigeration: z.boolean().optional().default(false),
  minTemperature: z.coerce.number().optional().nullable(),
  maxTemperature: z.coerce.number().optional().nullable(),
  axles: z.coerce.number().int().min(2).max(9).optional().default(2),
  hazardousMaterialAuthorized: z.boolean().optional().default(false),
})

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/vehicles', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error cargando vehículos')
      setVehicles(json.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando vehículos')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const t = searchTerm.trim().toLowerCase()
    if (!t) return vehicles
    return vehicles.filter(v =>
      v.name.toLowerCase().includes(t) || v.plateNumber.toLowerCase().includes(t)
    )
  }, [vehicles, searchTerm])

  async function createVehicle(values: z.infer<typeof vehicleSchema>) {
    const res = await fetch('/api/vehicles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo crear')
    await load()
    setIsCreateOpen(false)
  }

  async function updateVehicle(id: string, values: z.infer<typeof vehicleSchema>) {
    const res = await fetch(`/api/vehicles/${id}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      }
    )
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar')
    await load()
    setIsEditOpen(false)
    setEditing(null)
  }

  async function deleteVehicle(v: Vehicle) {
    if (!confirm(`¿Eliminar "${v.name}"?`)) return
    const res = await fetch(`/api/vehicles/${v.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar')
    await load()
  }

  function openEdit(v: Vehicle) {
    setEditing(v)
    setIsEditOpen(true)
  }

  function dims(v: Vehicle) {
    return `${v.internalLength}×${v.internalWidth}×${v.internalHeight}`
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vehículos</h1>
          <p className="text-gray-500">Gestión de flotilla y capacidades</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Vehículo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agregar Vehículo</DialogTitle>
              <DialogDescription>Completa los datos principales.</DialogDescription>
            </DialogHeader>
            <VehicleDialogForm submitLabel="Crear" onSubmit={createVehicle} />
          </DialogContent>
        </Dialog>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Vehículo</DialogTitle>
              <DialogDescription>Actualiza los campos necesarios.</DialogDescription>
            </DialogHeader>
            <VehicleDialogForm
              submitLabel="Guardar"
              defaultValues={editing || undefined}
              disabled={!editing}
              onSubmit={(vals) => updateVehicle(editing!.id, vals)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o placas…"
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Lista de Vehículos ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No hay vehículos aún. Crea el primero con “Nuevo Vehículo”.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Dimensiones (cm)</TableHead>
                  <TableHead>Peso máx.</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{v.name}</p>
                        <p className="text-sm text-gray-500">{v.plateNumber}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{vehicleTypeLabels[v.type] || v.type}</Badge>
                    </TableCell>
                    <TableCell>{dims(v)}</TableCell>
                    <TableCell>{v.maxWeight.toLocaleString()} kg</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {v.hasRefrigeration && (
                          <Badge variant="secondary" className="gap-1">
                            <ThermometerSnowflake className="h-3 w-3" />
                            Refrigerado
                          </Badge>
                        )}
                        {v.hazardousMaterialAuthorized && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            HazMat
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteVehicle(v)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function VehicleDialogForm({
  onSubmit,
  submitLabel,
  defaultValues,
  disabled,
}: {
  onSubmit: (values: z.infer<typeof vehicleSchema>) => Promise<void>
  submitLabel: string
  defaultValues?: Partial<Vehicle>
  disabled?: boolean
}) {
  const form = useForm<z.infer<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      name: defaultValues?.name || '',
      type: defaultValues?.type || '',
      plateNumber: defaultValues?.plateNumber || '',
      internalLength: (defaultValues?.internalLength as any) ?? ('' as any),
      internalWidth: (defaultValues?.internalWidth as any) ?? ('' as any),
      internalHeight: (defaultValues?.internalHeight as any) ?? ('' as any),
      maxWeight: (defaultValues?.maxWeight as any) ?? ('' as any),
      hasRefrigeration: defaultValues?.hasRefrigeration || false,
      minTemperature: defaultValues?.minTemperature ?? null,
      maxTemperature: defaultValues?.maxTemperature ?? null,
      axles: defaultValues?.axles ?? 2,
      hazardousMaterialAuthorized: defaultValues?.hazardousMaterialAuthorized || false,
    },
  })

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const hasRef = form.watch('hasRefrigeration')

  async function handle(values: z.infer<typeof vehicleSchema>) {
    setSaving(true)
    setFormError(null)
    try {
      await onSubmit({
        ...values,
        plateNumber: values.plateNumber.toUpperCase(),
        minTemperature: values.minTemperature ?? null,
        maxTemperature: values.maxTemperature ?? null,
        hasRefrigeration: Boolean(values.hasRefrigeration),
        hazardousMaterialAuthorized: Boolean(values.hazardousMaterialAuthorized),
      })
      form.reset()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(handle)} className="space-y-4">
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
      )}

      <div className="grid grid-cols-2 gap-4 py-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input id="name" disabled={saving || disabled} {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Tipo *</Label>
          <Select
            value={form.watch('type') || ''}
            onValueChange={(v) => form.setValue('type', v)}
            disabled={saving || disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccione" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(vehicleTypeLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.type && (
            <p className="text-xs text-red-600">{form.formState.errors.type.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="plateNumber">Placas *</Label>
          <Input id="plateNumber" disabled={saving || disabled} {...form.register('plateNumber')} />
          {form.formState.errors.plateNumber && (
            <p className="text-xs text-red-600">{form.formState.errors.plateNumber.message}</p>
          )}
        </div>

        <div className="col-span-2">
          <h4 className="font-medium text-gray-900 mb-2">Dimensiones internas (cm)</h4>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-2">
              <Label htmlFor="internalLength">Largo *</Label>
              <Input id="internalLength" type="number" disabled={saving || disabled} {...form.register('internalLength')} />
              {form.formState.errors.internalLength && (
                <p className="text-xs text-red-600">{String(form.formState.errors.internalLength.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="internalWidth">Ancho *</Label>
              <Input id="internalWidth" type="number" disabled={saving || disabled} {...form.register('internalWidth')} />
              {form.formState.errors.internalWidth && (
                <p className="text-xs text-red-600">{String(form.formState.errors.internalWidth.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="internalHeight">Alto *</Label>
              <Input id="internalHeight" type="number" disabled={saving || disabled} {...form.register('internalHeight')} />
              {form.formState.errors.internalHeight && (
                <p className="text-xs text-red-600">{String(form.formState.errors.internalHeight.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxWeight">Peso máx. (kg) *</Label>
              <Input id="maxWeight" type="number" disabled={saving || disabled} {...form.register('maxWeight')} />
              {form.formState.errors.maxWeight && (
                <p className="text-xs text-red-600">{String(form.formState.errors.maxWeight.message)}</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div className="rounded-lg border p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Refrigeración</p>
              <p className="text-sm text-gray-500">Control de temperatura</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              disabled={saving || disabled}
              checked={Boolean(hasRef)}
              onChange={(e) => form.setValue('hasRefrigeration', e.target.checked)}
            />
          </div>

          <div className="rounded-lg border p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">HazMat</p>
              <p className="text-sm text-gray-500">Material peligroso</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              disabled={saving || disabled}
              checked={Boolean(form.watch('hazardousMaterialAuthorized'))}
              onChange={(e) => form.setValue('hazardousMaterialAuthorized', e.target.checked)}
            />
          </div>
        </div>

        {hasRef && (
          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="minTemperature">Temp. mínima (°C)</Label>
              <Input id="minTemperature" type="number" disabled={saving || disabled} {...form.register('minTemperature')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxTemperature">Temp. máxima (°C)</Label>
              <Input id="maxTemperature" type="number" disabled={saving || disabled} {...form.register('maxTemperature')} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="axles">Ejes</Label>
          <Input id="axles" type="number" disabled={saving || disabled} {...form.register('axles')} />
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={saving || disabled}>
          {saving ? 'Guardando…' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
