import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db'
import { vehicles } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { requireAuth } from '@/lib/auth-server'

// GET - Obtener vehículo por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth(request)

    const vehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, id),
        eq(vehicles.companyId, auth.companyId)
      ),
    })

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: vehicle,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// PUT - Actualizar vehículo
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth(request)

    // Verificar que el vehículo existe y pertenece a la empresa
    const existingVehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, id),
        eq(vehicles.companyId, auth.companyId)
      ),
    })

    if (!existingVehicle) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const {
      name,
      type,
      plateNumber,
      internalLength,
      internalWidth,
      internalHeight,
      maxWeight,
      hasRefrigeration,
      minTemperature,
      maxTemperature,
      axles,
      frontAxleMaxWeight,
      rearAxleMaxWeight,
      nom012Compliant,
      nom068Compliant,
      hazardousMaterialAuthorized,
      isActive,
    } = body

    // Verificar si la nueva placa ya existe en otro vehículo
    if (plateNumber && plateNumber !== existingVehicle.plateNumber) {
      const plateExists = await db.query.vehicles.findFirst({
        where: and(
          eq(vehicles.companyId, auth.companyId),
          eq(vehicles.plateNumber, plateNumber.toUpperCase())
        ),
      })

      if (plateExists) {
        return NextResponse.json(
          { error: 'Ya existe un vehículo con esa placa' },
          { status: 409 }
        )
      }
    }

    // Recalcular volumen si cambiaron las dimensiones
    const newLength = internalLength || existingVehicle.internalLength
    const newWidth = internalWidth || existingVehicle.internalWidth
    const newHeight = internalHeight || existingVehicle.internalHeight
    const maxVolume = (newLength * newWidth * newHeight) / 1000000

    // Validar NOM-012 si cambió el peso o ejes
    const newAxles = axles || existingVehicle.axles
    const newMaxWeight = maxWeight || existingVehicle.maxWeight
    const maxWeightsByAxles: Record<number, number> = {
      2: 17000, 3: 26000, 4: 36000, 5: 43000, 6: 48000, 7: 50000, 8: 52000, 9: 54000,
    }
    const isNom012Compliant = newMaxWeight <= (maxWeightsByAxles[newAxles] || 36000)

    const [updatedVehicle] = await db.update(vehicles)
      .set({
        name: name || existingVehicle.name,
        type: type || existingVehicle.type,
        plateNumber: plateNumber ? plateNumber.toUpperCase() : existingVehicle.plateNumber,
        internalLength: newLength,
        internalWidth: newWidth,
        internalHeight: newHeight,
        maxWeight: newMaxWeight,
        maxVolume,
        hasRefrigeration: hasRefrigeration !== undefined ? hasRefrigeration : existingVehicle.hasRefrigeration,
        minTemperature: minTemperature !== undefined ? minTemperature : existingVehicle.minTemperature,
        maxTemperature: maxTemperature !== undefined ? maxTemperature : existingVehicle.maxTemperature,
        axles: newAxles,
        frontAxleMaxWeight: frontAxleMaxWeight || existingVehicle.frontAxleMaxWeight,
        rearAxleMaxWeight: rearAxleMaxWeight || existingVehicle.rearAxleMaxWeight,
        nom012Compliant: nom012Compliant !== undefined ? nom012Compliant : isNom012Compliant,
        nom068Compliant: nom068Compliant !== undefined ? nom068Compliant : existingVehicle.nom068Compliant,
        hazardousMaterialAuthorized: hazardousMaterialAuthorized !== undefined ? hazardousMaterialAuthorized : existingVehicle.hazardousMaterialAuthorized,
        isActive: isActive !== undefined ? isActive : existingVehicle.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(vehicles.id, id), eq(vehicles.companyId, auth.companyId)))
      .returning()


    return NextResponse.json({
      success: true,
      message: 'Vehículo actualizado exitosamente',
      data: updatedVehicle,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE - Eliminar vehículo (soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await requireAuth(request)

    // Solo admin puede eliminar
    if (auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'No tiene permisos para eliminar vehículos' },
        { status: 403 }
      )
    }

    const existingVehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, id),
        eq(vehicles.companyId, auth.companyId)
      ),
    })

    if (!existingVehicle) {
      return NextResponse.json(
        { error: 'Vehículo no encontrado' },
        { status: 404 }
      )
    }

    // Soft delete
    await db.update(vehicles)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(and(eq(vehicles.id, id), eq(vehicles.companyId, auth.companyId)))

    return NextResponse.json({
      success: true,
      message: 'Vehículo eliminado exitosamente',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error eliminando vehículo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
