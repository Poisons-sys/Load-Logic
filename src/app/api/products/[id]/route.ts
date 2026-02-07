import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { products } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

// GET - Obtener producto por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const auth = await requireAuth(request)

    const product = await db.query.products.findFirst({
      where: and(
        eq(products.id, id),
        eq(products.companyId, auth.companyId)
      ),
    })

    if (!product) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: product,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo producto:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// PUT - Actualizar producto
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const auth = await requireAuth(request)

    // Verificar que el producto existe y pertenece a la empresa
    const existingProduct = await db.query.products.findFirst({
      where: and(
        eq(products.id, id),
        eq(products.companyId, auth.companyId)
      ),
    })

    if (!existingProduct) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

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
      isActive,
    } = body

    // Recalcular volumen si cambiaron las dimensiones
    const newLength = length || existingProduct.length
    const newWidth = width || existingProduct.width
    const newHeight = height || existingProduct.height
    const volume = (newLength * newWidth * newHeight) / 1000000

    const [updatedProduct] = await db.update(products)
      .set({
        name: name || existingProduct.name,
        description: description !== undefined ? description : existingProduct.description,
        category: category || existingProduct.category,
        subcategory: subcategory !== undefined ? subcategory : existingProduct.subcategory,
        hsCode: hsCode !== undefined ? hsCode : existingProduct.hsCode,
        length: newLength,
        width: newWidth,
        height: newHeight,
        weight: weight || existingProduct.weight,
        volume,
        fragility: fragility || existingProduct.fragility,
        stackable: stackable !== undefined ? stackable : existingProduct.stackable,
        maxStackHeight: maxStackHeight || existingProduct.maxStackHeight,
        temperatureReq: temperatureReq || existingProduct.temperatureReq,
        temperatureMin: temperatureMin !== undefined ? temperatureMin : existingProduct.temperatureMin,
        temperatureMax: temperatureMax !== undefined ? temperatureMax : existingProduct.temperatureMax,
        humiditySensitive: humiditySensitive !== undefined ? humiditySensitive : existingProduct.humiditySensitive,
        isHazardous: isHazardous !== undefined ? isHazardous : existingProduct.isHazardous,
        hazardClass: hazardClass !== undefined ? hazardClass : existingProduct.hazardClass,
        unNumber: unNumber !== undefined ? unNumber : existingProduct.unNumber,
        nom002Compliance: isHazardous !== undefined ? isHazardous : existingProduct.nom002Compliance,
        incompatibleWith: incompatibleWith || existingProduct.incompatibleWith,
        specialInstructions: specialInstructions !== undefined ? specialInstructions : existingProduct.specialInstructions,
        isActive: isActive !== undefined ? isActive : existingProduct.isActive,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning()

    return NextResponse.json({
      success: true,
      message: 'Producto actualizado exitosamente',
      data: updatedProduct,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando producto:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE - Eliminar producto (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const auth = await requireAuth(request)

    // Solo admin puede eliminar
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para eliminar productos' },
        { status: 403 }
      )
    }

    const existingProduct = await db.query.products.findFirst({
      where: and(
        eq(products.id, id),
        eq(products.companyId, auth.companyId)
      ),
    })

    if (!existingProduct) {
      return NextResponse.json(
        { error: 'Producto no encontrado' },
        { status: 404 }
      )
    }

    // Soft delete
    await db.update(products)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))

    return NextResponse.json({
      success: true,
      message: 'Producto eliminado exitosamente',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error eliminando producto:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
