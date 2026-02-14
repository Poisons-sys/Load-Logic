import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { products, vehicles } from '@/db/schema'
import { requireAuth } from '@/lib/auth-server'
import { optimizeLoad } from '@/lib/optimization'

type NullsToUndefined<T> = {
  [K in keyof T]:
    T[K] extends null ? undefined :
    T[K] extends (infer U | null) ? U | undefined :
    T[K]
}

function nullsToUndefined<T extends Record<string, any>>(obj: T): NullsToUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === null ? undefined : v])
  ) as NullsToUndefined<T>
}

function toBool(v: any, def = false) {
  if (v === null || v === undefined) return def
  return Boolean(v)
}

function toNum(v: any, def = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const body = await request.json()
    const { vehicleId, items } = body ?? {}

    if (!vehicleId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Vehiculo e items son requeridos' },
        { status: 400 }
      )
    }

    const vehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, String(vehicleId)),
        eq(vehicles.companyId, auth.companyId)
      ),
    })

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehiculo no encontrado' },
        { status: 404 }
      )
    }

    const requestProductIds = items
      .map((it: any) => String(it?.productId ?? ''))
      .filter(Boolean)

    const existingProducts = await db.query.products.findMany({
      where: and(
        eq(products.companyId, auth.companyId),
        eq(products.isActive, true)
      ),
    })

    const validIds = new Set(existingProducts.map(p => p.id))
    const invalidIds = requestProductIds.filter((id: string) => !validIds.has(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: `Productos no validos: ${invalidIds.join(', ')}` },
        { status: 400 }
      )
    }

    type ProductsForOptimization = Parameters<typeof optimizeLoad>[0]
    type AlgoProduct = ProductsForOptimization[number]['product']
    type AlgoVehicle = Parameters<typeof optimizeLoad>[1]

    const productsForOptimization: ProductsForOptimization = items
      .map((it: any) => {
        const productId = String(it?.productId ?? '')
        const quantity = Number(it?.quantity ?? 0)
        const p = existingProducts.find(x => x.id === productId)
        if (!p || quantity <= 0) return null

        const normalized = nullsToUndefined(p)
        const normalizedProduct: AlgoProduct = {
          ...(normalized as any),
          hsCode: (normalized as any).hsCode ?? undefined,
          description: (normalized as any).description ?? '',
          subcategory: (normalized as any).subcategory ?? 'Sin subcategoria',
        }

        return { product: normalizedProduct, quantity }
      })
      .filter(Boolean) as ProductsForOptimization

    if (productsForOptimization.length === 0) {
      return NextResponse.json(
        { error: 'No hay productos validos para optimizar' },
        { status: 400 }
      )
    }

    const vehicleForOptimization: AlgoVehicle = {
      ...(vehicle as any),
      hasRefrigeration: toBool((vehicle as any).hasRefrigeration, false),
      hasLiftgate: toBool((vehicle as any).hasLiftgate, false),
      hasSideDoor: toBool((vehicle as any).hasSideDoor, false),
      hasRearDoor: toBool((vehicle as any).hasRearDoor, true),
      hasTemperatureControl: toBool((vehicle as any).hasTemperatureControl, false),
      isHazmatAllowed: toBool((vehicle as any).isHazmatAllowed, false),
      hazardousMaterialAuthorized: toBool((vehicle as any).hazardousMaterialAuthorized, false),
      internalLength: toNum((vehicle as any).internalLength, (vehicle as any).internalLength ?? 0),
      internalWidth: toNum((vehicle as any).internalWidth, (vehicle as any).internalWidth ?? 0),
      internalHeight: toNum((vehicle as any).internalHeight, (vehicle as any).internalHeight ?? 0),
      maxWeight: toNum((vehicle as any).maxWeight, (vehicle as any).maxWeight ?? 0),
    }

    const optimization = await optimizeLoad(productsForOptimization, vehicleForOptimization)

    return NextResponse.json({
      success: true,
      data: { optimization },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error en preview de optimizacion:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
