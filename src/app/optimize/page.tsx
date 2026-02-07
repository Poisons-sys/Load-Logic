'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Play,
  Plus,
  Minus,
  RotateCcw,
  Save,
  FileDown,
  Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import dynamic from "next/dynamic"

// Tipos (conectados a tu API real)
type OptimizeProduct = {
  id: string
  name: string
  category: string
  weight: number
  width: number
  height: number
  depth: number // para el simulador 3D; viene de `length` en DB
  fragility?: string | null
  __raw?: any
}

type OptimizeVehicle = {
  id: string
  name: string
  internalLength: number
  internalWidth: number
  internalHeight: number
  maxWeight: number
  __raw?: any
}

interface SelectedItem {
  product: OptimizeProduct
  quantity: number
}

interface OptimizationResult {
  placedItems: Array<{
    product: OptimizeProduct
    quantity: number
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
  }>
  utilization: number
  totalWeight: number
  weightDistribution: { front: number; center: number; rear: number }
  instructions: Array<{
    step: number
    description: string
    productName: string
    position: { x: number; y: number; z: number }
  }>
}

const LoadVisualizer3D = dynamic(
  () => import("@/components/LoadVisualizer3D"),
  { ssr: false }
)

export default function OptimizePage() {
  const [selectedVehicle, setSelectedVehicle] = useState<string>('')
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [loadPlanName, setLoadPlanName] = useState('')
  const [loadPlanId, setLoadPlanId] = useState<string | null>(null)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)

  // Datos reales (desde la DB vía API)
  const [availableProducts, setAvailableProducts] = useState<OptimizeProduct[]>([])
  const [availableVehicles, setAvailableVehicles] = useState<OptimizeVehicle[]>([])
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true)
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setIsLoadingCatalogs(true)
        setCatalogsError(null)

        const [pRes, vRes] = await Promise.all([
          fetch('/api/products', { cache: 'no-store', credentials: 'include' }),
          fetch('/api/vehicles', { cache: 'no-store', credentials: 'include' }),
        ])

        if (!pRes.ok) throw new Error('No se pudieron cargar los productos')
        if (!vRes.ok) throw new Error('No se pudieron cargar los vehículos')

        const pJson = await pRes.json()
        const vJson = await vRes.json()

        const rawProducts = (pJson?.data ?? []) as any[]
        const rawVehicles = (vJson?.data ?? []) as any[]

        const mappedProducts: OptimizeProduct[] = rawProducts
          .filter(p => p?.id)
          // ✅ IMPORTANT: excluye soft-deleted por si algo se coló
          .filter(p => p?.isActive !== false)
          .map(p => ({
            id: String(p.id),
            name: String(p.name ?? 'Producto'),
            category: String(p.category ?? 'generales'),
            weight: Number(p.weight ?? 0),
            width: Number(p.width ?? 0),
            height: Number(p.height ?? 0),
            depth: Number(p.length ?? 0), // ✅ DB usa length
            fragility: p.fragility ?? null,
            __raw: p,
          }))
          .filter(p => p.width > 0 && p.height > 0 && p.depth > 0)

        const mappedVehicles: OptimizeVehicle[] = rawVehicles
          .filter(v => v?.id)
          .map(v => ({
            id: String(v.id),
            name: String(v.name ?? 'Unidad'),
            internalLength: Number(v.internalLength ?? 0),
            internalWidth: Number(v.internalWidth ?? 0),
            internalHeight: Number(v.internalHeight ?? 0),
            maxWeight: Number(v.maxWeight ?? 0),
            __raw: v,
          }))
          .filter(v => v.internalLength > 0 && v.internalWidth > 0 && v.internalHeight > 0)

        if (cancelled) return

        setAvailableProducts(mappedProducts)
        setAvailableVehicles(mappedVehicles)

        // ✅ Limpia selección: quita productos que ya no existen/activos
        setSelectedItems(prev =>
          prev.filter(it => mappedProducts.some(p => p.id === it.product.id))
        )

        if (selectedVehicle && !mappedVehicles.some(v => v.id === selectedVehicle)) {
          setSelectedVehicle('')
        }
      } catch (e) {
        if (cancelled) return
        setCatalogsError(e instanceof Error ? e.message : 'Error cargando catálogos')
        setAvailableProducts([])
        setAvailableVehicles([])
      } finally {
        if (!cancelled) setIsLoadingCatalogs(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const vehicle = useMemo(
    () => availableVehicles.find(v => v.id === selectedVehicle),
    [availableVehicles, selectedVehicle]
  )

  const addItem = (product: OptimizeProduct) => {
    const existing = selectedItems.find(item => item.product.id === product.id)
    if (existing) {
      setSelectedItems(selectedItems.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setSelectedItems([...selectedItems, { product, quantity: 1 }])
    }
  }

  const removeItem = (productId: string) => {
    const existing = selectedItems.find(item => item.product.id === productId)
    if (existing && existing.quantity > 1) {
      setSelectedItems(selectedItems.map(item =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity - 1 }
          : item
      ))
    } else {
      setSelectedItems(selectedItems.filter(item => item.product.id !== productId))
    }
  }

  const clearItems = () => {
    setSelectedItems([])
    setOptimizationResult(null)
    setLoadPlanId(null)
    setOptimizeError(null)
  }

  const runOptimization = async () => {
    if (!vehicle || selectedItems.length === 0) return

    setIsOptimizing(true)
    setOptimizeError(null)
    try {
      // ✅ Validación: solo mandar productos que sigan existiendo en availableProducts
      const validSelected = selectedItems
        .filter(it => it.quantity > 0)
        .filter(it => availableProducts.some(p => p.id === it.product.id))

      const invalidIds = selectedItems
        .filter(it => it.quantity > 0)
        .filter(it => !availableProducts.some(p => p.id === it.product.id))
        .map(it => it.product.id)

      if (invalidIds.length > 0) {
        // Esto evita el error "Productos no válidos" del backend
        throw new Error(`Productos no válidos: ${invalidIds.join(', ')}`)
      }

      if (validSelected.length === 0) {
        throw new Error('No hay productos válidos seleccionados. (Puede que hayas eliminado alguno)')
      }

      // 1) Crear plan real en DB
      const planName = (loadPlanName || `Optimización ${new Date().toLocaleString()}`).trim()
      const createRes = await fetch('/api/load-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: planName,
          vehicleId: vehicle.id,
          items: validSelected.map(it => ({ productId: it.product.id, quantity: it.quantity })),
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo crear el plan de carga')
      }

      const created = await createRes.json()
      const newPlanId = created?.data?.id
      if (!newPlanId) throw new Error('No se recibió el ID del plan')
      setLoadPlanId(String(newPlanId))

      // 2) Ejecutar algoritmo real
      const optRes = await fetch(`/api/load-plans/${newPlanId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })

      if (!optRes.ok) {
        const err = await optRes.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Falló la optimización')
      }

      const optJson = await optRes.json()
      const lp = optJson?.data?.loadPlan

      if (!lp?.vehicle) throw new Error('Respuesta inválida del servidor (sin vehículo)')

      // 3) Adaptar respuesta real a la UI actual
      const placedItems = (lp?.items ?? [])
        .filter((it: any) => it?.product)
        .map((it: any) => ({
          product: {
            id: String(it.product.id),
            name: String(it.product.name ?? 'Producto'),
            category: String(it.product.category ?? 'generales'),
            weight: Number(it.product.weight ?? 0),
            width: Number(it.product.width ?? 0),
            height: Number(it.product.height ?? 0),
            depth: Number(it.product.length ?? it.product.depth ?? 0),
            fragility: it.product.fragility ?? null,
            __raw: it.product,
          } as OptimizeProduct,
          quantity: Number(it.quantity ?? 1),
          position: {
            x: Number(it.positionX ?? 0),
            y: Number(it.positionY ?? 0),
            z: Number(it.positionZ ?? 0),
          },
          rotation: {
            x: Number(it.rotationX ?? 0),
            y: Number(it.rotationY ?? 0),
            z: Number(it.rotationZ ?? 0),
          },
        }))

      const result: OptimizationResult = {
        placedItems,
        utilization: Number(lp.spaceUtilization ?? optJson?.data?.optimization?.utilization ?? 0),
        totalWeight: Number(lp.totalWeight ?? optJson?.data?.optimization?.totalWeight ?? 0),
        weightDistribution: (lp.weightDistribution ?? optJson?.data?.optimization?.weightDistribution ?? { front: 0, center: 0, rear: 0 }),
        instructions: (lp.instructions ?? []).map((ins: any) => ({
          step: Number(ins.step ?? 0),
          description: String(ins.description ?? ''),
          productName: String(ins.productName ?? ''),
          position: (ins.position ?? { x: 0, y: 0, z: 0 }),
        })),
      }

      setOptimizationResult(result)
    } catch (e) {
      console.error('Error optimizando:', e)
      setOptimizationResult(null)
      setLoadPlanId(null)
      setOptimizeError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setIsOptimizing(false)
    }
  }

  // Convertir resultado a formato para visualizador 3D
  const cubesForVisualizer = useMemo(() => {
    const placed = optimizationResult?.placedItems ?? []
    const out: any[] = []
    placed.forEach((item: any, idx: number) => {
      const qty = Number(item.quantity ?? 1)
      const gap = 2
      const stepX = Number(item.product?.width ?? 0) + gap
      for (let q = 0; q < Math.max(qty, 1); q++) {
        out.push({
          id: `${item.product.id}-${idx}-${q}`,
          x: Number(item.position?.x ?? 0) + (q * stepX),
          y: Number(item.position?.y ?? 0),
          z: Number(item.position?.z ?? 0),
          width: Number(item.product?.width ?? 0),
          height: Number(item.product?.height ?? 0),
          depth: Number(item.product?.depth ?? item.product?.length ?? 0),
          color: getCategoryColor(item.product?.category ?? 'generales'),
          name: String(item.product?.name ?? 'Producto'),
          weightKg: Number(item.product?.weight ?? 0),
          product: item.product as any,
        })
      }
    })
    return out
  }, [optimizationResult])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Optimización de Estiba</h1>
          <p className="text-gray-500">Configure los productos y genere el plan de carga óptimo</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearItems}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Limpiar
          </Button>
          <Button
            onClick={runOptimization}
            disabled={isLoadingCatalogs || !!catalogsError || !vehicle || selectedItems.length === 0 || isOptimizing}
          >
            <Play className="h-4 w-4 mr-2" />
            {isOptimizing ? 'Optimizando...' : 'Optimizar'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configuration */}
        <div className="space-y-6">
          {(isLoadingCatalogs || catalogsError) && (
            <Card>
              <CardContent className="pt-6">
                {isLoadingCatalogs ? (
                  <p className="text-sm text-gray-600">Cargando productos y unidades desde tu base de datos…</p>
                ) : (
                  <p className="text-sm text-red-600">{catalogsError}</p>
                )}
              </CardContent>
            </Card>
          )}

          {optimizeError && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-red-600">{optimizeError}</p>
              </CardContent>
            </Card>
          )}

          {/* Vehicle Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Selección de Unidad</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Unidad de Transporte</Label>
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVehicles.length === 0 ? (
                        <SelectItem value="__no_vehicles" disabled>
                          No hay unidades registradas
                        </SelectItem>
                      ) : (
                        availableVehicles.map(vehicle => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.name} - {(vehicle.maxWeight / 1000).toFixed(1)} ton
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {vehicle && (
                  <div className="p-4 bg-gray-50 rounded-lg text-sm">
                    <p><strong>Dimensiones:</strong> {vehicle.internalLength}×{vehicle.internalWidth}×{vehicle.internalHeight} cm</p>
                    <p><strong>Capacidad:</strong> {(vehicle.maxWeight / 1000).toFixed(1)} ton</p>
                    <p><strong>Volumen:</strong> {((vehicle.internalLength * vehicle.internalWidth * vehicle.internalHeight) / 1000000).toFixed(1)} m³</p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Nombre del Plan de Carga</Label>
                  <Input
                    placeholder="Ej: Carga Cliente ABC - Enero 2024"
                    value={loadPlanName}
                    onChange={(e) => setLoadPlanName(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Product Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Agregar Productos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {availableProducts.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500 bg-gray-50 rounded-lg">
                    No hay productos registrados. Ve a <strong>Productos</strong> y agrega al menos uno.
                  </div>
                ) : availableProducts.map(product => {
                  const selected = selectedItems.find(item => item.product.id === product.id)
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{product.name}</p>
                        <p className="text-xs text-gray-500">
                          {product.weight} kg • {product.width}×{product.height}×{product.depth} cm
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selected && (
                          <>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeItem(product.id)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center font-medium">{selected.quantity}</span>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => addItem(product)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Selected Items Summary */}
          {selectedItems.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Resumen de Carga</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Total de productos:</span>
                    <span className="font-medium">{selectedItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Peso total:</span>
                    <span className="font-medium">
                      {(selectedItems.reduce((sum, item) => sum + item.product.weight * item.quantity, 0) / 1000).toFixed(2)} ton
                    </span>
                  </div>
                  {vehicle && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Capacidad usada:</span>
                      <span className={`font-medium ${
                        (selectedItems.reduce((sum, item) => sum + item.product.weight * item.quantity, 0) / vehicle.maxWeight) > 0.9
                          ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {((selectedItems.reduce((sum, item) => sum + item.product.weight * item.quantity, 0) / vehicle.maxWeight) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="lg:col-span-2">
          {optimizationResult ? (
            <Tabs defaultValue="visualization" className="space-y-4">
              <TabsList>
                <TabsTrigger value="visualization">Visualización 3D</TabsTrigger>
                <TabsTrigger value="details">Detalles</TabsTrigger>
                <TabsTrigger value="instructions">Instrucciones</TabsTrigger>
              </TabsList>

              <TabsContent value="visualization">
                <Card>
                  <CardContent className="p-0">
                    {vehicle && (
                      <LoadVisualizer3D
                        container={{
                          width: vehicle.internalWidth,
                          height: vehicle.internalHeight,
                          depth: vehicle.internalLength,
                        }}
                        cubes={cubesForVisualizer}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="details">
                <Card>
                  <CardHeader>
                    <CardTitle>Detalles de la Optimización</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Utilización del Espacio</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {optimizationResult.utilization.toFixed(1)}%
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Peso Total</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {(optimizationResult.totalWeight / 1000).toFixed(2)} ton
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Productos Colocados</p>
                        <p className="text-2xl font-bold text-gray-900">
                          {optimizationResult.placedItems.length}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Distribución de Peso</p>
                        <p className="text-lg font-bold text-gray-900">
                          F: {optimizationResult.weightDistribution.front}%
                          C: {optimizationResult.weightDistribution.center}%
                          R: {optimizationResult.weightDistribution.rear}%
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex gap-2">
                      <Button>
                        <Save className="h-4 w-4 mr-2" />
                        Guardar Plan
                      </Button>
                      <Button variant="outline">
                        <FileDown className="h-4 w-4 mr-2" />
                        Exportar PDF
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="instructions">
                <Card>
                  <CardHeader>
                    <CardTitle>Instrucciones de Carga</CardTitle>
                    <CardDescription>
                      Siga estos pasos en orden para cargar correctamente la unidad
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {optimizationResult.instructions.map((instruction) => (
                        <div
                          key={instruction.step}
                          className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg"
                        >
                          <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-medium">
                            {instruction.step}
                          </div>
                          <div>
                            <p className="font-medium">{instruction.description}</p>
                            <p className="text-sm text-gray-500">
                              Posición: ({instruction.position.x}, {instruction.position.y}, {instruction.position.z})
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="h-full flex items-center justify-center min-h-[500px]">
              <CardContent className="text-center">
                <Info className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Vista Previa</h3>
                <p className="text-gray-500 mt-2">
                  Seleccione una unidad y agregue productos para ver la visualización 3D
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// Función auxiliar para obtener color de categoría
function getCategoryColor(category: string): string {
  const colors: Record<string, string> = {
    automotriz: '#3B82F6',
    electronica: '#8B5CF6',
    maquinaria: '#6366F1',
    medico: '#EC4899',
    energia: '#F59E0B',
    infraestructura: '#6B7280',
    carnicos: '#EF4444',
    lacteos: '#10B981',
    frutas_verduras: '#84CC16',
    procesados: '#F97316',
    congelados: '#06B6D4',
    granos: '#D97706',
    peligrosas: '#DC2626',
    generales: '#9CA3AF',
  }
  return colors[category] || '#9CA3AF'
}
