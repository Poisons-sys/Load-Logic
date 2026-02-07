import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { products } from '@/db/schema'
import { eq, and, like, desc } from 'drizzle-orm'
import { requireAuth } from 'src/lib/auth-server'

// GET - Listar todos los productos (solo activos)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const category = searchParams.get('category')
    const isHazardous = searchParams.get('isHazardous')

    // Base filter: por empresa + activos
    const baseWhere = and(
      eq(products.companyId, auth.companyId),
      eq(products.isActive, true)
    )

    let query = db.query.products.findMany({
      where: baseWhere,
      orderBy: desc(products.createdAt),
    })

    // Aplicar filtros (siempre manteniendo companyId + isActive)
    if (search) {
      query = db.query.products.findMany({
        where: and(
          baseWhere,
          like(products.name, `%${search}%`)
        ),
        orderBy: desc(products.createdAt),
      })
    }

    if (category) {
      query = db.query.products.findMany({
        where: and(
          baseWhere,
          eq(products.category, category as any)
        ),
        orderBy: desc(products.createdAt),
      })
    }

    // OJO: searchParams.get() regresa string | null
    if (isHazardous !== null) {
      query = db.query.products.findMany({
        where: and(
          baseWhere,
          eq(products.isHazardous, isHazardous === 'true')
        ),
        orderBy: desc(products.createdAt),
      })
    }

    const allProducts = await query

    return NextResponse.json({
      success: true,
      data: allProducts,
      count: allProducts.length,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo productos:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST - Crear nuevo producto
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)

    const body = await request.json()
    const {
      name,
      description,
      category,
      subcategory,
      hsCode,
      length,
      width,
      height,
      weight,
      fragility,
      stackable,
      maxStackHeight,
      temperatureReq,
      temperatureMin,
      temperatureMax,
      humiditySensitive,
      isHazardous,
      hazardClass,
      unNumber,
      incompatibleWith,
      specialInstructions,
    } = body

    // Validaciones
    if (!name || !category || !length || !width || !height || !weight) {
      return NextResponse.json(
        { error: 'Nombre, categoría, dimensiones y peso son requeridos' },
        { status: 400 }
      )
    }

    // Calcular volumen
    const volume = (length * width * height) / 1000000 // en m³

    const [newProduct] = await db.insert(products)
      .values({
        name,
        description,
        category: category as any,
        subcategory,
        hsCode,
        length,
        width,
        height,
        weight,
        volume,
        fragility: fragility || 'baja',
        stackable: stackable !== undefined ? stackable : true,
        maxStackHeight: maxStackHeight || 1,
        temperatureReq: temperatureReq || 'ambiente',
        temperatureMin,
        temperatureMax,
        humiditySensitive: humiditySensitive || false,
        isHazardous: isHazardous || false,
        hazardClass,
        unNumber,
        nom002Compliance: isHazardous ? true : false,
        incompatibleWith: incompatibleWith || [],
        specialInstructions,
        companyId: auth.companyId,
        isActive: true,
      })
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Producto creado exitosamente',
      data: newProduct,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error creando producto:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
