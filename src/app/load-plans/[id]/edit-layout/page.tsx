'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Cube3DData, LayoutEditStats } from '@/components/LoadVisualizer3D'

const LoadVisualizer3D = dynamic(() => import('@/components/LoadVisualizer3D'), {
  ssr: false,
})

type PlanItem = {
  id: string
  quantity: number
  rotationY?: number | null
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
  instanceKey?: string | null
  positionX?: number | null
  positionY?: number | null
  positionZ?: number | null
  rotationY?: number | null
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

type LoadPlan = {
  id: string
  name: string
  layoutVersion?: number | null
  vehicle: {
    internalWidth: number
    internalHeight: number
    internalLength: number
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

export default function LoadPlanEditLayoutPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const planId = typeof params?.id === 'string' ? params.id : ''

  const [plan, setPlan] = useState<LoadPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingLayout, setSavingLayout] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [layoutEditStats, setLayoutEditStats] = useState<LayoutEditStats>({
    moves: 0,
    swaps: 0,
    rotates: 0,
    undos: 0,
    redos: 0,
    keyNudges: 0,
    updatedAt: 0,
  })
  const [layoutDraftCubes, setLayoutDraftCubes] = useState<Cube3DData[] | null>(null)

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

  const planCubes = useMemo<Cube3DData[]>(() => {
    const fromPlacements = (plan?.placements ?? [])
      .slice()
      .sort((a, b) => Number(a.loadingOrder ?? 0) - Number(b.loadingOrder ?? 0))
      .map((placement) => {
        const product = placement.product
        if (!product) return null
        const rotDeg = Number(placement.rotationY ?? 0)
        return {
          id: String(placement.instanceKey ?? `pl-${placement.id}`),
          instanceId: String(placement.instanceKey ?? `pl-${placement.id}`),
          x: Number(placement.positionZ ?? 0),
          y: Number(placement.positionY ?? 0),
          z: Number(placement.positionX ?? 0),
          width: Number(product.width ?? 0),
          height: Number(product.height ?? 0),
          depth: Number(product.length ?? 0),
          rotY: (rotDeg * Math.PI) / 180,
          color: getCategoryColor(String(product.category ?? 'generales')),
          name: String(product.name ?? 'Producto'),
          weightKg: Number(product.weight ?? 0),
          product,
        }
      })
      .filter(Boolean) as Cube3DData[]

    if (fromPlacements.length > 0) return fromPlacements

    const fromInstructions = (plan?.instructions ?? [])
      .map((ins, idx) => {
        const pos = ins?.position as any
        const product = pos?.product
        if (!pos || !product) return null
        const rotDeg = Number(pos.rotation?.y ?? 0)
        return {
          id: `ins-${ins.step}-${idx}`,
          x: Number(pos.z ?? 0),
          y: Number(pos.y ?? 0),
          z: Number(pos.x ?? 0),
          width: Number(product.width ?? 0),
          height: Number(product.height ?? 0),
          depth: Number(product.length ?? product.depth ?? 0),
          rotY: (rotDeg * Math.PI) / 180,
          color: getCategoryColor(String(product.category ?? 'generales')),
          name: String(product.name ?? 'Producto'),
          weightKg: Number(product.weight ?? 0),
          product,
        } as Cube3DData
      })
      .filter(Boolean) as Cube3DData[]

    if (fromInstructions.length > 0) return fromInstructions

    const out: Cube3DData[] = []
    const items = plan?.items ?? []
    const maxW = Math.max(1, Number(container?.width ?? 1))
    const maxD = Math.max(1, Number(container?.depth ?? 1))

    items.forEach((item, idx) => {
      if (!item.product) return
      const p = item.product
      const width = Math.max(1, Number(p.width ?? 0))
      const height = Math.max(1, Number(p.height ?? 0))
      const depth = Math.max(1, Number(p.length ?? 0))
      const cols = Math.max(1, Math.floor(maxW / width))
      const rows = Math.max(1, Math.floor(maxD / depth))
      const perLayer = Math.max(1, cols * rows)
      const qty = Math.max(1, Number(item.quantity ?? 1))
      const rotDeg = Number(item.rotationY ?? 0)
      const rotY = Number.isFinite(rotDeg) ? (rotDeg * Math.PI) / 180 : 0

      for (let q = 0; q < qty; q++) {
        const layer = Math.floor(q / perLayer)
        const index = q % perLayer
        const col = index % cols
        const row = Math.floor(index / cols)
        out.push({
          id: `${p.id}-${idx}-${q}`,
          instanceId: `${p.id}-${idx}-${q}`,
          x: row * depth,
          y: layer * height,
          z: col * width,
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

  useEffect(() => {
    setLayoutDraftCubes(planCubes)
    setLayoutEditStats({
      moves: 0,
      swaps: 0,
      rotates: 0,
      undos: 0,
      redos: 0,
      keyNudges: 0,
      updatedAt: 0,
    })
    setSaveFeedback(null)
  }, [plan?.id, plan?.layoutVersion, planCubes])

  const activeCubes = layoutDraftCubes ?? planCubes

  const saveManualLayoutVersion = async () => {
    if (!planId || activeCubes.length === 0) return
    try {
      setSavingLayout(true)
      setSaveFeedback(null)
      const manualCubes = activeCubes
        .map((cube) => {
          const productId = String(cube.product?.id ?? '').trim()
          if (!productId) return null
          return {
            instanceId: String(cube.instanceId ?? cube.id),
            x: Number(cube.x ?? 0),
            y: Number(cube.y ?? 0),
            z: Number(cube.z ?? 0),
            width: Number(cube.width ?? 0),
            height: Number(cube.height ?? 0),
            depth: Number(cube.depth ?? 0),
            rotY: Number(cube.rotY ?? 0),
            routeStop: Math.max(1, Number(cube.routeStop ?? 1)),
            productId,
          }
        })
        .filter(Boolean)

      const res = await fetch(`/api/load-plans/${planId}/optimize`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          manualCubes,
          telemetry: layoutEditStats,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'No se pudo guardar el layout manual')
      }
      const json = await res.json()
      const nextPlan = json?.data?.loadPlan ?? null
      if (nextPlan) setPlan(nextPlan)
      setSaveFeedback(`Layout manual guardado como version v${Number(nextPlan?.layoutVersion ?? plan?.layoutVersion ?? 1)}.`)
    } catch (e: any) {
      setSaveFeedback(e?.message ?? 'Error guardando layout manual')
    } finally {
      setSavingLayout(false)
    }
  }

  if (loading) return <div className="p-6">Cargando editor de carga...</div>
  if (error) return <div className="p-6 text-red-600">{error}</div>
  if (!plan || !container) return <div className="p-6">Plan no disponible.</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push(`/load-plans/${planId}/view`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a Ver 3D
          </Button>
          <div>
            <h1 className="text-xl font-bold">Editar Carga de Unidad</h1>
            <p className="text-sm text-gray-500">
              {plan.name} - version actual v{Number(plan.layoutVersion ?? 1)}
            </p>
          </div>
        </div>
        <Button onClick={saveManualLayoutVersion} disabled={savingLayout || activeCubes.length === 0}>
          <Save className="h-4 w-4 mr-2" />
          {savingLayout ? 'Guardando...' : 'Guardar Version Manual'}
        </Button>
      </div>

      {saveFeedback && <p className="text-sm text-gray-700">{saveFeedback}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Editor Manual 3D</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <LoadVisualizer3D
            container={container}
            cubes={activeCubes}
            onCubesChange={setLayoutDraftCubes}
            onEditStatsChange={setLayoutEditStats}
          />
        </CardContent>
      </Card>
    </div>
  )
}
