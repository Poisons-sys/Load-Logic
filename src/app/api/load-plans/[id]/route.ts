import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  loadPlanItems,
  loadPlanPlacements,
  loadPlanVersions,
  loadPlans,
  loadingInstructions,
  products,
  vehicles,
} from '@/db/schema'
import { requireAuth } from '@/lib/auth-server'
import { optimizeLoad } from '@/lib/optimization'
import { updateLoadPlanSchema, zodErrorMessage } from '@/lib/validation/load-plans'

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

function resolveStoredStrategy(raw: unknown): 'baseline' | 'intelligent' {
  return raw === 'baseline' || raw === 'intelligent' ? raw : 'intelligent'
}

// GET - Obtener plan de carga por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)

    const loadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
        items: { with: { product: true } },
        placements: {
          orderBy: (placements, { asc }) => [asc(placements.loadingOrder)],
          with: {
            product: true,
          },
        },
        instructions: {
          orderBy: (instructions, { asc }) => [asc(instructions.step)],
        },
        versions: {
          orderBy: (versions, { desc }) => [desc(versions.version)],
        },
      },
    })

    if (!loadPlan) {
      return NextResponse.json({ error: 'Plan de carga no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: loadPlan })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error obteniendo plan de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// PUT - Actualizar plan de carga
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)

    const existingLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        items: {
          with: {
            product: true,
          },
        },
      },
    })

    if (!existingLoadPlan) {
      return NextResponse.json({ error: 'Plan de carga no encontrado' }, { status: 404 })
    }

    const rawBody = await request.json().catch(() => null)
    const parsedBody = updateLoadPlanSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: zodErrorMessage(parsedBody.error) },
        { status: 400 }
      )
    }

    const { name, description, vehicleId, status, items } = parsedBody.data

    let totalWeight = existingLoadPlan.totalWeight
    let totalVolume = existingLoadPlan.totalVolume
    let spaceUtilization = existingLoadPlan.spaceUtilization
    const nextName = name || existingLoadPlan.name
    const nextDescription = description !== undefined ? description : existingLoadPlan.description
    const targetVehicleId = vehicleId ?? existingLoadPlan.vehicleId
    const hasItemsChange = Array.isArray(items) && items.length > 0
    const hasVehicleChange = Boolean(vehicleId) && vehicleId !== existingLoadPlan.vehicleId
    const hasStructuralChange = hasItemsChange || hasVehicleChange
    const nextStatus = hasStructuralChange ? 'pendiente' : (status || existingLoadPlan.status)
    const previousStrategy = resolveStoredStrategy(
      (existingLoadPlan.advancedMetrics as any)?.ai?.strategy
    )

    if (!targetVehicleId) {
      return NextResponse.json(
        { error: 'Plan de carga sin vehiculo asignado' },
        { status: 400 }
      )
    }

    const vehicle = await db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, targetVehicleId),
        eq(vehicles.companyId, auth.companyId)
      ),
    })

    if (!vehicle) {
      return NextResponse.json({ error: 'Vehiculo no encontrado' }, { status: 404 })
    }

    const allProducts = await db.query.products.findMany({
      where: and(
        eq(products.companyId, auth.companyId),
        eq(products.isActive, true)
      ),
    })
    const productsById = new Map(allProducts.map((p) => [p.id, p] as const))

    const effectiveItems = hasItemsChange
      ? items
      : existingLoadPlan.items
          .filter((item) => item.productId)
          .map((item) => ({
            productId: String(item.productId),
            quantity: Number(item.quantity ?? 0),
            routeStop: Number((item as any).routeStop ?? 1),
          }))

    totalWeight = 0
    totalVolume = 0
    const nextItemsRows: Array<{ loadPlanId: string; productId: string; quantity: number; routeStop: number }> = []

    for (const item of effectiveItems) {
      const product = productsById.get(item.productId)
      if (!product) continue

      totalWeight += Number(product.weight ?? 0) * Number(item.quantity ?? 0)
      totalVolume += Number(product.volume ?? 0) * Number(item.quantity ?? 0)
      nextItemsRows.push({
        loadPlanId: id,
        productId: item.productId,
        quantity: Number(item.quantity ?? 0),
        routeStop: item.routeStop ?? 1,
      })
    }

    if (nextItemsRows.length === 0) {
      return NextResponse.json(
        { error: 'No hay productos validos para guardar en el plan' },
        { status: 400 }
      )
    }

    if (totalWeight > Number(vehicle.maxWeight ?? 0)) {
      return NextResponse.json(
        { error: `El peso total (${totalWeight}kg) excede la capacidad del vehiculo (${vehicle.maxWeight}kg)` },
        { status: 400 }
      )
    }

    if (totalVolume > Number(vehicle.maxVolume ?? 0)) {
      return NextResponse.json(
        { error: `El volumen total (${totalVolume}m3) excede la capacidad del vehiculo (${vehicle.maxVolume}m3)` },
        { status: 400 }
      )
    }

    const maxVol = Number(vehicle.maxVolume ?? 0)
    spaceUtilization = maxVol > 0 ? (totalVolume / maxVol) * 100 : 0

    await db.transaction(async (tx) => {
      if (hasStructuralChange) {
        await tx.delete(loadPlanPlacements).where(eq(loadPlanPlacements.loadPlanId, id))
        await tx.delete(loadPlanVersions).where(eq(loadPlanVersions.loadPlanId, id))
        await tx.delete(loadingInstructions).where(eq(loadingInstructions.loadPlanId, id))
      }

      if (hasItemsChange) {
        await tx.delete(loadPlanItems).where(eq(loadPlanItems.loadPlanId, id))
        await tx.insert(loadPlanItems).values(nextItemsRows)
      }

      await tx
        .update(loadPlans)
        .set({
          name: nextName,
          description: nextDescription,
          vehicleId: targetVehicleId,
          status: nextStatus,
          totalWeight,
          totalVolume,
          spaceUtilization,
          weightDistribution: hasStructuralChange ? { front: 0, center: 0, rear: 0 } : existingLoadPlan.weightDistribution,
          advancedMetrics: hasStructuralChange ? null : existingLoadPlan.advancedMetrics,
          optimizationScore: hasStructuralChange ? 0 : existingLoadPlan.optimizationScore,
          layoutVersion: hasStructuralChange ? 1 : existingLoadPlan.layoutVersion,
          nom012Compliant: Boolean(vehicle.nom012Compliant),
          updatedAt: new Date(),
        })
        .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
    })

    if (hasStructuralChange) {
      try {
        const reloadedPlan = await db.query.loadPlans.findFirst({
          where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
          with: {
            vehicle: true,
            items: {
              with: {
                product: true,
              },
            },
          },
        })

        if (reloadedPlan?.vehicle) {
          type ProductsForOptimization = Parameters<typeof optimizeLoad>[0]
          type AlgoProduct = ProductsForOptimization[number]['product']
          type AlgoVehicle = Parameters<typeof optimizeLoad>[1]

          const productsForOptimization: ProductsForOptimization = []
          for (const item of reloadedPlan.items) {
            if (!item.product) continue
            const normalizedProduct = nullsToUndefined(item.product)
            productsForOptimization.push({
              product: {
                ...(normalizedProduct as unknown as AlgoProduct),
                hsCode: normalizedProduct.hsCode ?? undefined,
                description: normalizedProduct.description ?? '',
                subcategory: normalizedProduct.subcategory ?? 'Sin subcategoria',
              },
              quantity: Number(item.quantity ?? 0),
              routeStop: Number((item as any).routeStop ?? 1),
            })
          }

          const normalizedVehicle = nullsToUndefined(reloadedPlan.vehicle)
          const vehicleForOptimization: AlgoVehicle = {
            ...(normalizedVehicle as unknown as AlgoVehicle),
            internalLength: toNum(normalizedVehicle.internalLength, 0),
            internalWidth: toNum(normalizedVehicle.internalWidth, 0),
            internalHeight: toNum(normalizedVehicle.internalHeight, 0),
            maxWeight: toNum(normalizedVehicle.maxWeight, 0),
          }

          if (productsForOptimization.length > 0) {
            const optimizationResult = await optimizeLoad(
              productsForOptimization,
              vehicleForOptimization,
              { strategy: previousStrategy }
            )

            await db.transaction(async (tx) => {
              await tx.delete(loadPlanPlacements).where(eq(loadPlanPlacements.loadPlanId, id))
              await tx.delete(loadingInstructions).where(eq(loadingInstructions.loadPlanId, id))

              const itemByProductId = new Map<string, (typeof reloadedPlan.items)[number]>()
              for (const item of reloadedPlan.items) {
                if (!item.productId) continue
                itemByProductId.set(String(item.productId), item)
              }
              const pieceIndexByProductId = new Map<string, number>()

              if (optimizationResult.placedItems.length > 0) {
                await tx.insert(loadPlanPlacements).values(
                  optimizationResult.placedItems.map((placedItem, index) => {
                    const productId = String(placedItem.product.id)
                    const loadItem = itemByProductId.get(productId)
                    const nextPieceIndex = (pieceIndexByProductId.get(productId) ?? -1) + 1
                    pieceIndexByProductId.set(productId, nextPieceIndex)

                    return {
                      loadPlanId: id,
                      itemId: loadItem?.id ?? null,
                      productId,
                      pieceIndex: nextPieceIndex,
                      instanceKey: String((placedItem as any).instanceId ?? `${productId}-${index + 1}`),
                      positionX: Number(placedItem.position.x ?? 0),
                      positionY: Number(placedItem.position.y ?? 0),
                      positionZ: Number(placedItem.position.z ?? 0),
                      rotationX: Number(placedItem.rotation.x ?? 0),
                      rotationY: Number(placedItem.rotation.y ?? 0),
                      rotationZ: Number(placedItem.rotation.z ?? 0),
                      loadingOrder: index + 1,
                    }
                  })
                )
              }

              if (optimizationResult.instructions.length > 0) {
                await tx.insert(loadingInstructions).values(
                  optimizationResult.instructions.map((instruction) => {
                    return {
                      loadPlanId: id,
                      step: Number(instruction.step ?? 0),
                      description: String(instruction.description ?? ''),
                      itemId: null,
                      position: {
                        x: Number(instruction.position.x ?? 0),
                        y: Number(instruction.position.y ?? 0),
                        z: Number(instruction.position.z ?? 0),
                        rotation: { x: 0, y: 0, z: 0 },
                        loadingZone: instruction.loadingZone,
                        routeStop: Number(instruction.routeStop ?? 1),
                        product: {
                          id: String(instruction.instanceId ?? instruction.productName),
                          name: instruction.productName,
                        },
                      },
                      orientation: String(instruction.loadingZone ?? ''),
                      specialNotes: null,
                    }
                  })
                )
              }

              await tx
                .update(loadPlans)
                .set({
                  status: 'optimizado',
                  totalWeight: optimizationResult.totalWeight,
                  spaceUtilization: optimizationResult.utilization,
                  weightDistribution: optimizationResult.weightDistribution,
                  advancedMetrics: {
                    axleDistribution: optimizationResult.axleDistribution,
                    centerOfGravity: optimizationResult.centerOfGravity,
                    stability: optimizationResult.stability,
                    heatmap: optimizationResult.heatmap,
                    validations: optimizationResult.validations,
                    kpis: optimizationResult.kpis,
                    ai: optimizationResult.ai ?? null,
                    unplacedItems: optimizationResult.unplacedItems,
                    requestedItemsCount: optimizationResult.requestedItemsCount,
                    placedItemsCount: optimizationResult.placedItemsCount,
                    unplacedItemsCount: optimizationResult.unplacedItems.length,
                  },
                  optimizationScore: optimizationResult.kpis.overallScore,
                  layoutVersion: Math.max(1, Number(existingLoadPlan.layoutVersion ?? 1) + 1),
                  updatedAt: new Date(),
                })
                .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
            })
          }
        }
      } catch (reoptimizeError) {
        console.error('Error reoptimizando plan tras edicion:', reoptimizeError)
      }
    }

    const completeLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        items: { with: { product: true } },
        placements: {
          orderBy: (placements, { asc }) => [asc(placements.loadingOrder)],
          with: {
            product: true,
          },
        },
        instructions: {
          orderBy: (instructions, { asc }) => [asc(instructions.step)],
        },
        versions: {
          orderBy: (versions, { desc }) => [desc(versions.version)],
        },
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: hasStructuralChange
        ? 'Plan de carga actualizado y reoptimizado exitosamente'
        : 'Plan de carga actualizado exitosamente',
      data: completeLoadPlan,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error actualizando plan de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// DELETE - Eliminar plan de carga
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const auth = await requireAuth(request)

    const existingLoadPlan = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
    })

    if (!existingLoadPlan) {
      return NextResponse.json({ error: 'Plan de carga no encontrado' }, { status: 404 })
    }

    if (auth.role !== 'admin' && existingLoadPlan.createdBy !== auth.userId) {
      return NextResponse.json(
        { error: 'No tiene permisos para eliminar este plan de carga' },
        { status: 403 }
      )
    }

    await db.transaction(async (tx) => {
      await tx.delete(loadPlanPlacements).where(eq(loadPlanPlacements.loadPlanId, id))
      await tx.delete(loadPlanVersions).where(eq(loadPlanVersions.loadPlanId, id))
      await tx.delete(loadingInstructions).where(eq(loadingInstructions.loadPlanId, id))
      await tx.delete(loadPlanItems).where(eq(loadPlanItems.loadPlanId, id))
      await tx
        .delete(loadPlans)
        .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))
    })

    return NextResponse.json({
      success: true,
      message: 'Plan de carga eliminado exitosamente',
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error eliminando plan de carga:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
