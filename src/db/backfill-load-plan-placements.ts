import 'dotenv/config'
import { db } from './index'
import { loadPlanPlacements } from './schema'

type BackfillPlan = {
  id: string
  vehicle: {
    internalWidth: number | null
    internalLength: number | null
  } | null
  items: Array<{
    id: string
    productId: string | null
    quantity: number
    positionX: number | null
    positionY: number | null
    positionZ: number | null
    rotationX: number | null
    rotationY: number | null
    rotationZ: number | null
    product: {
      width: number
      height: number
      length: number
    } | null
  }>
  instructions: Array<{
    step: number
    itemId: string | null
    position: unknown
  }>
  placements: Array<{ id: string }>
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function buildFromInstructions(plan: BackfillPlan) {
  const rows: Array<{
    loadPlanId: string
    itemId: string | null
    productId: string
    pieceIndex: number
    positionX: number
    positionY: number
    positionZ: number
    rotationX: number
    rotationY: number
    rotationZ: number
    loadingOrder: number
  }> = []

  const itemById = new Map(
    (plan.items ?? [])
      .map((item) => [String(item.id), item] as const)
  )
  const firstItemIdByProductId = new Map<string, string>()
  for (const item of plan.items ?? []) {
    if (!item.productId) continue
    const productId = String(item.productId)
    if (!firstItemIdByProductId.has(productId)) {
      firstItemIdByProductId.set(productId, String(item.id))
    }
  }

  const pieceIndexByProductId = new Map<string, number>()

  for (const instruction of plan.instructions ?? []) {
    const pos = (instruction.position ?? {}) as Record<string, unknown>
    const productFromInstruction = (pos.product ?? {}) as Record<string, unknown>

    const byItem = instruction.itemId ? itemById.get(String(instruction.itemId)) : undefined
    const productId =
      (productFromInstruction.id ? String(productFromInstruction.id) : '') ||
      (byItem?.productId ? String(byItem.productId) : '')

    if (!productId) continue

    const pieceIndex = (pieceIndexByProductId.get(productId) ?? 0) + 1
    pieceIndexByProductId.set(productId, pieceIndex)

    const rotation = (pos.rotation ?? {}) as Record<string, unknown>
    const resolvedItemId =
      instruction.itemId ? String(instruction.itemId) : firstItemIdByProductId.get(productId)

    rows.push({
      loadPlanId: String(plan.id),
      itemId: resolvedItemId ?? null,
      productId,
      pieceIndex,
      positionX: toNumber(pos.x, 0),
      positionY: toNumber(pos.y, 0),
      positionZ: toNumber(pos.z, 0),
      rotationX: toNumber(rotation.x, 0),
      rotationY: toNumber(rotation.y, 0),
      rotationZ: toNumber(rotation.z, 0),
      loadingOrder: toNumber(instruction.step, rows.length + 1),
    })
  }

  return rows
}

function buildFromItems(plan: BackfillPlan) {
  const rows: Array<{
    loadPlanId: string
    itemId: string | null
    productId: string
    pieceIndex: number
    positionX: number
    positionY: number
    positionZ: number
    rotationX: number
    rotationY: number
    rotationZ: number
    loadingOrder: number
  }> = []

  const vehicleWidth = Math.max(1, toNumber(plan.vehicle?.internalWidth, 1))
  const vehicleDepth = Math.max(1, toNumber(plan.vehicle?.internalLength, 1))
  let loadingOrder = 1

  for (const item of plan.items ?? []) {
    if (!item.product || !item.productId) continue
    const productId = String(item.productId)

    const width = Math.max(1, toNumber(item.product.width, 1))
    const height = Math.max(1, toNumber(item.product.height, 1))
    const depth = Math.max(1, toNumber(item.product.length, 1))
    const quantity = Math.max(1, toNumber(item.quantity, 1))

    const hasExplicitPosition =
      item.positionX !== null &&
      item.positionX !== undefined &&
      item.positionY !== null &&
      item.positionY !== undefined &&
      item.positionZ !== null &&
      item.positionZ !== undefined

    const maxCols = Math.max(1, Math.floor(vehicleWidth / width))
    const maxRows = Math.max(1, Math.floor(vehicleDepth / depth))
    const perLayer = Math.max(1, maxCols * maxRows)

    for (let q = 0; q < quantity; q++) {
      let x = toNumber(item.positionX, 0)
      let y = toNumber(item.positionY, 0)
      let z = toNumber(item.positionZ, 0)

      if (!hasExplicitPosition) {
        const layer = Math.floor(q / perLayer)
        const indexInLayer = q % perLayer
        const col = indexInLayer % maxCols
        const row = Math.floor(indexInLayer / maxCols)

        x = col * width
        y = layer * height
        z = row * depth
      }

      rows.push({
        loadPlanId: String(plan.id),
        itemId: String(item.id),
        productId,
        pieceIndex: q + 1,
        positionX: x,
        positionY: y,
        positionZ: z,
        rotationX: toNumber(item.rotationX, 0),
        rotationY: toNumber(item.rotationY, 0),
        rotationZ: toNumber(item.rotationZ, 0),
        loadingOrder: loadingOrder++,
      })
    }
  }

  return rows
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')

  const plans = await db.query.loadPlans.findMany({
    with: {
      vehicle: true,
      items: {
        with: {
          product: true,
        },
      },
      instructions: {
        orderBy: (instructions, { asc: ascFn }) => [ascFn(instructions.step)],
      },
      placements: true,
    },
  }) as unknown as BackfillPlan[]

  let scanned = 0
  let updated = 0
  let inserted = 0

  for (const plan of plans) {
    scanned++
    const existingCount = (plan.placements ?? []).length
    if (existingCount > 0) continue

    const rowsFromInstructions = buildFromInstructions(plan)
    const rows =
      rowsFromInstructions.length > 0
        ? rowsFromInstructions
        : buildFromItems(plan)

    if (rows.length === 0) continue

    if (!dryRun) {
      await db.transaction(async (tx) => {
        await tx.insert(loadPlanPlacements).values(rows)
      })
    }

    updated++
    inserted += rows.length
    console.log(
      `[backfill] plan ${plan.id} -> ${rows.length} placements (${rowsFromInstructions.length > 0 ? 'instructions' : 'items-fallback'})`
    )
  }

  console.log(
    `[backfill] scanned=${scanned} updated=${updated} inserted=${inserted} dryRun=${dryRun}`
  )
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[backfill] error:', error)
    process.exit(1)
  })
