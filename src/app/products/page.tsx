"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Filter, Edit2, Trash2, Package } from 'lucide-react'
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

type Product = {
  id: string
  name: string
  description: string | null
  category: string
  subcategory: string | null
  hsCode: string | null
  length: number
  width: number
  height: number
  weight: number
  volume: number
  fragility: string | null
  temperatureReq: string | null
  temperatureMin: number | null
  temperatureMax: number | null
  isHazardous: boolean
  hazardClass: string | null
  unNumber: string | null
  isActive: boolean
}

const categoryColors: Record<string, string> = {
  automotriz: 'bg-blue-100 text-blue-800',
  electronica: 'bg-purple-100 text-purple-800',
  maquinaria: 'bg-indigo-100 text-indigo-800',
  medico: 'bg-pink-100 text-pink-800',
  energia: 'bg-amber-100 text-amber-800',
  infraestructura: 'bg-gray-100 text-gray-800',
  carnicos: 'bg-red-100 text-red-800',
  lacteos: 'bg-emerald-100 text-emerald-800',
  frutas_verduras: 'bg-lime-100 text-lime-800',
  procesados: 'bg-orange-100 text-orange-800',
  congelados: 'bg-cyan-100 text-cyan-800',
  granos: 'bg-yellow-100 text-yellow-800',
  peligrosas: 'bg-red-100 text-red-800',
  generales: 'bg-gray-100 text-gray-800',
}

const categoryLabels: Record<string, string> = {
  automotriz: 'Automotriz',
  electronica: 'Electrónica',
  maquinaria: 'Maquinaria',
  medico: 'Médico',
  energia: 'Energía',
  infraestructura: 'Infraestructura',
  carnicos: 'Cárnicos',
  lacteos: 'Lácteos',
  frutas_verduras: 'Frutas y Verduras',
  procesados: 'Procesados',
  congelados: 'Congelados',
  granos: 'Granos',
  peligrosas: 'Peligrosas',
  generales: 'Generales',
}

const productSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  category: z.string().min(1, 'Categoría requerida'),
  hsCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  length: z.coerce.number().positive('Largo requerido'),
  width: z.coerce.number().positive('Ancho requerido'),
  height: z.coerce.number().positive('Alto requerido'),
  weight: z.coerce.number().positive('Peso requerido'),
  fragility: z.string().nullable().optional(),
  temperatureReq: z.string().nullable().optional(),
  temperatureMin: z.coerce.number().nullable().optional(),
  temperatureMax: z.coerce.number().nullable().optional(),
  isHazardous: z.boolean().optional().default(false),
  hazardClass: z.string().nullable().optional(),
  unNumber: z.string().nullable().optional(),
});

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/products', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Error cargando productos')
      setProducts(json.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando productos')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredProducts = useMemo(() => {
    const t = searchTerm.trim().toLowerCase()
    if (!t) return products
    return products.filter(p =>
      p.name.toLowerCase().includes(t) || (p.category || '').toLowerCase().includes(t)
    )
  }, [products, searchTerm])

  async function createProduct(values: z.infer<typeof productSchema>) {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo crear')
    await load()
    setIsCreateOpen(false)
  }

  async function updateProduct(id: string, values: z.infer<typeof productSchema>) {
    const res = await fetch(`/api/products/${id}`,
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

  async function deleteProduct(p: Product) {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return
    const res = await fetch(`/api/products/${p.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || 'No se pudo eliminar')
    await load()
  }

  function openEdit(p: Product) {
    setEditing(p)
    setIsEditOpen(true)
  }

  function formatDims(p: Product) {
    return `${p.length}×${p.width}×${p.height}`
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-500">Gestión de mercancías y productos</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Producto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agregar Nuevo Producto</DialogTitle>
              <DialogDescription>
                Complete los datos del producto. Los campos marcados con * son obligatorios.
              </DialogDescription>
            </DialogHeader>
            <ProductDialogForm submitLabel="Crear" onSubmit={createProduct} />
          </DialogContent>
        </Dialog>

        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Producto</DialogTitle>
              <DialogDescription>Actualiza los campos necesarios.</DialogDescription>
            </DialogHeader>
            <ProductDialogForm
              submitLabel="Guardar"
              defaultValues={editing || undefined}
              disabled={!editing}
              onSubmit={(vals) => updateProduct(editing!.id, vals)}
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
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar productos…"
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Button variant="outline" disabled>
              <Filter className="h-4 w-4 mr-2" />
              Filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Lista de Productos ({filteredProducts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Cargando…</div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              No hay productos aún. Crea el primero con “Nuevo Producto”.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Subcategoría</TableHead>
                  <TableHead>Dimensiones (cm)</TableHead>
                  <TableHead>Peso</TableHead>
                  <TableHead>Peligroso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-sm text-gray-500">HS: {p.hsCode || '-'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={categoryColors[p.category] || 'bg-gray-100 text-gray-800'}>
                        {categoryLabels[p.category] || p.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.subcategory || '-'}</TableCell>
                    <TableCell>{formatDims(p)}</TableCell>
                    <TableCell>{p.weight} kg</TableCell>
                    <TableCell>
                      {p.isHazardous ? (
                        <Badge variant="destructive">
                          {p.hazardClass || 'Peligroso'}{p.unNumber ? ` • ${p.unNumber}` : ''}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteProduct(p)}>
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

function ProductDialogForm({
  onSubmit,
  submitLabel,
  defaultValues,
  disabled,
}: {
  onSubmit: (values: z.infer<typeof productSchema>) => Promise<void>
  submitLabel: string
  defaultValues?: Partial<Product>
  disabled?: boolean
}) {
  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: defaultValues?.name || '',
      category: defaultValues?.category || '',
      hsCode: defaultValues?.hsCode || '',
      description: defaultValues?.description || '',
      subcategory: defaultValues?.subcategory || '',
      length: (defaultValues?.length as any) ?? ('' as any),
      width: (defaultValues?.width as any) ?? ('' as any),
      height: (defaultValues?.height as any) ?? ('' as any),
      weight: (defaultValues?.weight as any) ?? ('' as any),
      fragility: defaultValues?.fragility || 'baja',
      temperatureReq: defaultValues?.temperatureReq || 'ambiente',
      temperatureMin: defaultValues?.temperatureMin ?? null,
      temperatureMax: defaultValues?.temperatureMax ?? null,
      isHazardous: defaultValues?.isHazardous || false,
      hazardClass: defaultValues?.hazardClass || '',
      unNumber: defaultValues?.unNumber || '',
    },
  });

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isHaz = form.watch('isHazardous')

  async function handle(values: z.infer<typeof productSchema>) {
    setSaving(true)
    setFormError(null)
    try {
      await onSubmit({
        ...values,
        hsCode: values.hsCode || null,
        description: values.description || null,
        subcategory: values.subcategory || null,
        fragility: values.fragility || null,
        temperatureReq: values.temperatureReq || null,
        temperatureMin: values.temperatureMin ?? null,
        temperatureMax: values.temperatureMax ?? null,
        hazardClass: values.hazardClass || null,
        unNumber: values.unNumber || null,
        isHazardous: Boolean(values.isHazardous),
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
          <Label htmlFor="name">Nombre del Producto *</Label>
          <Input id="name" placeholder="Ej: Motor V8 5.0L" disabled={saving || disabled} {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-xs text-red-600">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Categoría *</Label>
          <Select
            value={form.watch('category') || ''}
            onValueChange={(v) => form.setValue('category', v)}
            disabled={saving || disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccione categoría" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.category && (
            <p className="text-xs text-red-600">{form.formState.errors.category.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hsCode">Código HS (Arancelario)</Label>
          <Input id="hsCode" placeholder="Ej: 8407.34.01" disabled={saving || disabled} {...form.register('hsCode')} />
        </div>

        <div className="col-span-2 space-y-2">
          <Label htmlFor="subcategory">Subcategoría</Label>
          <Input id="subcategory" placeholder="Ej: Motores" disabled={saving || disabled} {...form.register('subcategory')} />
        </div>

        <div className="col-span-2">
          <h4 className="font-medium text-gray-900 mb-2">Dimensiones (cm)</h4>
          <div className="grid grid-cols-4 gap-2">
            <div className="space-y-2">
              <Label htmlFor="length">Largo *</Label>
              <Input id="length" type="number" placeholder="cm" disabled={saving || disabled} {...form.register('length')} />
              {form.formState.errors.length && (
                <p className="text-xs text-red-600">{String(form.formState.errors.length.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="width">Ancho *</Label>
              <Input id="width" type="number" placeholder="cm" disabled={saving || disabled} {...form.register('width')} />
              {form.formState.errors.width && (
                <p className="text-xs text-red-600">{String(form.formState.errors.width.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Alto *</Label>
              <Input id="height" type="number" placeholder="cm" disabled={saving || disabled} {...form.register('height')} />
              {form.formState.errors.height && (
                <p className="text-xs text-red-600">{String(form.formState.errors.height.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Peso (kg) *</Label>
              <Input id="weight" type="number" placeholder="kg" disabled={saving || disabled} {...form.register('weight')} />
              {form.formState.errors.weight && (
                <p className="text-xs text-red-600">{String(form.formState.errors.weight.message)}</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Fragilidad</Label>
          <Select
            value={form.watch('fragility') || 'baja'}
            onValueChange={(v) => form.setValue('fragility', v)}
            disabled={saving || disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="baja">Baja</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="muy_alta">Muy Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Temperatura</Label>
          <Select
            value={form.watch('temperatureReq') || 'ambiente'}
            onValueChange={(v) => form.setValue('temperatureReq', v)}
            disabled={saving || disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ambiente">Ambiente</SelectItem>
              <SelectItem value="refrigerado">Refrigerado</SelectItem>
              <SelectItem value="congelado">Congelado</SelectItem>
              <SelectItem value="caliente">Caliente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="temperatureMin">Temp. mínima (°C)</Label>
            <Input id="temperatureMin" type="number" disabled={saving || disabled} {...form.register('temperatureMin')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="temperatureMax">Temp. máxima (°C)</Label>
            <Input id="temperatureMax" type="number" disabled={saving || disabled} {...form.register('temperatureMax')} />
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="font-medium text-gray-900">Material Peligroso</p>
            <p className="text-sm text-gray-500">Activa si requiere manejo especial</p>
          </div>
          <input
            type="checkbox"
            className="h-5 w-5"
            disabled={saving || disabled}
            checked={Boolean(isHaz)}
            onChange={(e) => form.setValue('isHazardous', e.target.checked)}
          />
        </div>

        {isHaz && (
          <>
            <div className="space-y-2">
              <Label htmlFor="hazardClass">Clase</Label>
              <Input id="hazardClass" placeholder="Ej: Clase 9" disabled={saving || disabled} {...form.register('hazardClass')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unNumber">UN</Label>
              <Input id="unNumber" placeholder="Ej: UN3480" disabled={saving || disabled} {...form.register('unNumber')} />
            </div>
          </>
        )}

        <div className="col-span-2 space-y-2">
          <Label htmlFor="description">Descripción</Label>
          <Input id="description" placeholder="Notas / instrucciones" disabled={saving || disabled} {...form.register('description')} />
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
