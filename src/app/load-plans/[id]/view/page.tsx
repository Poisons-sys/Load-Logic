'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, FileDown, History, RotateCcw } from 'lucide-react'
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

export default function LoadPlan3DViewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const planId = typeof params?.id === 'string' ? params.id : ''

  const [plan, setPlan] = useState<LoadPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null)

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

  const cubes = useMemo(() => {
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

        <Button variant="outline" onClick={downloadPdf}>
          <FileDown className="h-4 w-4 mr-2" />
          Descargar PDF
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visualizacion 3D</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <LoadVisualizer3D container={container} cubes={cubes} />
        </CardContent>
      </Card>

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
