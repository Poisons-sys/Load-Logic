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
import type { Cube3DData, LayoutEditStats } from '@/components/LoadVisualizer3D'

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
  maxStackHeight?: number | null
  maxTopLoadKg?: number | null
  allowRotate90?: boolean | null
  noStackAbove?: boolean | null
  floorOnly?: boolean | null
  specialInstructions?: string | null
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
  routeStop: number
}

interface OptimizationResult {
  placedItems: Array<{
    instanceId: string
    product: OptimizeProduct
    quantity: number
    routeStop: number
    stackLevel?: number
    supporterIds?: number[]
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
  }>
  requestedItemsCount: number
  placedItemsCount: number
  unplacedItems: Array<{
    instanceId?: string
    product: OptimizeProduct
    routeStop: number
    reason: string
    details: string
  }>
  utilization: number
  totalWeight: number
  weightDistribution: { front: number; center: number; rear: number }
  axleDistribution: {
    frontKg: number
    rearKg: number
    frontPct: number
    rearPct: number
    profile: string
    expectedFrontPctRange: { min: number; max: number }
    frontLimitKg: number
    rearLimitKg: number
    frontOverKg: number
    rearOverKg: number
    isCompliant: boolean
  }
  centerOfGravity: {
    x: number
    y: number
    z: number
    normalized: { x: number; y: number; z: number }
    zone: 'stable' | 'caution' | 'critical'
  }
  stability: {
    score: number
    level: 'stable' | 'caution' | 'critical'
    tippingRisk: number
    lateralBalancePct: number
    longitudinalBalancePct: number
    centerOfGravityHeightPct: number
  }
  heatmap: {
    resolutionCm: number
    rows: number
    cols: number
    cells: number[][]
    freeCells: number
    occupiedCells: number
  }
  validations: Array<{
    code: string
    severity: 'info' | 'warning' | 'critical'
    message: string
    details?: Record<string, unknown>
  }>
  kpis: {
    utilizationScore: number
    balanceScore: number
    stabilityScore: number
    sequenceScore: number
    complianceScore: number
    overallScore: number
    grade: 'A' | 'B' | 'C' | 'D'
  }
  instructions: Array<{
    step: number
    description: string
    productName: string
    instanceId: string
    routeStop: number
    loadingZone: 'front' | 'center' | 'rear'
    position: { x: number; y: number; z: number }
  }>
  ai?: {
    strategy: 'baseline' | 'intelligent'
    candidatesEvaluated: number
    selectedCandidateIndex: number
    baselineScore: number
    bestScore: number
    baselineCriticalCount: number
    bestCriticalCount: number
    improved: boolean
  }
}

const LoadVisualizer3D = dynamic(
  () => import("@/components/LoadVisualizer3D"),{ 
    ssr: false,
})

type ManualLayoutIssue = {
  code: string
  severity: 'warning' | 'critical'
  message: string
}

type ManualLayoutValidation = {
  outOfBounds: number
  collisions: number
  unsupported: number
  axleCompliant: boolean
  frontOverKg: number
  rearOverKg: number
  cogZone: 'stable' | 'caution' | 'critical'
  issues: ManualLayoutIssue[]
  hasCritical: boolean
}

function quarterTurn(rotY?: number) {
  const rad = Number(rotY ?? 0)
  const q = Math.round(rad / (Math.PI / 2))
  return ((q % 4) + 4) % 4
}

function effectiveDims(cube: Cube3DData) {
  const q = quarterTurn(cube.rotY)
  const isSwapped = q === 1 || q === 3
  return {
    width: isSwapped ? cube.depth : cube.width, // lateral z
    depth: isSwapped ? cube.width : cube.depth, // avance x
    height: cube.height,
  }
}

function boxesOverlap1D(a1: number, a2: number, b1: number, b2: number) {
  return a1 < b2 - 0.01 && a2 > b1 + 0.01
}

