import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { products, vehicles } from '@/db/schema'
import { requireAuth } from '@/lib/auth-server'
import { optimizeLoad } from '@/lib/optimization'
import {
  previewOptimizeSchema,
  zodErrorMessage,
} from '@/lib/validation/load-plans'

type NullsToUndefined<T> = {
  [K in keyof T]:
    T[K] extends null ? undefined :
    T[K] extends (infer U | null) ? U | undefined :
    T[K]
}

function nullsToUndefined<T extends Record<string, unknown>>(obj: T): NullsToUndefined<T> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v === null ? undefined : v])
  ) as NullsToUndefined<T>
}

function toNum(v: unknown, def = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    const rawBody = await request.json().catch(() => null)
    const parsedBody = previewOptimizeSchema.safeParse(rawBody)

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: zodErrorMessage(parsedBody.error) },
        { status: 400 }
      )
    }

    const { vehicleId, items } = parsedBody.data

    const vehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, vehicleId),
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
      .map((item) => item.productId)
      .filter(Boolean)

    const existingProducts = await db.query.products.findMany({
      where: and(
        eq(products.companyId, auth.companyId),
        eq(products.isActive, true)
      ),
    })

    const productsById = new Map(existingProducts.map((p) => [p.id, p] as const))
    const invalidIds = requestProductIds.filter((id) => !productsById.has(id))
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
      .map((item) => {
        const product = productsById.get(item.productId)
        if (!product) return null

        const normalized = nullsToUndefined(product)
        const normalizedProduct: AlgoProduct = {
          ...(normalized as unknown as AlgoProduct),
          hsCode: normalized.hsCode ?? undefined,
          description: normalized.description ?? '',
          subcategory: normalized.subcategory ?? 'Sin subcategoria',
        }

        return { product: normalizedProduct, quantity: item.quantity }
      })
      .filter((x): x is ProductsForOptimization[number] => Boolean(x))

    if (productsForOptimization.length === 0) {
      return NextResponse.json(
        { error: 'No hay productos validos para optimizar' },
        { status: 400 }
      )
    }

    const normalizedVehicle = nullsToUndefined(vehicle)
    const vehicleForOptimization: AlgoVehicle = {
      ...(normalizedVehicle as AlgoVehicle),
      internalLength: toNum(normalizedVehicle.internalLength, 0),
      internalWidth: toNum(normalizedVehicle.internalWidth, 0),
      internalHeight: toNum(normalizedVehicle.internalHeight, 0),
      maxWeight: toNum(normalizedVehicle.maxWeight, 0),
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
