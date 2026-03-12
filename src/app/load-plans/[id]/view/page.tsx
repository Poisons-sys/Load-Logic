'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, FileDown, History, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const LoadVisualizer3D = dynamic(() => import('@/components/LoadVisualizer3D'), {
  ssr: false,
})

type PlanItem = {
  id: string
  productId?: string | null
  quantity: number
  positionX?: number | null
  positionY?: number | null
  positionZ?: number | null
  rotationX?: number | null
  rotationY?: number | null
  rotationZ?: number | null
  product: {
    id: string
    name: string
    category?: string | null
    weight?: number | null
    width?: number | null
    height?: number | null
    length?: number | null
  } | null
}

type PlanInstruction = {
  id: string
  step: number
  description?: string | null
  position?: any
}

type PlanPlacement = {
  id: string
  itemId?: string | null
  productId?: string | null
  pieceIndex?: number | null
  instanceKey?: string | null
  positionX?: number | null
  positionY?: number | null
  positionZ?: number | null
  rotationX?: number | null
  rotationY?: number | null
  rotationZ?: number | null
  loadingOrder?: number | null
  product: {
    id: string
    name: string
    category?: string | null
    weight?: number | null
    width?: number | null
    height?: number | null
    length?: number | null
  } | null
}

type PlanVersion = {
  id: string
  version: number
  source?: string | null
  createdAt?: string | null
}

type LoadPlan = {
  id: string
  name: string
  status?: string | null
  totalWeight?: number | null
  spaceUtilization?: number | null
  optimizationScore?: number | null
  layoutVersion?: number | null
  advancedMetrics?: any
  versions?: PlanVersion[]
  vehicle: {
    id: string
    name: string
    internalWidth: number
    internalHeight: number
    internalLength: number
    plate?: string | null
    licensePlate?: string | null
    unitNumber?: string | null
  } | null
  items: PlanItem[]
  placements?: PlanPlacement[]
  instructions?: PlanInstruction[]
}

type PlanValidation = {
  code: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  details?: Record<string, unknown>
}

type WarningPresentation = {
  title: string
  explanation: string
  details: string[]
  actions: string[]
}

type DispatchGate = {
  status: 'block' | 'review'
  label: string
  reason: string
}

type LoadZone = 'front' | 'center' | 'rear'

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

