'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type CatalogProduct = {
  id: string
  name: string
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
}

type CatalogVehicle = {
  id: string
  name: string
  plateNumber?: string | null
}

type EditableRow = {
  rowId: string
  productId: string
  quantity: number
  routeStop: number
}

type FloatingNotice = {
  type: 'success' | 'error'
  message: string
} | null

export default function EditLoadPlanPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const planId = typeof params?.id === 'string' ? params.id : ''

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<FloatingNotice>(null)

  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [vehicles, setVehicles] = useState<CatalogVehicle[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [items, setItems] = useState<EditableRow[]>([])

  const fetchData = useCallback(async () => {
    if (!planId) return
    try {
      setLoading(true)
      setError(null)

      const [planRes, productsRes, vehiclesRes] = await Promise.all([
        fetch(`/api/load-plans/${planId}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/products', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/vehicles', { credentials: 'include', cache: 'no-store' }),
      ])

      if (!planRes.ok) {
        const e = await planRes.json().catch(() => ({}))
        throw new Error(e?.error ?? 'No se pudo cargar el plan')
      }
      if (!productsRes.ok) throw new Error('No se pudo cargar el catalogo de productos')
      if (!vehiclesRes.ok) throw new Error('No se pudo cargar el catalogo de unidades')

      const planJson = await planRes.json()
      const productsJson = await productsRes.json()
      const vehiclesJson = await vehiclesRes.json()

      const plan = planJson?.data
      const nextProducts: CatalogProduct[] = Array.isArray(productsJson?.data) ? productsJson.data : []
      const nextVehicles: CatalogVehicle[] = Array.isArray(vehiclesJson?.data) ? vehiclesJson.data : []
      const nextItems: EditableRow[] = Array.isArray(plan?.items)
        ? plan.items
            .filter((it: any) => it?.productId)
            .map((it: any, idx: number) => ({
              rowId: `existing-${idx}-${String(it.id ?? idx)}`,
              productId: String(it.productId),
              quantity: Math.max(1, Number(it.quantity ?? 1)),
              routeStop: Math.max(1, Number(it.routeStop ?? 1)),
            }))
        : []

      setProducts(nextProducts)
      setVehicles(nextVehicles)
      setName(String(plan?.name ?? ''))
      setDescription(String(plan?.description ?? ''))
      setVehicleId(String(plan?.vehicle?.id ?? plan?.vehicleId ?? ''))
      setItems(nextItems)
    } catch (e: any) {
      setError(e?.message ?? 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const productsById = useMemo(
    () => new Map(products.map((p) => [p.id, p] as const)),
    [products]
  )

  const totalWeightKg = useMemo(() => {
    return items.reduce((sum, row) => {
      const p = productsById.get(row.productId)
      return sum + (Number(p?.weight ?? 0) * Number(row.quantity ?? 0))
    }, 0)
  }, [items, productsById])

  const addRow = () => {
    const firstProductId = products[0]?.id ?? ''
    setItems((prev) => [
      ...prev,
      {
        rowId: `new-${Date.now()}-${prev.length}`,
        productId: firstProductId,
        quantity: 1,
        routeStop: 1,
      },
    ])
  }

  const updateRow = (rowId: string, patch: Partial<EditableRow>) => {
    setItems((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row))
    )
  }

  const removeRow = (rowId: string) => {
    setItems((prev) => prev.filter((row) => row.rowId !== rowId))
  }

  const save = async () => {
    if (!planId) return
    setNotice(null)
    setError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('El nombre del plan es requerido')
      return
    }
    if (!vehicleId) {
      setError('Debes seleccionar una unidad/caja')
      return
    }
    if (items.length === 0) {
      setError('Debes incluir al menos un producto')
      return
    }
    if (items.some((i) => !i.productId || i.quantity <= 0 || i.routeStop <= 0)) {
      setError('Revisa productos, cantidades y paradas')
      return
    }

    try {
      setSaving(true)
      const res = await fetch(`/api/load-plans/${planId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || null,
          vehicleId,
          items: items.map((row) => ({
            productId: row.productId,
            quantity: Math.max(1, Math.floor(row.quantity)),
            routeStop: Math.max(1, Math.floor(row.routeStop)),
          })),
        }),
      })

      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error(e?.error ?? 'No se pudo guardar el plan')
      }

      setNotice({
        type: 'success',
        message: 'Plan actualizado y reoptimizado con la nueva configuracion.',
      })
      setTimeout(() => {
        router.push(`/load-plans/${planId}/view`)
      }, 900)
    } catch (e: any) {
      const message = e?.message ?? 'Error guardando cambios'
      setError(message)
      setNotice({
        type: 'error',
        message,
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6">Cargando editor de plan...</div>

  return (
    <div className="p-6 space-y-4">
      {notice && (
        <div
          className={`fixed right-6 top-20 z-50 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <p className="text-sm font-medium">{notice.message}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push(`/load-plans/${planId}/view`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Plan
          </Button>
          <div>
            <h1 className="text-xl font-bold">Editar Plan de Carga</h1>
            <p className="text-sm text-gray-500">{planId}</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Datos Generales</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nombre del plan</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Unidad / Caja</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una unidad" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} {v.plateNumber ? `(${v.plateNumber})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descripcion</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos y Cantidades</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {items.map((row) => {
              const product = productsById.get(row.productId)
              return (
                <div key={row.rowId} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end rounded border p-3">
                  <div className="md:col-span-6 space-y-1">
                    <Label>Producto</Label>
                    <Select
                      value={row.productId}
                      onValueChange={(value) => updateRow(row.rowId, { productId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un producto" />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label>Cantidad</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(row.rowId, { quantity: Math.max(1, Number(e.target.value || 1)) })
                      }
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label>Parada</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.routeStop}
                      onChange={(e) =>
                        updateRow(row.rowId, { routeStop: Math.max(1, Number(e.target.value || 1)) })
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button variant="outline" className="w-full" onClick={() => removeRow(row.rowId)}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Quitar
                    </Button>
                  </div>
                  <div className="md:col-span-12 text-xs text-gray-500">
                    Peso estimado: {(Number(product?.weight ?? 0) * row.quantity).toFixed(2)} kg
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={addRow}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Producto
            </Button>
            <p className="text-sm text-gray-600">
              Peso total estimado: <strong>{totalWeightKg.toFixed(2)} kg</strong>
            </p>
          </div>

          <p className="text-xs text-amber-700">
            Al cambiar unidad o productos, el plan se marca como pendiente y se limpia el layout previo para reoptimizar.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
