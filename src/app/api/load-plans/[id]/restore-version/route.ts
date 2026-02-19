import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  activityLogs,
  loadPlanItems,
  loadPlanPlacements,
  loadPlanVersions,
  loadPlans,
  loadingInstructions,
} from '@/db/schema'
import { requireAuth } from '@/lib/auth-server'
import {
  restoreLoadPlanVersionSchema,
  zodErrorMessage,
} from '@/lib/validation/load-plans'

type SnapshotPlacedItem = {
  instanceId?: string
  productId?: string
  product?: {
    id?: string
    name?: string
    category?: string
    width?: number
    height?: number
    length?: number
    weight?: number
  }
  routeStop?: number
  stackLevel?: number
  position?: {
    x?: number
    y?: number
    z?: number
  }
  rotation?: {
    x?: number
    y?: number
    z?: number
  }
}

type SnapshotInstruction = {
  description?: string
  instanceId?: string
  routeStop?: number
  loadingZone?: string
}

function toNum(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeWeightDistribution(value: unknown) {
  const input = (value ?? {}) as Record<string, unknown>
  return {
    front: toNum(input.front, 0),
    center: toNum(input.center, 0),
    rear: toNum(input.rear, 0),
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const auth = await requireAuth(request)

    const rawBody = await request.json().catch(() => null)
    const parsedBody = restoreLoadPlanVersionSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: zodErrorMessage(parsedBody.error) },
        { status: 400 }
      )
    }

    const loadPlan = await db.query.loadPlans.findFirst({
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

    if (!loadPlan || !loadPlan.vehicle) {
      return NextResponse.json(
        { error: 'Plan de carga no encontrado o vehiculo no asignado' },
        { status: 404 }
      )
    }

    const payload = parsedBody.data
    const sourceVersion = payload.versionId
      ? await db.query.loadPlanVersions.findFirst({
          where: and(
            eq(loadPlanVersions.id, payload.versionId),
            eq(loadPlanVersions.loadPlanId, id)
          ),
        })
      : await db.query.loadPlanVersions.findFirst({
          where: and(
            eq(loadPlanVersions.version, Number(payload.version ?? 0)),
            eq(loadPlanVersions.loadPlanId, id)
          ),
        })

    if (!sourceVersion) {
      return NextResponse.json(
        { error: 'Version no encontrada para este plan de carga' },
        { status: 404 }
      )
    }

    const snapshot = (sourceVersion.snapshot ?? {}) as Record<string, unknown>
    const snapshotPlacedItems = Array.isArray(snapshot.placedItems)
      ? (snapshot.placedItems as SnapshotPlacedItem[])
      : []
    const snapshotInstructions = Array.isArray(snapshot.instructions)
      ? (snapshot.instructions as SnapshotInstruction[])
      : []

    if (snapshotPlacedItems.length === 0) {
      return NextResponse.json(
        { error: 'La version seleccionada no contiene placements validos' },
        { status: 400 }
      )
    }

    const itemByProductId = new Map<string, (typeof loadPlan.items)[number]>()
    for (const item of loadPlan.items) {
      if (!item.productId) continue
      itemByProductId.set(String(item.productId), item)
    }

    const instructionByInstanceId = new Map<string, SnapshotInstruction>()
    for (const instruction of snapshotInstructions) {
      const key = String(instruction.instanceId ?? '').trim()
      if (key.length > 0) {
        instructionByInstanceId.set(key, instruction)
      }
    }

    const vehicleLength = Math.max(1, Number(loadPlan.vehicle.internalLength ?? 1))
    const requestedItemsCount = loadPlan.items.reduce(
      (sum, item) => sum + Math.max(0, Number(item.quantity ?? 0)),
      0
    )

    const snapshotMetrics = (snapshot.metrics ?? {}) as Record<string, unknown>
    const nextVersion = Math.max(1, Number(loadPlan.layoutVersion ?? 1) + 1)

    await db.transaction(async (tx) => {
      await tx.delete(loadPlanPlacements).where(eq(loadPlanPlacements.loadPlanId, id))
      await tx.delete(loadingInstructions).where(eq(loadingInstructions.loadPlanId, id))

      const pieceIndexByProductId = new Map<string, number>()
      const firstPlacementByItemId = new Map<
        string,
        {
          position: { x: number; y: number; z: number }
          rotation: { x: number; y: number; z: number }
          loadingOrder: number
        }
      >()

      let insertedPlacements = 0

      for (let i = 0; i < snapshotPlacedItems.length; i++) {
        const placedItem = snapshotPlacedItems[i]
        const productId = String(
          placedItem.product?.id ?? placedItem.productId ?? ''
        ).trim()
        if (!productId) continue

        const instanceId = String(placedItem.instanceId ?? `${productId}-${i + 1}`)
        const loadItem = itemByProductId.get(productId)
        const pieceIndex = (pieceIndexByProductId.get(productId) ?? 0) + 1
        pieceIndexByProductId.set(productId, pieceIndex)

        const position = {
          x: toNum(placedItem.position?.x, 0),
          y: toNum(placedItem.position?.y, 0),
          z: toNum(placedItem.position?.z, 0),
        }
        const rotation = {
          x: toNum(placedItem.rotation?.x, 0),
          y: toNum(placedItem.rotation?.y, 0),
          z: toNum(placedItem.rotation?.z, 0),
        }

        if (loadItem?.id && !firstPlacementByItemId.has(loadItem.id)) {
          firstPlacementByItemId.set(loadItem.id, {
            position,
            rotation,
            loadingOrder: i + 1,
          })
        }

        await tx.insert(loadPlanPlacements).values({
          loadPlanId: id,
          itemId: loadItem?.id ?? null,
          productId,
          pieceIndex,
          instanceKey: instanceId,
          positionX: position.x,
          positionY: position.y,
          positionZ: position.z,
          rotationX: rotation.x,
          rotationY: rotation.y,
          rotationZ: rotation.z,
          loadingOrder: i + 1,
        })
        insertedPlacements += 1

        const linkedInstruction = instructionByInstanceId.get(instanceId)
        const routeStop = Math.max(
          1,
          Number(linkedInstruction?.routeStop ?? placedItem.routeStop ?? 1)
        )
        const loadingZone =
          linkedInstruction?.loadingZone ??
          (position.z / vehicleLength < 0.33
            ? 'front'
            : position.z / vehicleLength < 0.66
              ? 'center'
              : 'rear')
        const productInfo = placedItem.product ?? loadItem?.product
        const description =
          linkedInstruction?.description ??
          `Colocar ${String(productInfo?.name ?? 'Producto')} (parada ${routeStop}) en posicion (${position.x.toFixed(0)}, ${position.y.toFixed(0)}, ${position.z.toFixed(0)})`

        await tx.insert(loadingInstructions).values({
          loadPlanId: id,
          step: i + 1,
          description,
          itemId: loadItem?.id ?? null,
          position: {
            instanceId,
            x: position.x,
            y: position.y,
            z: position.z,
            rotation,
            routeStop,
            loadingZone,
            stackLevel: Number(placedItem.stackLevel ?? 1),
            product: {
              id: productId,
              name: String(productInfo?.name ?? 'Producto'),
              category: String(productInfo?.category ?? 'generales'),
              width: Number(productInfo?.width ?? loadItem?.product?.width ?? 0),
              height: Number(productInfo?.height ?? loadItem?.product?.height ?? 0),
              length: Number(productInfo?.length ?? loadItem?.product?.length ?? 0),
              weight: Number(productInfo?.weight ?? loadItem?.product?.weight ?? 0),
            },
          },
          orientation: 'horizontal',
        })
      }

      if (insertedPlacements === 0) {
        throw new Error('No se pudieron restaurar placements validos')
      }

      for (const item of loadPlan.items) {
        const first = firstPlacementByItemId.get(item.id)
        await tx
          .update(loadPlanItems)
          .set({
            positionX: first?.position.x ?? null,
            positionY: first?.position.y ?? null,
            positionZ: first?.position.z ?? null,
            rotationX: first?.rotation.x ?? 0,
            rotationY: first?.rotation.y ?? 0,
            rotationZ: first?.rotation.z ?? 0,
            loadingOrder: first?.loadingOrder ?? null,
          })
          .where(eq(loadPlanItems.id, item.id))
      }

      const existingAdvanced = (loadPlan.advancedMetrics ?? {}) as Record<string, unknown>
      const unplacedItems = Array.isArray(snapshotMetrics.unplacedItems)
        ? snapshotMetrics.unplacedItems
        : Array.isArray(existingAdvanced.unplacedItems)
          ? existingAdvanced.unplacedItems
          : []

      const resolvedPlacedItemsCount = Math.max(
        0,
        toNum(snapshotMetrics.placedItemsCount, insertedPlacements)
      )
      const resolvedRequestedItemsCount = Math.max(
        0,
        toNum(snapshotMetrics.requestedItemsCount, requestedItemsCount)
      )

      await tx
        .update(loadPlans)
        .set({
          status: 'optimizado',
          totalWeight: toNum(snapshotMetrics.totalWeight, Number(loadPlan.totalWeight ?? 0)),
          spaceUtilization: toNum(
            snapshotMetrics.utilization,
            Number(loadPlan.spaceUtilization ?? 0)
          ),
          weightDistribution: normalizeWeightDistribution(
            snapshotMetrics.weightDistribution ?? loadPlan.weightDistribution
          ),
          advancedMetrics: {
            axleDistribution:
              snapshotMetrics.axleDistribution ?? existingAdvanced.axleDistribution ?? null,
            centerOfGravity:
              snapshotMetrics.centerOfGravity ?? existingAdvanced.centerOfGravity ?? null,
            stability: snapshotMetrics.stability ?? existingAdvanced.stability ?? null,
            heatmap: snapshotMetrics.heatmap ?? existingAdvanced.heatmap ?? null,
            validations: Array.isArray(snapshotMetrics.validations)
              ? snapshotMetrics.validations
              : Array.isArray(existingAdvanced.validations)
                ? existingAdvanced.validations
                : [],
            kpis: snapshotMetrics.kpis ?? existingAdvanced.kpis ?? null,
            ai: snapshotMetrics.ai ?? existingAdvanced.ai ?? null,
            unplacedItems,
            requestedItemsCount: resolvedRequestedItemsCount,
            placedItemsCount: resolvedPlacedItemsCount,
          },
          optimizationScore: toNum(
            (snapshotMetrics.kpis as Record<string, unknown> | undefined)?.overallScore,
            Number(loadPlan.optimizationScore ?? 0)
          ),
          layoutVersion: nextVersion,
          updatedAt: new Date(),
        })
        .where(and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)))

      await tx.insert(loadPlanVersions).values({
        loadPlanId: id,
        version: nextVersion,
        source: 'restore',
        snapshot: {
          ...snapshot,
          restoredFrom: {
            versionId: sourceVersion.id,
            version: sourceVersion.version,
            restoredBy: auth.userId,
            restoredAt: new Date().toISOString(),
          },
        },
        createdBy: auth.userId,
      })

      await tx.insert(activityLogs).values({
        userId: auth.userId,
        companyId: auth.companyId,
        action: 'load_plan_version_restored',
        entityType: 'loadPlan',
        entityId: id,
        details: {
          fromVersionId: sourceVersion.id,
          fromVersionNumber: sourceVersion.version,
          toVersionNumber: nextVersion,
          restoredPlacements: insertedPlacements,
        },
      })
    })

    const restored = await db.query.loadPlans.findFirst({
      where: and(eq(loadPlans.id, id), eq(loadPlans.companyId, auth.companyId)),
      with: {
        vehicle: true,
        items: {
          with: {
            product: true,
          },
        },
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

    return NextResponse.json({
      success: true,
      message: `Version v${sourceVersion.version} restaurada exitosamente`,
      data: restored,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    console.error('Error restaurando version del plan de carga:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor',
      },
      { status: 500 }
    )
  }
}