function evaluateManualLayout(cubes: Cube3DData[], vehicle: OptimizeVehicle | undefined): ManualLayoutValidation {
  if (!vehicle || cubes.length === 0) {
    return {
      outOfBounds: 0,
      collisions: 0,
      unsupported: 0,
      axleCompliant: true,
      frontOverKg: 0,
      rearOverKg: 0,
      cogZone: 'stable',
      issues: [],
      hasCritical: false,
    }
  }

  let outOfBounds = 0
  let collisions = 0
  let unsupported = 0

  const bounds = cubes.map((cube) => {
    const dims = effectiveDims(cube)
    const x1 = Number(cube.x ?? 0)
    const y1 = Number(cube.y ?? 0)
    const z1 = Number(cube.z ?? 0)
    const x2 = x1 + dims.depth
    const y2 = y1 + dims.height
    const z2 = z1 + dims.width
    return { cube, dims, x1, y1, z1, x2, y2, z2 }
  })

  for (const b of bounds) {
    if (
      b.x1 < -0.01 ||
      b.y1 < -0.01 ||
      b.z1 < -0.01 ||
      b.x2 > Number(vehicle.internalLength) + 0.01 ||
      b.y2 > Number(vehicle.internalHeight) + 0.01 ||
      b.z2 > Number(vehicle.internalWidth) + 0.01
    ) {
      outOfBounds += 1
    }
  }

  for (let i = 0; i < bounds.length; i++) {
    for (let j = i + 1; j < bounds.length; j++) {
      const a = bounds[i]
      const b = bounds[j]
      const overlapX = boxesOverlap1D(a.x1, a.x2, b.x1, b.x2)
      const overlapY = boxesOverlap1D(a.y1, a.y2, b.y1, b.y2)
      const overlapZ = boxesOverlap1D(a.z1, a.z2, b.z1, b.z2)
      if (overlapX && overlapY && overlapZ) collisions += 1
    }
  }

  for (const top of bounds) {
    if (top.y1 <= 0.01) continue
    const supports = bounds.filter((base) => {
      const touching = Math.abs(base.y2 - top.y1) <= 1.01
      if (!touching) return false
      return boxesOverlap1D(top.x1, top.x2, base.x1, base.x2) && boxesOverlap1D(top.z1, top.z2, base.z1, base.z2)
    })
    if (supports.length === 0) unsupported += 1
  }

  const frontLimitKg = Number(vehicle.__raw?.frontAxleMaxWeight ?? 0)
  const rearLimitKg = Number(vehicle.__raw?.rearAxleMaxWeight ?? 0)
  const trailerDepth = Math.max(1, Number(vehicle.internalLength))
  let frontKg = 0
  let rearKg = 0
  let totalKg = 0
  let wx = 0
  let wy = 0
  let wz = 0

  for (const b of bounds) {
    const w = Number(b.cube.weightKg ?? b.cube.weight ?? 0)
    totalKg += w
    const centerX = b.x1 + b.dims.depth / 2
    const centerY = b.y1 + b.dims.height / 2
    const centerZ = b.z1 + b.dims.width / 2
    const rearShare = Math.max(0, Math.min(1, centerX / trailerDepth))
    const frontShare = 1 - rearShare
    frontKg += w * frontShare
    rearKg += w * rearShare
    wx += centerZ * w
    wy += centerY * w
    wz += centerX * w
  }

  const frontOverKg = Math.max(0, frontKg - frontLimitKg)
  const rearOverKg = Math.max(0, rearKg - rearLimitKg)
  const axleCompliant = frontOverKg <= 0.01 && rearOverKg <= 0.01

  const cogXNorm = totalKg > 0 ? (wx / totalKg) / Math.max(1, Number(vehicle.internalWidth)) : 0
  const cogYNorm = totalKg > 0 ? (wy / totalKg) / Math.max(1, Number(vehicle.internalHeight)) : 0
  const cogZNorm = totalKg > 0 ? (wz / totalKg) / Math.max(1, Number(vehicle.internalLength)) : 0
  const risk = Math.max(
    0,
    Math.min(
      1,
      Math.abs(cogXNorm - 0.5) * 0.9 +
        Math.abs(cogZNorm - 0.5) * 0.6 +
        Math.max(0, cogYNorm) * 0.7
    )
  )
  const cogZone: 'stable' | 'caution' | 'critical' = risk < 0.35 ? 'stable' : risk < 0.65 ? 'caution' : 'critical'

  const issues: ManualLayoutIssue[] = []
  if (outOfBounds > 0) {
    issues.push({
      code: 'OUT_OF_BOUNDS',
      severity: 'critical',
      message: `${outOfBounds} caja(s) fuera de limites del trailer.`,
    })
  }
  if (collisions > 0) {
    issues.push({
      code: 'COLLISIONS',
      severity: 'critical',
      message: `${collisions} colision(es) detectadas en layout manual.`,
    })
  }
  if (unsupported > 0) {
    issues.push({
      code: 'UNSUPPORTED_STACK',
      severity: 'critical',
      message: `${unsupported} caja(s) apiladas sin soporte valido.`,
    })
  }
  if (!axleCompliant) {
    issues.push({
      code: 'AXLE_OVERLOAD',
      severity: 'critical',
      message: `Exceso por ejes: frente ${frontOverKg.toFixed(1)}kg, trasero ${rearOverKg.toFixed(1)}kg.`,
    })
  }
  if (cogZone !== 'stable') {
    issues.push({
      code: 'COG_RISK',
      severity: cogZone === 'critical' ? 'critical' : 'warning',
      message: `Centro de gravedad en zona ${cogZone}.`,
    })
  }

  return {
    outOfBounds,
    collisions,
    unsupported,
    axleCompliant,
    frontOverKg,
    rearOverKg,
    cogZone,
    issues,
    hasCritical: issues.some((issue) => issue.severity === 'critical'),
  }
}

