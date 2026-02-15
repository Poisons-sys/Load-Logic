'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ArrowLeft, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const LoadVisualizer3D = dynamic(() => import('@/components/LoadVisualizer3D'), { ssr: false })

type PlanItem = {
  id?: string
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

type LoadPlan = {
  id: string
  name: string
  status?: string | null
  totalWeight?: number | null
  spaceUtilization?: number | null
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
  instructions?: PlanInstruction[]
}

export default function LoadPlan3DViewPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [plan, setPlan] = useState<LoadPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/load-plans/${id}`, { credentials: 'include', cache: 'no-store' })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error ?? 'No se pudo cargar el plan')
        }
        const json = await res.json()
        if (cancelled) return
        setPlan(json?.data ?? null)
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Error cargando plan')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (id) run()
    return () => {
      cancelled = true
    }
  }, [id])

  const container = useMemo(() => {
    const v = plan?.vehicle
    if (!v) return null
    return {
      width: Number(v.internalWidth ?? 0),
      height: Number(v.internalHeight ?? 0),
      depth: Number(v.internalLength ?? 0),
    }
  }, [plan])

  const cubes = useMemo(() => {
    const fromInstructions = (plan?.instructions ?? [])
      .map((ins, idx) => {
        const pos = ins?.position as any
        const product = pos?.product
        if (!pos || !product) return null

        // Algorithm: X=lateral, Y=height, Z=advance
        // Visualizer: X=advance, Y=height, Z=lateral
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

    // Legacy fallback for old plans without per-piece instructions.
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

      const rows = (plan.items ?? []).map((it: any) => {
        const p = it.product ?? {}
        const qty = Number(it.quantity ?? 0)
        const w = Number(p.weight ?? 0)
        const dims = `${p.length ?? '-'}x${p.width ?? '-'}x${p.height ?? '-'}`
        return [String(p.name ?? 'Producto'), String(p.category ?? '-'), String(qty), `${w} kg`, dims]
      })

      autoTable(doc, {
        startY: 64,
        head: [['Producto', 'Categoria', 'Cantidad', 'Peso', 'Dimensiones (cm)']],
        body: rows.length ? rows : [['(Sin productos)', '-', '-', '-', '-']],
        styles: { fontSize: 9 },
        headStyles: { fontStyle: 'bold' },
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
    </div>
  )
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