function toNum(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function formatPct(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : '-'
}

function formatRange(range: unknown) {
  if (!range || typeof range !== 'object') return '-'
  const r = range as Record<string, unknown>
  return `${formatPct(r.min)} - ${formatPct(r.max)}`
}

function formatStabilityLevel(level: unknown) {
  const v = String(level ?? '').toLowerCase()
  if (v === 'stable') return 'estable'
  if (v === 'caution') return 'precaucion'
  if (v === 'critical') return 'critico'
  return '-'
}

function formatScore(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(1) : '-'
}

function toZoneByX(x: number, containerDepth: number): LoadZone {
  const third = containerDepth / 3
  if (x < third) return 'front'
  if (x < third * 2) return 'center'
  return 'rear'
}

function preferredZoneFromImbalance(details?: Record<string, unknown>): LoadZone {
  const front = Number(details?.frontPct ?? details?.front ?? 0)
  const rear = Number(details?.rearPct ?? details?.rear ?? 0)
  const center = Number(details?.center ?? 0)

  if (front >= rear && front >= center) return 'front'
  if (rear >= front && rear >= center) return 'rear'
  return 'center'
}

function presentWarning(issue: PlanValidation): WarningPresentation {
  const details = issue.details ?? {}
  const profile = String(details.profile ?? '')
  const frontPct = details.frontPct
  const expectedRange = details.expectedFrontPctRange
  const cog = details.cog && typeof details.cog === 'object'
    ? (details.cog as Record<string, unknown>)
    : null
  const stability = details.stability && typeof details.stability === 'object'
    ? (details.stability as Record<string, unknown>)
    : null

  if (issue.code === 'AXLE_PROFILE_IMBALANCE') {
    return {
      title: 'Desbalance entre ejes',
      explanation: `El peso frontal esta fuera del rango recomendado para el perfil ${profile || 'actual'}.`,
      details: [
        `Frente actual: ${formatPct(frontPct)}`,
        `Rango esperado: ${formatRange(expectedRange)}`,
      ],
      actions: [
        'Mover parte de la carga hacia el centro o la parte trasera.',
        'Revisar productos pesados en las primeras posiciones de carga.',
      ],
    }
  }

  if (issue.code === 'STABILITY_RISK') {
    return {
      title: 'Riesgo de estabilidad',
      explanation: 'El centro de gravedad y/o la estabilidad general requieren ajuste antes de operar.',
      details: [
        `Zona de centro de gravedad: ${String(cog?.zone ?? '-')}`,
        `Nivel de estabilidad: ${formatStabilityLevel(stability?.level)}`,
        `Score de estabilidad: ${formatScore(stability?.score)}`,
      ],
      actions: [
        'Bajar peso de niveles altos y acercarlo al piso del remolque.',
        'Distribuir mejor la carga entre frente, centro y parte trasera.',
      ],
    }
  }

  if (issue.code === 'LENGTH_IMBALANCE') {
    return {
      title: 'Desbalance longitudinal',
      explanation: 'La carga esta concentrada en una zona del remolque y puede afectar manejo/frenado.',
      details: [
        `Frente: ${formatPct(details.front)}`,
        `Centro: ${formatPct(details.center)}`,
        `Trasera: ${formatPct(details.rear)}`,
      ],
      actions: [
        'Reubicar piezas pesadas para acercarse a una distribucion mas pareja.',
        'Evitar que todo el peso quede en el frente del remolque.',
      ],
    }
  }

  if (issue.code === 'NOT_ALL_ITEMS_PLACED') {
    return {
      title: 'Piezas sin acomodar',
      explanation: issue.message,
      details: [],
      actions: ['Ajustar prioridades, rotaciones o seleccionar una unidad con mayor capacidad.'],
    }
  }

  return {
    title: issue.code,
    explanation: issue.message,
    details: Object.entries(details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`),
    actions: ['Revisar este warning con el supervisor de carga antes de liberar la unidad.'],
  }
}

function dispatchGateForWarning(issue: PlanValidation): DispatchGate {
  const details = issue.details ?? {}
  const frontPct = Number(details.frontPct)
  const rearPct = Number(details.rear)
  const front = Number(details.front)
  const cog = details.cog && typeof details.cog === 'object'
    ? (details.cog as Record<string, unknown>)
    : null
  const stability = details.stability && typeof details.stability === 'object'
    ? (details.stability as Record<string, unknown>)
    : null
  const expectedRange =
    details.expectedFrontPctRange && typeof details.expectedFrontPctRange === 'object'
      ? (details.expectedFrontPctRange as Record<string, unknown>)
      : null
  const expectedMax = Number(expectedRange?.max)
  const expectedMin = Number(expectedRange?.min)

  if (issue.code === 'STABILITY_RISK') {
    const zone = String(cog?.zone ?? '').toLowerCase()
    const level = String(stability?.level ?? '').toLowerCase()
    if (zone === 'critical' || level === 'critical') {
      return {
        status: 'block',
        label: 'Bloquea despacho',
        reason: 'Riesgo de estabilidad en nivel critico.',
      }
    }
    return {
      status: 'review',
      label: 'Revisar antes de salir',
      reason: 'Estabilidad fuera de zona estable.',
    }
  }

  if (issue.code === 'AXLE_PROFILE_IMBALANCE') {
    if (
      Number.isFinite(frontPct) &&
      ((Number.isFinite(expectedMax) && frontPct > expectedMax + 15) ||
        (Number.isFinite(expectedMin) && frontPct < expectedMin - 15))
    ) {
      return {
        status: 'block',
        label: 'Bloquea despacho',
        reason: 'Desbalance de ejes severo respecto al perfil objetivo.',
      }
    }
    return {
      status: 'review',
      label: 'Revisar antes de salir',
      reason: 'Distribucion por ejes fuera de rango recomendado.',
    }
  }

  if (issue.code === 'LENGTH_IMBALANCE') {
    const frontHeavy = Number.isFinite(front) && front >= 70
    const rearHeavy = Number.isFinite(rearPct) && rearPct >= 70
    if (frontHeavy || rearHeavy) {
      return {
        status: 'block',
        label: 'Bloquea despacho',
        reason: 'Concentracion longitudinal de peso demasiado alta en un extremo.',
      }
    }
    return {
      status: 'review',
      label: 'Revisar antes de salir',
      reason: 'Desbalance longitudinal moderado.',
    }
  }

  if (issue.code === 'NOT_ALL_ITEMS_PLACED') {
    return {
      status: 'review',
      label: 'Revisar antes de salir',
      reason: 'No toda la carga solicitada fue acomodada.',
    }
  }

  return {
    status: 'review',
    label: 'Revisar antes de salir',
    reason: 'Warning operativo detectado.',
  }
}

export default function LoadPlan3DViewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const planId = typeof params?.id === 'string' ? params.id : ''

  const [plan, setPlan] = useState<LoadPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)
  const [activeWarningHighlightKey, setActiveWarningHighlightKey] = useState<string | null>(null)

  const fetchPlan = useCallback(async () => {
    if (!planId) return
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/load-plans/${planId}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo cargar el plan')
      }
      const json = await res.json()
      setPlan(json?.data ?? null)
    } catch (e: any) {
      setError(e?.message ?? 'Error cargando plan')
    } finally {
      setLoading(false)
    }
  }, [planId])

  useEffect(() => {
    void fetchPlan()
  }, [fetchPlan])

  const container = useMemo(() => {
    const v = plan?.vehicle
    if (!v) return null
    return {
      width: Number(v.internalWidth ?? 0),
      height: Number(v.internalHeight ?? 0),
      depth: Number(v.internalLength ?? 0),
    }
  }, [plan])

  const metrics = useMemo(() => {
    const adv = (plan?.advancedMetrics ?? {}) as Record<string, unknown>
    const validations = Array.isArray(adv.validations)
      ? (adv.validations as Array<{ severity?: string }>)
      : []
    const requestedFromItems = (plan?.items ?? []).reduce(
      (sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)),
      0
    )
    const placedFromPlacements = Number(plan?.placements?.length ?? 0)
    const requested = Math.max(0, toNum(adv.requestedItemsCount, requestedFromItems))
    const placed = Math.max(0, toNum(adv.placedItemsCount, placedFromPlacements))
    const unplaced = Math.max(
      0,
      toNum(
        adv.unplacedItemsCount,
        Array.isArray(adv.unplacedItems) ? adv.unplacedItems.length : requested - placed
      )
    )

    const criticalIssues = validations.filter((v) => v?.severity === 'critical').length
    const warningIssues = validations.filter((v) => v?.severity === 'warning').length
    const ai = (adv.ai ?? null) as Record<string, unknown> | null

    return {
      requested,
      placed,
      unplaced,
      criticalIssues,
      warningIssues,
      aiStrategy: ai?.strategy ? String(ai.strategy) : null,
      aiImproved: Boolean(ai?.improved ?? false),
    }
  }, [plan])

  const validationIssues = useMemo<PlanValidation[]>(() => {
    const adv = (plan?.advancedMetrics ?? {}) as Record<string, unknown>
    const raw = Array.isArray(adv.validations) ? adv.validations : []

    return raw.map((item, idx) => {
      const it = (item ?? {}) as Record<string, unknown>
      const severityRaw = String(it.severity ?? 'info')
      const severity: PlanValidation['severity'] =
        severityRaw === 'critical' || severityRaw === 'warning' ? severityRaw : 'info'

      return {
        code: String(it.code ?? `VALIDATION_${idx + 1}`),
        severity,
        message: String(it.message ?? 'Validacion sin mensaje'),
        details:
          it.details && typeof it.details === 'object'
            ? (it.details as Record<string, unknown>)
            : undefined,
      }
    })
  }, [plan])

  const warningIssues = useMemo(
    () => validationIssues.filter((issue) => issue.severity === 'warning'),
    [validationIssues]
  )

  const warningCards = useMemo(
    () =>
      warningIssues.map((issue, idx) => ({
        key: `${issue.code}-${idx}`,
        issue,
        presentation: presentWarning(issue),
        gate: dispatchGateForWarning(issue),
      })),
    [warningIssues]
  )

  const warningGateSummary = useMemo(() => {
    const blockCount = warningCards.filter((c) => c.gate.status === 'block').length
    const reviewCount = warningCards.filter((c) => c.gate.status === 'review').length
    return { blockCount, reviewCount }
  }, [warningCards])

  const activeWarningCard = useMemo(
    () => warningCards.find((card) => card.key === activeWarningHighlightKey) ?? null,
    [warningCards, activeWarningHighlightKey]
  )

  const planCubes = useMemo(() => {
    const fromPlacements = (plan?.placements ?? [])
      .slice()
      .sort((a, b) => Number(a.loadingOrder ?? 0) - Number(b.loadingOrder ?? 0))
      .map((placement) => {
        const product = placement.product
        if (!product) return null

        const algoX = Number(placement.positionX ?? 0)
        const algoY = Number(placement.positionY ?? 0)
        const algoZ = Number(placement.positionZ ?? 0)
        const rotDeg = Number(placement.rotationY ?? 0)
        const rotY = Number.isFinite(rotDeg) ? (rotDeg * Math.PI) / 180 : 0

        return {
          id: String(placement.instanceKey ?? `pl-${placement.id}`),
          instanceId: String(placement.instanceKey ?? `pl-${placement.id}`),
          x: algoZ,
          y: algoY,
          z: algoX,
          width: Number(product.width ?? 0),
          height: Number(product.height ?? 0),
          depth: Number(product.length ?? 0),
          rotY,
          color: getCategoryColor(String(product.category ?? 'generales')),
          name: String(product.name ?? 'Producto'),
          weightKg: Number(product.weight ?? 0),
          product,
        }
      })
      .filter(Boolean) as any[]

    if (fromPlacements.length > 0) {
      return fromPlacements
    }

    const fromInstructions = (plan?.instructions ?? [])
      .map((ins, idx) => {
        const pos = ins?.position as any
        const product = pos?.product
        if (!pos || !product) return null

        const algoX = Number(pos.x ?? 0)
        const algoY = Number(pos.y ?? 0)
        const algoZ = Number(pos.z ?? 0)
        const rotDeg = Number(pos.rotation?.y ?? 0)
        const rotY = Number.isFinite(rotDeg) ? (rotDeg * Math.PI) / 180 : 0

        return {
          id: `ins-${ins.step}-${idx}`,
          x: algoZ,
          y: algoY,
          z: algoX,
          width: Number(product.width ?? 0),
          height: Number(product.height ?? 0),
          depth: Number(product.length ?? product.depth ?? 0),
          rotY,
          color: getCategoryColor(String(product.category ?? 'generales')),
          name: String(product.name ?? 'Producto'),
          weightKg: Number(product.weight ?? 0),
          product,
        }
      })
      .filter(Boolean) as any[]

    if (fromInstructions.length > 0) {
      return fromInstructions
    }

    const items = plan?.items ?? []
    const out: any[] = []

    items.forEach((it, idx) => {
      if (!it?.product) return
      const p = it.product
      const qty = Number(it.quantity ?? 1)

      const width = Math.max(1, Number(p.width ?? 0))
      const height = Math.max(1, Number(p.height ?? 0))
      const depth = Math.max(1, Number(p.length ?? 0))
      const maxCols = Math.max(1, Math.floor((container?.width ?? 0) / width))
      const maxRows = Math.max(1, Math.floor((container?.depth ?? 0) / depth))
      const perLayer = Math.max(1, maxCols * maxRows)
      const rotDeg = Number(it.rotationY ?? 0)
      const rotY = Number.isFinite(rotDeg) ? (rotDeg * Math.PI) / 180 : 0

      for (let q = 0; q < Math.max(qty, 1); q++) {
        const layer = Math.floor(q / perLayer)
        const indexInLayer = q % perLayer
        const col = indexInLayer % maxCols
        const row = Math.floor(indexInLayer / maxCols)

        const algoX = col * width
        const algoY = layer * height
        const algoZ = row * depth

        out.push({
          id: `${p.id}-${idx}-${q}`,
          x: algoZ,
          y: algoY,
          z: algoX,
          width,
          height,
          depth,
          rotY,
          color: getCategoryColor(String(p.category ?? 'generales')),
          name: String(p.name ?? 'Producto'),
          weightKg: Number(p.weight ?? 0),
          product: p,
        })
      }
    })

    return out
  }, [plan, container])

  const activeCubes = planCubes

  const highlightResult = useMemo(() => {
    if (!activeWarningCard || !container) {
      return {
        cubeIds: new Set<string>(),
        description: '',
      }
    }

    const issue = activeWarningCard.issue
    const details = issue.details ?? {}

    if (issue.code === 'NOT_ALL_ITEMS_PLACED') {
      return {
        cubeIds: new Set<string>(),
        description: 'Este warning no apunta a cajas especificas en el layout.',
      }
    }

    if (issue.code === 'STABILITY_RISK') {
      const ids = new Set(
        activeCubes
          .filter((cube) => Number(cube.y ?? 0) >= container.height * 0.55)
          .map((cube) => String(cube.id))
      )
      return {
        cubeIds: ids,
        description:
          ids.size > 0
            ? 'Resaltando cajas en niveles altos (mayor impacto en estabilidad).'
            : 'No se detectaron cajas altas para resaltar.',
      }
    }

    if (issue.code === 'AXLE_PROFILE_IMBALANCE' || issue.code === 'LENGTH_IMBALANCE') {
      const zone = preferredZoneFromImbalance(details)
      const ids = new Set(
        activeCubes
          .filter((cube) => toZoneByX(Number(cube.x ?? 0), container.depth) === zone)
          .map((cube) => String(cube.id))
      )
      const zoneLabel = zone === 'front' ? 'frontal' : zone === 'rear' ? 'trasera' : 'central'
      return {
        cubeIds: ids,
        description: `Resaltando zona ${zoneLabel}, donde se concentra mas peso.`,
      }
    }

    return {
      cubeIds: new Set(activeCubes.map((cube) => String(cube.id))),
      description: 'Resaltando cajas relacionadas con el warning seleccionado.',
    }
  }, [activeWarningCard, container, activeCubes])

  const visualizerCubes = useMemo(() => {
    if (!activeWarningCard) return activeCubes
    if (highlightResult.cubeIds.size === 0) {
      return activeCubes.map((cube) => ({
        ...cube,
        color: '#94A3B8',
      }))
    }

    return activeCubes.map((cube) => ({
      ...cube,
      color: highlightResult.cubeIds.has(String(cube.id)) ? '#F59E0B' : '#CBD5E1',
    }))
  }, [activeWarningCard, activeCubes, highlightResult.cubeIds])

  useEffect(() => {
    if (!activeWarningHighlightKey) return
    const stillExists = warningCards.some((card) => card.key === activeWarningHighlightKey)
    if (!stillExists) setActiveWarningHighlightKey(null)
  }, [warningCards, activeWarningHighlightKey])

  const operationalSteps = useMemo(() => {
    const sorted = (plan?.instructions ?? [])
      .slice()
      .sort((a, b) => Number(a.step ?? 0) - Number(b.step ?? 0))

    return sorted.map((ins, idx) => {
      const pos = (ins.position ?? {}) as any
      const algoX = Number(pos?.x ?? 0)
      const algoY = Number(pos?.y ?? 0)
      const algoZ = Number(pos?.z ?? 0)

      return {
        id: String(ins.id ?? `step-${idx}`),
        step: Number(ins.step ?? idx + 1),
        description: String(ins.description ?? ''),
        productName: String(pos?.product?.name ?? '-'),
        routeStop: Number(pos?.routeStop ?? 1),
        loadingZone: String(pos?.loadingZone ?? '-'),
        position: { x: algoX, y: algoY, z: algoZ },
      }
    })
  }, [plan?.instructions])

  const restoreVersion = async (version: PlanVersion) => {
    if (!planId) return

    const ok = confirm(
      `Restaurar la version v${version.version}? Esto crea una nueva version con ese layout.`
    )
    if (!ok) return

    try {
      setRestoringVersionId(version.id)
      const res = await fetch(`/api/load-plans/${planId}/restore-version`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          versionId: version.id,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo restaurar la version')
      }

      const json = await res.json()
      setPlan(json?.data ?? null)
    } catch (e: any) {
      console.error(e)
      alert(e?.message ?? 'Error restaurando version')
    } finally {
      setRestoringVersionId(null)
    }
  }

  const downloadPdf = async () => {
    if (!plan?.id) return
    try {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' })
      doc.setFontSize(16)
      doc.text('Plan de Carga - LoadLogic', 14, 18)
      doc.setFontSize(10)
      doc.text(`ID: ${plan.id}`, 14, 26)
      doc.text(`Nombre: ${plan.name ?? '-'}`, 14, 32)
      doc.text(`Estado: ${plan.status ?? '-'}`, 14, 38)

      const v = plan.vehicle
      doc.text(`Unidad: ${v?.name ?? '-'}`, 14, 44)

      const totalWeight = Number(plan.totalWeight ?? 0)
      const util = Number(plan.spaceUtilization ?? 0)
      doc.text(`Peso total: ${(totalWeight / 1000).toFixed(2)} ton`, 14, 50)
      doc.text(`Utilizacion: ${util.toFixed(1)}%`, 14, 56)
      doc.text(`Score: ${Number(plan.optimizationScore ?? 0).toFixed(1)}`, 14, 62)
      doc.text(`Version layout: v${Number(plan.layoutVersion ?? 1)}`, 14, 68)

      const rows = (plan.items ?? []).map((it: any) => {
        const p = it.product ?? {}
        const qty = Number(it.quantity ?? 0)
        const w = Number(p.weight ?? 0)
        const dims = `${p.length ?? '-'}x${p.width ?? '-'}x${p.height ?? '-'}`
        return [String(p.name ?? 'Producto'), String(p.category ?? '-'), String(qty), `${w} kg`, dims]
      })

      autoTable(doc, {
        startY: 74,
        head: [['Producto', 'Categoria', 'Cantidad', 'Peso', 'Dimensiones (cm)']],
        body: rows.length ? rows : [['(Sin productos)', '-', '-', '-', '-']],
        styles: { fontSize: 9 },
        headStyles: { fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      })

      const placementRows = (plan.placements ?? []).map((pl) => [
        String(pl.product?.name ?? 'Producto'),
        String(pl.pieceIndex ?? '-'),
        `(${Number(pl.positionX ?? 0).toFixed(0)}, ${Number(pl.positionY ?? 0).toFixed(0)}, ${Number(pl.positionZ ?? 0).toFixed(0)})`,
        String(Number(pl.rotationY ?? 0).toFixed(0)),
      ])
      const yAfterItems = (doc as any).lastAutoTable?.finalY
        ? Number((doc as any).lastAutoTable.finalY) + 8
        : 120
      autoTable(doc, {
        startY: yAfterItems,
        head: [['Producto', 'Pieza', 'Posicion', 'RotY']],
        body: placementRows.length ? placementRows : [['Sin placements', '-', '-', '-']],
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      })

      const instructionRows = (plan.instructions ?? []).map((ins) => {
        const pos = (ins.position ?? {}) as any
        return [
          String(ins.step),
          String(pos?.product?.name ?? '-'),
          String(pos?.routeStop ?? '-'),
          String(pos?.loadingZone ?? '-'),
          `(${Number(pos?.x ?? 0).toFixed(0)}, ${Number(pos?.y ?? 0).toFixed(0)}, ${Number(pos?.z ?? 0).toFixed(0)})`,
        ]
      })
      const yAfterPlacements = (doc as any).lastAutoTable?.finalY
        ? Number((doc as any).lastAutoTable.finalY) + 8
        : 160
      autoTable(doc, {
        startY: yAfterPlacements,
        head: [['Paso', 'Producto', 'Parada', 'Zona', 'Posicion']],
        body: instructionRows.length ? instructionRows : [['-', '-', '-', '-', '-']],
        styles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      })

      doc.save(`plan-carga-${plan.id}.pdf`)
    } catch (e: any) {
      console.error(e)
      alert(e?.message ?? 'Error descargando PDF')
    }
  }

  if (loading) return <div className="p-6">Cargando plan...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!plan || !container) return <div className="p-6">Plan no disponible.</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push('/load-plans')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-xl font-bold">{plan.name ?? 'Plan de Carga'}</h1>
            <p className="text-sm text-gray-500">{plan.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => router.push(`/load-plans/${planId}/edit-layout`)}>
            <Pencil className="h-4 w-4 mr-2" />
            Editar Carga de Unidad
          </Button>
          <Button variant="outline" onClick={downloadPdf}>
            <FileDown className="h-4 w-4 mr-2" />
            Descargar PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visualizacion 3D</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b bg-gray-50 px-4 py-2 text-xs text-gray-700">
            Vista principal del layout en modo consulta. Para ajustes manuales usa &quot;Editar Carga de Unidad&quot;.
          </div>
          {activeWarningCard && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
              Alerta activa: {activeWarningCard.presentation.title}. {highlightResult.description}
            </div>
          )}
          <LoadVisualizer3D
            container={container}
            cubes={visualizerCubes}
            focusCubeIds={Array.from(highlightResult.cubeIds)}
            focusToken={activeWarningHighlightKey}
            showControlPanel={false}
          />
        </CardContent>
      </Card>

      {operationalSteps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Instrucciones de Carga</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              Sigue estos pasos en orden para acomodar la carga.
            </p>
            <div className="space-y-3">
              {operationalSteps.map((instruction) => (
                <div
                  key={instruction.id}
                  className="flex items-start gap-4 rounded-lg border bg-gray-50 p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                    {instruction.step}
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">{instruction.productName}</p>
                    <p className="text-sm text-gray-600">
                      Parada: {instruction.routeStop} - Zona: {instruction.loadingZone}
                    </p>
                    <p className="text-sm text-gray-600">
                      Posicion: ({instruction.position.x.toFixed(0)}, {instruction.position.y.toFixed(0)}, {instruction.position.z.toFixed(0)})
                    </p>
                    {instruction.description && (
                      <p className="text-sm text-gray-700">{instruction.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Metricas y Riesgo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">Score</p>
              <p className="font-semibold">{Number(plan.optimizationScore ?? 0).toFixed(1)}</p>
            </div>
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">Version de Layout</p>
              <p className="font-semibold">v{Number(plan.layoutVersion ?? 1)}</p>
            </div>
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">Piezas</p>
              <p className="font-semibold">
                {metrics.placed}/{metrics.requested}
              </p>
              {metrics.unplaced > 0 && (
                <p className="text-xs text-red-600">{metrics.unplaced} sin colocar</p>
              )}
            </div>
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">IA</p>
              <p className="font-semibold">{metrics.aiStrategy ?? 'baseline'}</p>
              {metrics.aiImproved && <p className="text-xs text-green-700">mejora detectada</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm mt-4">
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">Issues criticos</p>
              <p className="font-semibold text-red-700">{metrics.criticalIssues}</p>
            </div>
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">Warnings</p>
              <p className="font-semibold text-amber-700">{metrics.warningIssues}</p>
            </div>
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">Centro de Gravedad</p>
              <p className="font-semibold">
                {plan.advancedMetrics?.centerOfGravity
                  ? `(${Number(plan.advancedMetrics.centerOfGravity.x ?? 0).toFixed(0)}, ${Number(plan.advancedMetrics.centerOfGravity.y ?? 0).toFixed(0)}, ${Number(plan.advancedMetrics.centerOfGravity.z ?? 0).toFixed(0)})`
                  : '-'}
              </p>
            </div>
            <div className="p-3 rounded border bg-gray-50">
              <p className="text-gray-500">Estabilidad</p>
              <p className="font-semibold">
                {plan.advancedMetrics?.stability
                  ? `${Number(plan.advancedMetrics.stability.score ?? 0).toFixed(1)} (${String(plan.advancedMetrics.stability.level ?? '-')})`
                  : '-'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas Detectadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {warningIssues.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded border border-red-200 bg-red-50 p-3">
                <p className="text-red-700">Bloquea despacho</p>
                <p className="font-semibold text-red-800">{warningGateSummary.blockCount}</p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-amber-700">Revisar antes de salir</p>
                <p className="font-semibold text-amber-800">{warningGateSummary.reviewCount}</p>
              </div>
            </div>
          )}
          {warningIssues.length === 0 && (
            <p className="text-sm text-gray-500">No hay alertas activas en esta carga.</p>
          )}
          {warningCards.map(({ issue, presentation, gate }, idx) => (
            <div
              key={`${issue.code}-${idx}`}
              className={
                gate.status === 'block'
                  ? 'rounded border border-red-200 bg-red-50 p-3'
                  : 'rounded border border-amber-200 bg-amber-50 p-3'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={gate.status === 'block' ? 'font-medium text-red-900' : 'font-medium text-amber-900'}>
                    {presentation.title}
                  </p>
                  <p className={gate.status === 'block' ? 'text-sm text-red-900' : 'text-sm text-amber-900'}>
                    {presentation.explanation}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge
                    variant="outline"
                    className={
                      gate.status === 'block'
                        ? 'border-red-400 text-red-800'
                        : 'border-amber-400 text-amber-800'
                    }
                  >
                    warning
                  </Badge>
                  <Badge
                    className={
                      gate.status === 'block'
                        ? 'bg-red-700 text-white hover:bg-red-700'
                        : 'bg-amber-600 text-white hover:bg-amber-600'
                    }
                  >
                    {gate.label}
                  </Badge>
                </div>
              </div>
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const warningKey = `${issue.code}-${idx}`
                    const isActive = activeWarningHighlightKey === warningKey
                    setActiveWarningHighlightKey(isActive ? null : warningKey)
                    document
                      .querySelector('h1')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  {activeWarningHighlightKey === `${issue.code}-${idx}`
                    ? 'Quitar resaltado'
                    : 'Resaltar en 3D'}
                </Button>
              </div>
              <p className={gate.status === 'block' ? 'mt-2 text-xs text-red-800' : 'mt-2 text-xs text-amber-800'}>
                Motivo operativo: {gate.reason}
              </p>
              {presentation.details.length > 0 && (
                <div className={gate.status === 'block' ? 'mt-2 text-xs text-red-800' : 'mt-2 text-xs text-amber-800'}>
                  <p className="font-semibold">Datos de la alerta</p>
                  <ul className="list-disc pl-4">
                    {presentation.details.map((line) => (
                      <li key={`${issue.code}-${line}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {presentation.actions.length > 0 && (
                <div className={gate.status === 'block' ? 'mt-2 text-xs text-red-900' : 'mt-2 text-xs text-amber-900'}>
                  <p className="font-semibold">Accion sugerida</p>
                  <ul className="list-disc pl-4">
                    {presentation.actions.map((action) => (
                      <li key={`${issue.code}-${action}`}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Historial de Versiones
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(plan.versions ?? []).map((v) => {
              const isCurrent = Number(v.version) === Number(plan.layoutVersion ?? 1)
              return (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">v{v.version}</span>
                      <Badge variant="outline">{v.source ?? 'optimize'}</Badge>
                      {isCurrent && <Badge>actual</Badge>}
                    </div>
                    <p className="text-gray-500">
                      {v.createdAt ? new Date(v.createdAt).toLocaleString() : '-'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isCurrent || restoringVersionId === v.id}
                    onClick={() => restoreVersion(v)}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {restoringVersionId === v.id ? 'Restaurando...' : 'Restaurar'}
                  </Button>
                </div>
              )
            })}
            {(plan.versions ?? []).length === 0 && (
              <p className="text-sm text-gray-500">Sin historial de versiones.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