export default function OptimizePage() {
  const [selectedVehicle, setSelectedVehicle] = useState<string>('')
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null)
  const [scenarioA, setScenarioA] = useState<OptimizationResult | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizationStrategy, setOptimizationStrategy] = useState<'baseline' | 'intelligent'>('intelligent')
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [loadPlanName, setLoadPlanName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [loadPlanId, setLoadPlanId] = useState<string | null>(null)
  const [savedVehicleId, setSavedVehicleId] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null)
  const [optimizedSnapshot, setOptimizedSnapshot] = useState<string | null>(null)
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [optimizeError, setOptimizeError] = useState<string | null>(null)
  const [optimizeNotice, setOptimizeNotice] = useState<string | null>(null)
  const [visualizerCubes, setVisualizerCubes] = useState<Cube3DData[]>([])
  const [manualEditStats, setManualEditStats] = useState<LayoutEditStats | null>(null)

  // Datos reales (desde la DB vía API)
  const [availableProducts, setAvailableProducts] = useState<OptimizeProduct[]>([])
  const [availableVehicles, setAvailableVehicles] = useState<OptimizeVehicle[]>([])
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([])
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true)
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setIsLoadingCatalogs(true)
        setCatalogsError(null)

        const [pRes, vRes, tRes] = await Promise.all([
          fetch('/api/products', { cache: 'no-store', credentials: 'include' }),
          fetch('/api/vehicles', { cache: 'no-store', credentials: 'include' }),
          fetch('/api/load-plan-templates', { cache: 'no-store', credentials: 'include' }),
        ])

        if (!pRes.ok) throw new Error('No se pudieron cargar los productos')
        if (!vRes.ok) throw new Error('No se pudieron cargar los vehículos')
        if (!tRes.ok) throw new Error('No se pudieron cargar las plantillas')

        const pJson = await pRes.json()
        const vJson = await vRes.json()
        const tJson = await tRes.json()

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
            maxStackHeight: Number(p.maxStackHeight ?? 1),
            maxTopLoadKg: Number(p.maxTopLoadKg ?? 2500),
            allowRotate90: p.allowRotate90 ?? true,
            noStackAbove: p.noStackAbove ?? false,
            floorOnly: p.floorOnly ?? false,
            specialInstructions: p.specialInstructions ?? null,
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
        setAvailableTemplates((tJson?.data ?? []) as any[])

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
        setAvailableTemplates([])
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
  const configSnapshot = useMemo(() => {
    const items = selectedItems
      .map(item => ({ productId: item.product.id, quantity: item.quantity, routeStop: item.routeStop }))
      .sort((a, b) => a.productId.localeCompare(b.productId))

    return JSON.stringify({
      vehicleId: selectedVehicle || null,
      items,
    })
  }, [selectedItems, selectedVehicle])
  const saveSnapshot = useMemo(() => {
    const items = selectedItems
      .map(item => ({ productId: item.product.id, quantity: item.quantity, routeStop: item.routeStop }))
      .sort((a, b) => a.productId.localeCompare(b.productId))

    return JSON.stringify({
      vehicleId: selectedVehicle || null,
      name: (loadPlanName || '').trim(),
      items,
    })
  }, [loadPlanName, selectedItems, selectedVehicle])
  const canSave = Boolean(vehicle) && selectedItems.length > 0
  const hasUnsavedChanges = canSave && saveSnapshot !== savedSnapshot
  const hasValidOptimization = Boolean(
    optimizationResult &&
    optimizedSnapshot &&
    optimizedSnapshot === configSnapshot
  )
  const scenarioComparison = useMemo(() => {
    if (!scenarioA || !optimizationResult) return null
    return {
      utilizationDelta: optimizationResult.utilization - scenarioA.utilization,
      totalWeightDelta: optimizationResult.totalWeight - scenarioA.totalWeight,
      scoreDelta: optimizationResult.kpis.overallScore - scenarioA.kpis.overallScore,
      placedDelta: optimizationResult.placedItemsCount - scenarioA.placedItemsCount,
      unplacedDelta: optimizationResult.unplacedItems.length - scenarioA.unplacedItems.length,
    }
  }, [optimizationResult, scenarioA])

  useEffect(() => {
    if (saveFeedback?.type === 'success' && hasUnsavedChanges) {
      setSaveFeedback(null)
    }
  }, [hasUnsavedChanges, saveFeedback])

  useEffect(() => {
    if (optimizationResult && optimizedSnapshot && optimizedSnapshot !== configSnapshot) {
      setOptimizationResult(null)
      setVisualizerCubes([])
    }
  }, [configSnapshot, optimizationResult, optimizedSnapshot])

  const addItem = (product: OptimizeProduct) => {
    setSelectedItems(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { product, quantity: 1, routeStop: 1 }]
    })
  }

  const removeItem = (productId: string) => {
    setSelectedItems(prev => {
      const existing = prev.find(item => item.product.id === productId)
      if (existing && existing.quantity > 1) {
        return prev.map(item =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
      }
      return prev.filter(item => item.product.id !== productId)
    })
  }

  const setItemRouteStop = (productId: string, routeStop: number) => {
    const normalized = Math.max(1, Number.isFinite(routeStop) ? Math.floor(routeStop) : 1)
    setSelectedItems(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, routeStop: normalized }
          : item
      )
    )
  }

  const clearItems = () => {
    setSelectedItems([])
    setOptimizationResult(null)
    setScenarioA(null)
    setVisualizerCubes([])
    setOptimizedSnapshot(null)
    setLoadPlanId(null)
    setSavedVehicleId(null)
    setSavedSnapshot(null)
    setSaveFeedback(null)
    setOptimizeError(null)
    setOptimizeNotice(null)
    setManualEditStats(null)
  }

  const reloadTemplates = async () => {
    try {
      const res = await fetch('/api/load-plan-templates', {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!res.ok) return
      const json = await res.json()
      setAvailableTemplates((json?.data ?? []) as any[])
    } catch {
      // ignore template refresh errors on background
    }
  }

  const saveTemplate = async () => {
    if (selectedItems.length === 0) {
      setSaveFeedback({ type: 'error', message: 'Agrega productos antes de guardar una plantilla.' })
      return
    }

    setIsSavingTemplate(true)
    setSaveFeedback(null)
    try {
      const payload = {
        name: (templateName || `Plantilla ${new Date().toLocaleString()}`).trim(),
        vehicleId: selectedVehicle || undefined,
        items: selectedItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          routeStop: item.routeStop,
        })),
        metadata: {
          source: 'optimize-page',
        },
      }

      const res = await fetch('/api/load-plan-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo guardar la plantilla')
      }

      await reloadTemplates()
      setSaveFeedback({ type: 'success', message: 'Plantilla guardada correctamente.' })
    } catch (e) {
      setSaveFeedback({
        type: 'error',
        message: e instanceof Error ? e.message : 'Error guardando plantilla',
      })
    } finally {
      setIsSavingTemplate(false)
    }
  }

  const applyTemplate = (templateId: string) => {
    const template = availableTemplates.find((t: any) => String(t.id) === templateId)
    if (!template) return

    const templateItems = Array.isArray(template.items) ? template.items : []
    const nextSelected: SelectedItem[] = templateItems
      .map((it: any) => {
        const product = availableProducts.find((p) => p.id === String(it.productId))
        if (!product) return null
        return {
          product,
          quantity: Math.max(1, Number(it.quantity ?? 1)),
          routeStop: Math.max(1, Number(it.routeStop ?? 1)),
        }
      })
      .filter(Boolean) as SelectedItem[]

    if (nextSelected.length === 0) {
      setSaveFeedback({
        type: 'error',
        message: 'La plantilla no tiene productos validos en el catalogo actual.',
      })
      return
    }

    setSelectedItems(nextSelected)
    if (template.vehicleId && availableVehicles.some((v) => v.id === template.vehicleId)) {
      setSelectedVehicle(template.vehicleId)
    }

    setOptimizationResult(null)
    setScenarioA(null)
    setVisualizerCubes([])
    setOptimizedSnapshot(null)
    setSaveFeedback({ type: 'success', message: `Plantilla aplicada: ${template.name}` })
  }

  const savePlan = async () => {
    if (!vehicle || selectedItems.length === 0) return
    if (!hasValidOptimization) {
      setSaveFeedback({
        type: 'error',
        message: 'Primero optimiza la carga para poder guardar el plan.',
      })
      return
    }
    if (hasCriticalSaveBlock) {
      setSaveFeedback({
        type: 'error',
        message: 'No se puede guardar: existen validaciones criticas de seguridad/cumplimiento.',
      })
      return
    }

    setIsSaving(true)
    setSaveFeedback(null)
    setOptimizeError(null)
    setOptimizeNotice(null)
    try {
      const validSelected = selectedItems
        .filter(it => it.quantity > 0)
        .filter(it => availableProducts.some(p => p.id === it.product.id))

      const invalidIds = selectedItems
        .filter(it => it.quantity > 0)
        .filter(it => !availableProducts.some(p => p.id === it.product.id))
        .map(it => it.product.id)

      if (invalidIds.length > 0) {
        throw new Error(`Productos no validos: ${invalidIds.join(', ')}`)
      }

      if (validSelected.length === 0) {
        throw new Error('No hay productos validos seleccionados para guardar.')
      }

      const planName = (loadPlanName || `Optimizacion ${new Date().toLocaleString()}`).trim()
      const isSameVehicle = savedVehicleId === vehicle.id
      const shouldUpdateExisting = Boolean(loadPlanId && isSameVehicle)

      const endpoint = shouldUpdateExisting ? `/api/load-plans/${loadPlanId}` : '/api/load-plans'
      const method = shouldUpdateExisting ? 'PUT' : 'POST'
      const payload = shouldUpdateExisting
        ? {
            name: planName,
            items: validSelected.map(it => ({ productId: it.product.id, quantity: it.quantity, routeStop: it.routeStop })),
          }
        : {
            name: planName,
            vehicleId: vehicle.id,
            items: validSelected.map(it => ({ productId: it.product.id, quantity: it.quantity, routeStop: it.routeStop })),
          }

      const saveRes = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo guardar el plan de carga')
      }

      const savedJson = await saveRes.json()
      const newPlanId = String(savedJson?.data?.id ?? loadPlanId ?? '')
      if (!newPlanId) throw new Error('No se recibio el ID del plan guardado')

      const cubesToPersist = (visualizerCubes.length > 0 ? visualizerCubes : cubesForVisualizer).map(cube => ({
        instanceId: String(cube.instanceId ?? cube.id),
        id: cube.id,
        name: cube.name ?? cube.productName ?? 'Producto',
        x: Number(cube.x ?? 0),
        y: Number(cube.y ?? 0),
        z: Number(cube.z ?? 0),
        width: Number(cube.width ?? 0),
        height: Number(cube.height ?? 0),
        depth: Number(cube.depth ?? 0),
        rotY: Number(cube.rotY ?? 0),
        weightKg: Number(cube.weightKg ?? cube.weight ?? 0),
        productId: String(cube.product?.id ?? ''),
        routeStop: Number(cube.routeStop ?? selectedItems.find((it) => it.product.id === String(cube.product?.id ?? ''))?.routeStop ?? 1),
      }))

      const persistOptRes = await fetch(`/api/load-plans/${newPlanId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          manualCubes: cubesToPersist,
          telemetry: manualEditStats ?? undefined,
        }),
      })

      if (!persistOptRes.ok) {
        const err = await persistOptRes.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo guardar la optimizacion del plan')
      }

      setLoadPlanId(newPlanId)
      setSavedVehicleId(vehicle.id)
      setSavedSnapshot(saveSnapshot)
      setSaveFeedback({ type: 'success', message: 'Plan guardado correctamente.' })
    } catch (e) {
      setSaveFeedback({
        type: 'error',
        message: e instanceof Error ? e.message : 'Error desconocido al guardar',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const runOptimization = async () => {
    if (!vehicle || selectedItems.length === 0) return

    setIsOptimizing(true)
    setOptimizeError(null)
    setSaveFeedback(null)
    setOptimizeNotice(null)
    try {
      const validSelected = selectedItems
        .filter(it => it.quantity > 0)
        .filter(it => availableProducts.some(p => p.id === it.product.id))

      const invalidIds = selectedItems
        .filter(it => it.quantity > 0)
        .filter(it => !availableProducts.some(p => p.id === it.product.id))
        .map(it => it.product.id)

      if (invalidIds.length > 0) {
        throw new Error(`Productos no validos: ${invalidIds.join(', ')}`)
      }

      if (validSelected.length === 0) {
        throw new Error('No hay productos validos seleccionados. (Puede que hayas eliminado alguno)')
      }

      const optRes = await fetch('/api/load-plans/preview-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          vehicleId: vehicle.id,
          items: validSelected.map(it => ({ productId: it.product.id, quantity: it.quantity, routeStop: it.routeStop })),
          strategy: optimizationStrategy,
        }),
      })

      if (!optRes.ok) {
        const err = await optRes.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Fallo la optimizacion')
      }

      const optJson = await optRes.json()
      const optimization = optJson?.data?.optimization
      if (!optimization) throw new Error('Respuesta invalida del servidor')

      const placedItems = (optimization.placedItems ?? [])
        .filter((it: any) => it?.product)
        .map((it: any, idx: number) => ({
          instanceId: String(it.instanceId ?? `${String(it.product?.id ?? 'p')}-${idx + 1}`),
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
          routeStop: Number(it.routeStop ?? 1),
          stackLevel: Number(it.stackLevel ?? 1),
          supporterIds: Array.isArray(it.supporterIds) ? it.supporterIds.map((v: any) => Number(v)) : [],
          position: {
            x: Number(it.position?.x ?? 0),
            y: Number(it.position?.y ?? 0),
            z: Number(it.position?.z ?? 0),
          },
          rotation: {
            x: Number(it.rotation?.x ?? 0),
            y: Number(it.rotation?.y ?? 0),
            z: Number(it.rotation?.z ?? 0),
          },
        }))

      const result: OptimizationResult = {
        placedItems,
        requestedItemsCount: Number(optimization.requestedItemsCount ?? validSelected.reduce((sum, item) => sum + item.quantity, 0)),
        placedItemsCount: Number(optimization.placedItemsCount ?? placedItems.length),
        unplacedItems: (optimization.unplacedItems ?? []).map((u: any) => ({
          instanceId: u.instanceId ? String(u.instanceId) : undefined,
          product: {
            id: String(u.product?.id ?? 'unknown'),
            name: String(u.product?.name ?? 'Producto'),
            category: String(u.product?.category ?? 'generales'),
            weight: Number(u.product?.weight ?? 0),
            width: Number(u.product?.width ?? 0),
            height: Number(u.product?.height ?? 0),
            depth: Number(u.product?.length ?? u.product?.depth ?? 0),
            fragility: u.product?.fragility ?? null,
            __raw: u.product,
          } as OptimizeProduct,
          routeStop: Number(u.routeStop ?? 1),
          reason: String(u.reason ?? 'no_space'),
          details: String(u.details ?? ''),
        })),
        utilization: Number(optimization.utilization ?? 0),
        totalWeight: Number(optimization.totalWeight ?? 0),
        weightDistribution: (optimization.weightDistribution ?? { front: 0, center: 0, rear: 0 }),
        axleDistribution: {
          frontKg: Number(optimization.axleDistribution?.frontKg ?? 0),
          rearKg: Number(optimization.axleDistribution?.rearKg ?? 0),
          frontPct: Number(optimization.axleDistribution?.frontPct ?? 0),
          rearPct: Number(optimization.axleDistribution?.rearPct ?? 0),
          profile: String(optimization.axleDistribution?.profile ?? 'dry_van_standard'),
          expectedFrontPctRange: {
            min: Number(optimization.axleDistribution?.expectedFrontPctRange?.min ?? 30),
            max: Number(optimization.axleDistribution?.expectedFrontPctRange?.max ?? 50),
          },
          frontLimitKg: Number(optimization.axleDistribution?.frontLimitKg ?? 0),
          rearLimitKg: Number(optimization.axleDistribution?.rearLimitKg ?? 0),
          frontOverKg: Number(optimization.axleDistribution?.frontOverKg ?? 0),
          rearOverKg: Number(optimization.axleDistribution?.rearOverKg ?? 0),
          isCompliant: Boolean(optimization.axleDistribution?.isCompliant ?? true),
        },
        centerOfGravity: {
          x: Number(optimization.centerOfGravity?.x ?? 0),
          y: Number(optimization.centerOfGravity?.y ?? 0),
          z: Number(optimization.centerOfGravity?.z ?? 0),
          normalized: {
            x: Number(optimization.centerOfGravity?.normalized?.x ?? 0),
            y: Number(optimization.centerOfGravity?.normalized?.y ?? 0),
            z: Number(optimization.centerOfGravity?.normalized?.z ?? 0),
          },
          zone: (optimization.centerOfGravity?.zone ?? 'critical') as 'stable' | 'caution' | 'critical',
        },
        stability: {
          score: Number(optimization.stability?.score ?? 0),
          level: (optimization.stability?.level ?? 'critical') as 'stable' | 'caution' | 'critical',
          tippingRisk: Number(optimization.stability?.tippingRisk ?? 0),
          lateralBalancePct: Number(optimization.stability?.lateralBalancePct ?? 0),
          longitudinalBalancePct: Number(optimization.stability?.longitudinalBalancePct ?? 0),
          centerOfGravityHeightPct: Number(optimization.stability?.centerOfGravityHeightPct ?? 0),
        },
        heatmap: {
          resolutionCm: Number(optimization.heatmap?.resolutionCm ?? 40),
          rows: Number(optimization.heatmap?.rows ?? 1),
          cols: Number(optimization.heatmap?.cols ?? 1),
          cells: (optimization.heatmap?.cells ?? [[0]]) as number[][],
          freeCells: Number(optimization.heatmap?.freeCells ?? 0),
          occupiedCells: Number(optimization.heatmap?.occupiedCells ?? 0),
        },
        validations: (optimization.validations ?? []).map((v: any) => ({
          code: String(v.code ?? 'UNKNOWN'),
          severity: (v.severity ?? 'info') as 'info' | 'warning' | 'critical',
          message: String(v.message ?? ''),
          details: v.details ?? undefined,
        })),
        kpis: {
          utilizationScore: Number(optimization.kpis?.utilizationScore ?? 0),
          balanceScore: Number(optimization.kpis?.balanceScore ?? 0),
          stabilityScore: Number(optimization.kpis?.stabilityScore ?? 0),
          sequenceScore: Number(optimization.kpis?.sequenceScore ?? 0),
          complianceScore: Number(optimization.kpis?.complianceScore ?? 0),
          overallScore: Number(optimization.kpis?.overallScore ?? 0),
          grade: (optimization.kpis?.grade ?? 'D') as 'A' | 'B' | 'C' | 'D',
        },
        instructions: (optimization.instructions ?? []).map((ins: any) => ({
          step: Number(ins.step ?? 0),
          description: String(ins.description ?? ''),
          productName: String(ins.productName ?? ''),
          instanceId: String(ins.instanceId ?? `step-${String(ins.step ?? 0)}`),
          routeStop: Number(ins.routeStop ?? 1),
          loadingZone: (ins.loadingZone ?? 'center') as 'front' | 'center' | 'rear',
          position: (ins.position ?? { x: 0, y: 0, z: 0 }),
        })),
        ai: optimization.ai
          ? {
              strategy: (optimization.ai.strategy ?? optimizationStrategy) as 'baseline' | 'intelligent',
              candidatesEvaluated: Number(optimization.ai.candidatesEvaluated ?? 1),
              selectedCandidateIndex: Number(optimization.ai.selectedCandidateIndex ?? 0),
              baselineScore: Number(optimization.ai.baselineScore ?? 0),
              bestScore: Number(optimization.ai.bestScore ?? 0),
              baselineCriticalCount: Number(optimization.ai.baselineCriticalCount ?? 0),
              bestCriticalCount: Number(optimization.ai.bestCriticalCount ?? 0),
              improved: Boolean(optimization.ai.improved ?? false),
            }
          : undefined,
      }

      setOptimizationResult(result)
      const requestedCount = Number(result.requestedItemsCount ?? 0)
      const placedCount = Number(result.placedItemsCount ?? 0)
      if (placedCount < requestedCount) {
        setOptimizeNotice(`Se acomodaron ${placedCount} de ${requestedCount} productos. ${requestedCount - placedCount} no caben con las restricciones actuales.`)
      } else if (result.ai?.strategy === 'intelligent' && result.ai.improved) {
        const delta = result.ai.bestScore - result.ai.baselineScore
        setOptimizeNotice(
          `IA refinó el acomodo en ${result.ai.candidatesEvaluated} escenarios y mejoró el score en ${delta.toFixed(1)} puntos.`
        )
      } else {
        setOptimizeNotice(null)
      }
      setOptimizedSnapshot(configSnapshot)
    } catch (e) {
      console.error('Error optimizando:', e)
      setOptimizationResult(null)
      setVisualizerCubes([])
      setOptimizedSnapshot(null)
      setOptimizeError(e instanceof Error ? e.message : 'Error desconocido')
      setOptimizeNotice(null)
    } finally {
      setIsOptimizing(false)
    }
  }

  // Convertir resultado a formato para visualizador 3D
const cubesForVisualizer = useMemo<Cube3DData[]>(() => {
  const placed = optimizationResult?.placedItems ?? []
  const out: Cube3DData[] = []

  placed.forEach((item: any, idx: number) => {
    const rawQty = Number(item.quantity ?? 1)
    const qty = Math.max(1, Number.isFinite(rawQty) ? rawQty : 1)

    const w = Number(item.product?.width ?? 0)
    const d = Number(item.product?.depth ?? item.product?.length ?? 0)
    const h = Number(item.product?.height ?? 0)

    const rotDeg = Number(item.rotation?.y ?? 0)
    const rotY = Number.isFinite(rotDeg) ? (rotDeg * Math.PI) / 180 : 0

    // Algoritmo: x=lateral, y=alto, z=avance
    // Visualizador: x=avance, y=alto, z=lateral
    const algoX = Number(item.position?.x ?? 0)
    const algoY = Number(item.position?.y ?? 0)
    const algoZ = Number(item.position?.z ?? 0)

    for (let q = 0; q < qty; q++) {
      const baseInstanceId = String(item.instanceId ?? `${item.product?.id ?? "p"}-${idx}`)
      const instanceId = qty > 1 ? `${baseInstanceId}-${q + 1}` : baseInstanceId
      out.push({
        id: instanceId,
        instanceId,
        x: algoZ + (q * (d + 2)),
        y: algoY,
        z: algoX,
        width: w,
        height: h,
        depth: d,
        rotY,
        routeStop: Number(item.routeStop ?? 1),
        loadingZone: undefined,
        color: getCategoryColor(item.product?.category ?? "generales"),
        name: String(item.product?.name ?? "Producto"),
        weightKg: Number(item.product?.weight ?? 0),
        product: item.product as any,
      })
    }
  })

  return out
}, [optimizationResult])

  const layoutValidation = useMemo(() => {
    const cubes = visualizerCubes.length > 0 ? visualizerCubes : cubesForVisualizer
    return evaluateManualLayout(cubes, vehicle)
  }, [cubesForVisualizer, vehicle, visualizerCubes])
  const hasCriticalOptimization = Boolean(
    optimizationResult?.validations?.some((v) => v.severity === 'critical')
  )
  const hasCriticalSaveBlock = hasCriticalOptimization || layoutValidation.hasCritical

  useEffect(() => {
    setVisualizerCubes(cubesForVisualizer)
  }, [cubesForVisualizer])

  const exportPreviewPdf = async () => {
    if (!vehicle || !optimizationResult) return

    try {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('Previsualizacion de Estiba', 14, 16)

      doc.setFontSize(10)
      doc.text(`Unidad: ${vehicle.name}`, 14, 24)
      doc.text(`Peso total: ${(optimizationResult.totalWeight / 1000).toFixed(2)} ton`, 14, 30)
      doc.text(`Utilizacion: ${optimizationResult.utilization.toFixed(1)}%`, 14, 36)
      doc.text(`Score: ${optimizationResult.kpis.overallScore.toFixed(1)} (${optimizationResult.kpis.grade})`, 14, 42)
      doc.text(
        `Colocados: ${optimizationResult.placedItemsCount}/${optimizationResult.requestedItemsCount} | No colocados: ${optimizationResult.unplacedItems.length}`,
        14,
        48
      )

      const rows = (visualizerCubes.length > 0 ? visualizerCubes : cubesForVisualizer).map((cube) => [
        cube.name ?? cube.productName ?? 'Producto',
        `${cube.width}x${cube.depth}x${cube.height}`,
        `${Number(cube.weightKg ?? cube.weight ?? 0).toFixed(1)} kg`,
        String(cube.routeStop ?? 1),
        `(${cube.x.toFixed(0)}, ${cube.y.toFixed(0)}, ${cube.z.toFixed(0)})`,
      ])

      autoTable(doc, {
        startY: 54,
        head: [['Producto', 'Dimensiones (cm)', 'Peso', 'Parada', 'Posicion']],
        body: rows.length > 0 ? rows : [['Sin productos', '-', '-', '-', '-']],
        styles: { fontSize: 9 },
      })

      const yAfterLayout = (doc as any).lastAutoTable?.finalY ? Number((doc as any).lastAutoTable.finalY) + 8 : 80
      const instructionRows = optimizationResult.instructions.map((ins) => [
        String(ins.step),
        ins.productName,
        String(ins.routeStop),
        ins.loadingZone,
        `(${Number(ins.position.x).toFixed(0)}, ${Number(ins.position.y).toFixed(0)}, ${Number(ins.position.z).toFixed(0)})`,
      ])

      autoTable(doc, {
        startY: yAfterLayout,
        head: [['Paso', 'Producto', 'Parada', 'Zona', 'Posicion']],
        body: instructionRows.length > 0 ? instructionRows : [['-', '-', '-', '-', '-']],
        styles: { fontSize: 8 },
      })

      const yAfterInstructions = (doc as any).lastAutoTable?.finalY ? Number((doc as any).lastAutoTable.finalY) + 8 : 120
      const validationRows = optimizationResult.validations.map((v) => [
        String(v.severity).toUpperCase(),
        v.code,
        v.message,
      ])

      autoTable(doc, {
        startY: yAfterInstructions,
        head: [['Nivel', 'Codigo', 'Mensaje']],
        body: validationRows.length > 0 ? validationRows : [['INFO', 'PLAN_OK', 'Sin hallazgos']],
        styles: { fontSize: 8 },
      })

      const yAfterValidations = (doc as any).lastAutoTable?.finalY ? Number((doc as any).lastAutoTable.finalY) + 8 : 150
      const unplacedRows = optimizationResult.unplacedItems.map((u) => [
        u.product.name,
        String(u.routeStop),
        u.reason,
        u.details,
      ])
      autoTable(doc, {
        startY: yAfterValidations,
        head: [['Producto no colocado', 'Parada', 'Razon', 'Detalle']],
        body: unplacedRows.length > 0 ? unplacedRows : [['Sin pendientes', '-', '-', '-']],
        styles: { fontSize: 8 },
      })

      doc.save(`previsualizacion-estiba-${Date.now()}.pdf`)
    } catch (error) {
      setSaveFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo exportar el PDF',
      })
    }
  }

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
            variant="outline"
            onClick={savePlan}
            disabled={isLoadingCatalogs || !!catalogsError || !canSave || isSaving || !hasValidOptimization || !hasUnsavedChanges || hasCriticalSaveBlock}
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Guardando...' : 'Guardar'}
          </Button>
          <Button
            onClick={runOptimization}
            disabled={
              isLoadingCatalogs ||
              !!catalogsError ||
              !vehicle ||
              selectedItems.length === 0 ||
              isOptimizing
            }
          >
            <Play className="h-4 w-4 mr-2" />
            {isOptimizing
              ? optimizationStrategy === 'intelligent'
                ? 'Optimizando IA...'
                : 'Optimizando...'
              : optimizationStrategy === 'intelligent'
                ? 'Optimizar IA'
                : 'Optimizar'}
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
          {optimizeNotice && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-amber-700">{optimizeNotice}</p>
              </CardContent>
            </Card>
          )}
          {saveFeedback && (
            <Card>
              <CardContent className="pt-6">
                <p className={`text-sm ${saveFeedback.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {saveFeedback.message}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Modo de Optimizacion</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Estrategia de acomodo</Label>
                <Select
                  value={optimizationStrategy}
                  onValueChange={(value) => setOptimizationStrategy(value as 'baseline' | 'intelligent')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione estrategia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baseline">Estandar (rapida)</SelectItem>
                    <SelectItem value="intelligent">Inteligente IA (multi-escenario)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  En modo IA se calcula primero base y luego se evalúan 4 o 6 escenarios para elegir el mejor.
                </p>
              </div>
            </CardContent>
          </Card>
          {optimizationResult && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-gray-900">Validacion post-edicion (manual)</p>
                <div className="mt-2 space-y-1 text-xs">
                  {layoutValidation.issues.length === 0 ? (
                    <p className="text-emerald-700">Sin hallazgos criticos.</p>
                  ) : (
                    layoutValidation.issues.map((issue) => (
                      <p
                        key={`${issue.code}-${issue.message}`}
                        className={issue.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}
                      >
                        [{issue.code}] {issue.message}
                      </p>
                    ))
                  )}
                </div>
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

          <Card>
            <CardHeader>
              <CardTitle>Plantillas de Carga</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Aplicar plantilla</Label>
                  <Select value="" onValueChange={applyTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una plantilla" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTemplates.length === 0 ? (
                        <SelectItem value="__no_templates" disabled>
                          No hay plantillas guardadas
                        </SelectItem>
                      ) : (
                        availableTemplates.map((template: any) => (
                          <SelectItem key={template.id} value={String(template.id)}>
                            {String(template.name ?? 'Plantilla')}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Guardar plantilla actual</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nombre de plantilla"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={selectedItems.length === 0 || isSavingTemplate}
                      onClick={saveTemplate}
                    >
                      {isSavingTemplate ? 'Guardando...' : 'Guardar'}
                    </Button>
                  </div>
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
                            <div className="flex items-center gap-1 rounded-md border bg-white px-2 py-1">
                              <span className="text-[10px] text-gray-500">Parada</span>
                              <input
                                type="number"
                                min={1}
                                value={selected.routeStop}
                                onChange={(e) => setItemRouteStop(product.id, Number(e.target.value))}
                                className="w-12 border-0 p-0 text-xs font-semibold focus:outline-none"
                              />
                            </div>
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
                        cubes={visualizerCubes}
                        onCubesChange={setVisualizerCubes}
                        onEditStatsChange={setManualEditStats}
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
                          {optimizationResult.placedItemsCount} / {optimizationResult.requestedItemsCount}
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

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Score Global</p>
                        <p className="text-2xl font-bold text-emerald-700">
                          {optimizationResult.kpis.overallScore.toFixed(1)} ({optimizationResult.kpis.grade})
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Estabilidad</p>
                        <p className="text-lg font-bold text-gray-900">
                          {optimizationResult.stability.score.toFixed(1)} ({optimizationResult.stability.level})
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Ejes</p>
                        <p className={`text-lg font-bold ${optimizationResult.axleDistribution.isCompliant ? 'text-emerald-700' : 'text-red-600'}`}>
                          F {optimizationResult.axleDistribution.frontKg.toFixed(0)}kg / R {optimizationResult.axleDistribution.rearKg.toFixed(0)}kg
                        </p>
                        <p className="text-xs text-gray-500">
                          Perfil: {optimizationResult.axleDistribution.profile} (F objetivo {optimizationResult.axleDistribution.expectedFrontPctRange.min}-{optimizationResult.axleDistribution.expectedFrontPctRange.max}%)
                        </p>
                      </div>
                    </div>

                    {optimizationResult.ai && (
                      <div className="mt-4 rounded-lg border bg-indigo-50 p-4 text-sm">
                        <p className="font-semibold mb-2">Refinamiento Inteligente</p>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                          <p>Estrategia: <strong>{optimizationResult.ai.strategy}</strong></p>
                          <p>Escenarios: <strong>{optimizationResult.ai.candidatesEvaluated}</strong></p>
                          <p>Candidato elegido: <strong>#{optimizationResult.ai.selectedCandidateIndex + 1}</strong></p>
                          <p>Mejora: <strong>{optimizationResult.ai.improved ? 'Si' : 'No'}</strong></p>
                        </div>
                        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                          <p>Score base: <strong>{optimizationResult.ai.baselineScore.toFixed(1)}</strong></p>
                          <p>Score final: <strong>{optimizationResult.ai.bestScore.toFixed(1)}</strong></p>
                          <p>Criticos: <strong>{optimizationResult.ai.baselineCriticalCount} → {optimizationResult.ai.bestCriticalCount}</strong></p>
                        </div>
                      </div>
                    )}

                    {scenarioComparison && (
                      <div className="mt-4 rounded-lg border bg-slate-50 p-4 text-sm">
                        <p className="font-semibold mb-2">Comparacion A/B</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                          <p>Delta Utilizacion: <strong>{scenarioComparison.utilizationDelta.toFixed(1)}%</strong></p>
                          <p>Delta Peso: <strong>{(scenarioComparison.totalWeightDelta / 1000).toFixed(2)} ton</strong></p>
                          <p>Delta Score: <strong>{scenarioComparison.scoreDelta.toFixed(1)}</strong></p>
                          <p>Delta Colocados: <strong>{scenarioComparison.placedDelta}</strong></p>
                          <p>Delta No colocados: <strong>{scenarioComparison.unplacedDelta}</strong></p>
                        </div>
                      </div>
                    )}

                    {manualEditStats && (
                      <div className="mt-4 rounded-lg border bg-gray-50 p-4 text-sm">
                        <p className="font-semibold mb-2">Telemetria de Edicion</p>
                        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                          <p>Movimientos: <strong>{manualEditStats.moves}</strong></p>
                          <p>Swaps: <strong>{manualEditStats.swaps}</strong></p>
                          <p>Rotaciones: <strong>{manualEditStats.rotates}</strong></p>
                          <p>Undo: <strong>{manualEditStats.undos}</strong></p>
                          <p>Redo: <strong>{manualEditStats.redos}</strong></p>
                          <p>Nudges: <strong>{manualEditStats.keyNudges}</strong></p>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border p-4">
                        <p className="font-semibold mb-2">Validaciones</p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {optimizationResult.validations.map((v) => (
                            <p
                              key={`${v.code}-${v.message}`}
                              className={`text-sm ${
                                v.severity === 'critical'
                                  ? 'text-red-700'
                                  : v.severity === 'warning'
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                              }`}
                            >
                              [{v.code}] {v.message}
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border p-4">
                        <p className="font-semibold mb-2">Heatmap de OcupaciÃ³n (piso)</p>
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">
                            Celdas ocupadas: {optimizationResult.heatmap.occupiedCells} / {optimizationResult.heatmap.occupiedCells + optimizationResult.heatmap.freeCells}
                          </p>
                          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(optimizationResult.heatmap.cols, 16)}, minmax(0, 1fr))` }}>
                            {optimizationResult.heatmap.cells
                              .slice(0, Math.min(optimizationResult.heatmap.rows, 10))
                              .flatMap((row, r) =>
                                row.slice(0, Math.min(optimizationResult.heatmap.cols, 16)).map((cell, c) => (
                                  <div
                                    key={`${r}-${c}`}
                                    className="h-3 rounded-sm"
                                    style={{
                                      background:
                                        cell <= 0
                                          ? '#E5E7EB'
                                          : cell === 1
                                            ? '#93C5FD'
                                            : cell === 2
                                              ? '#3B82F6'
                                              : '#1D4ED8',
                                    }}
                                  />
                                ))
                              )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex gap-2">
                      <Button
                        onClick={savePlan}
                        disabled={isSaving || !canSave || !hasValidOptimization || !hasUnsavedChanges || hasCriticalSaveBlock}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? 'Guardando...' : 'Guardar Plan'}
                      </Button>
                      <Button variant="outline" onClick={exportPreviewPdf}>
                        <FileDown className="h-4 w-4 mr-2" />
                        Exportar PDF
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setScenarioA(optimizationResult)}
                      >
                        Guardar Escenario A
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
                              Parada: {instruction.routeStop} - Zona: {instruction.loadingZone}
                            </p>
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





