import assert from 'node:assert/strict'
import test from 'node:test'
import { optimizeLoad } from './optimization'
import type { FragilityLevel, Product, Vehicle } from '@/types'

type Placed = Awaited<ReturnType<typeof optimizeLoad>>['placedItems'][number]

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  const internalLength = overrides.internalLength ?? 1200
  const internalWidth = overrides.internalWidth ?? 240
  const internalHeight = overrides.internalHeight ?? 260

  return {
    id: overrides.id ?? 'veh-1',
    name: overrides.name ?? 'Trailer 53',
    type: overrides.type ?? 'remolque',
    plateNumber: overrides.plateNumber ?? 'ABC123',
    internalLength,
    internalWidth,
    internalHeight,
    maxWeight: overrides.maxWeight ?? 24_000,
    maxVolume:
      overrides.maxVolume ??
      (internalLength * internalWidth * internalHeight) / 1_000_000,
    hasRefrigeration: overrides.hasRefrigeration ?? false,
    minTemperature: overrides.minTemperature ?? undefined,
    maxTemperature: overrides.maxTemperature ?? undefined,
    axles: overrides.axles ?? 3,
    frontAxleMaxWeight: overrides.frontAxleMaxWeight ?? 8_000,
    rearAxleMaxWeight: overrides.rearAxleMaxWeight ?? 16_000,
    nom012Compliant: overrides.nom012Compliant ?? true,
    hazardousMaterialAuthorized: overrides.hazardousMaterialAuthorized ?? false,
    companyId: overrides.companyId ?? 'comp-1',
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  }
}

function makeProduct(
  id: string,
  overrides: Partial<Product> = {}
): Product {
  const length = overrides.length ?? 100
  const width = overrides.width ?? 100
  const height = overrides.height ?? 100

  return {
    id,
    name: overrides.name ?? `Producto ${id}`,
    description: overrides.description ?? 'Test product',
    category: overrides.category ?? 'generales',
    subcategory: overrides.subcategory ?? 'General',
    hsCode: overrides.hsCode ?? undefined,
    length,
    width,
    height,
    weight: overrides.weight ?? 100,
    volume:
      overrides.volume ?? (length * width * height) / 1_000_000,
    fragility: overrides.fragility ?? 'media',
    stackable: overrides.stackable ?? true,
    maxStackHeight: overrides.maxStackHeight ?? 4,
    temperatureReq: overrides.temperatureReq ?? 'ambiente',
    temperatureMin: overrides.temperatureMin ?? undefined,
    temperatureMax: overrides.temperatureMax ?? undefined,
    humiditySensitive: overrides.humiditySensitive ?? false,
    isHazardous: overrides.isHazardous ?? false,
    hazardClass: overrides.hazardClass ?? undefined,
    unNumber: overrides.unNumber ?? undefined,
    incompatibleWith: overrides.incompatibleWith ?? [],
    specialInstructions: overrides.specialInstructions ?? undefined,
    companyId: overrides.companyId ?? 'comp-1',
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  }
}

function footprint(placed: Placed) {
  const rot = Number(placed.rotation?.y ?? 0)
  const quarterTurn = Math.round(((rot % 360) + 360) % 360 / 90) % 4
  const lateral = quarterTurn === 1 || quarterTurn === 3
    ? Number(placed.product.length)
    : Number(placed.product.width)
  const depth = quarterTurn === 1 || quarterTurn === 3
    ? Number(placed.product.width)
    : Number(placed.product.length)
  return {
    w: lateral,
    h: Number(placed.product.height),
    d: depth,
  }
}

function intersects3D(a: Placed, b: Placed): boolean {
  const da = footprint(a)
  const db = footprint(b)

  const ax1 = a.position.x
  const ax2 = a.position.x + da.w
  const ay1 = a.position.y
  const ay2 = a.position.y + da.h
  const az1 = a.position.z
  const az2 = a.position.z + da.d

  const bx1 = b.position.x
  const bx2 = b.position.x + db.w
  const by1 = b.position.y
  const by2 = b.position.y + db.h
  const bz1 = b.position.z
  const bz2 = b.position.z + db.d

  const overlapX = ax1 < bx2 && ax2 > bx1
  const overlapY = ay1 < by2 && ay2 > by1
  const overlapZ = az1 < bz2 && az2 > bz1

  return overlapX && overlapY && overlapZ
}

function assertNoOverlaps(placedItems: Placed[]) {
  for (let i = 0; i < placedItems.length; i++) {
    for (let j = i + 1; j < placedItems.length; j++) {
      assert.equal(
        intersects3D(placedItems[i], placedItems[j]),
        false,
        `Found overlap between items ${i} and ${j}`
      )
    }
  }
}

function almostEqual(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps
}

function overlapsXZ(a: Placed, b: Placed): boolean {
  const da = footprint(a)
  const db = footprint(b)

  const ax1 = a.position.x
  const ax2 = a.position.x + da.w
  const az1 = a.position.z
  const az2 = a.position.z + da.d

  const bx1 = b.position.x
  const bx2 = b.position.x + db.w
  const bz1 = b.position.z
  const bz2 = b.position.z + db.d

  const overlapX = ax1 < bx2 - 0.01 && ax2 > bx1 + 0.01
  const overlapZ = az1 < bz2 - 0.01 && az2 > bz1 + 0.01

  return overlapX && overlapZ
}

function assertNoFloatingGaps(placedItems: Placed[]) {
  for (let i = 0; i < placedItems.length; i++) {
    const item = placedItems[i]
    if (item.position.y <= 0.01) continue

    const supports = placedItems.filter((other, j) => {
      if (i === j) return false
      if (!overlapsXZ(item, other)) return false
      const top = other.position.y + footprint(other).h
      return almostEqual(top, item.position.y, 0.51)
    })

    assert.equal(
      supports.length > 0,
      true,
      `Floating gap detected for item ${i} at y=${item.position.y}`
    )
  }
}

function fragilityRank(level: FragilityLevel) {
  switch (level) {
    case 'baja':
      return 0
    case 'media':
      return 1
    case 'alta':
      return 2
    case 'muy_alta':
      return 3
    default:
      return 1
  }
}

test('optimiza cantidades mayores a 24 cuando el contenedor lo permite', async () => {
  const vehicle = makeVehicle({
    internalLength: 1400,
    internalWidth: 250,
    internalHeight: 270,
    maxWeight: 50_000,
  })
  const product = makeProduct('p-many', {
    length: 100,
    width: 70,
    height: 60,
    weight: 70,
    stackable: true,
    maxStackHeight: 4,
  })

  const requested = 30
  const result = await optimizeLoad([{ product, quantity: requested }], vehicle)

  assert.equal(result.placedItems.length, requested)
  assertNoOverlaps(result.placedItems)
})

test('genera capas verticales limpias cuando solo cabe una huella por piso', async () => {
  const vehicle = makeVehicle({
    internalLength: 100,
    internalWidth: 100,
    internalHeight: 300,
    maxWeight: 20_000,
  })
  const product = makeProduct('p-layer', {
    length: 100,
    width: 100,
    height: 100,
    weight: 100,
    stackable: true,
    maxStackHeight: 3,
  })

  const result = await optimizeLoad([{ product, quantity: 3 }], vehicle)
  assert.equal(result.placedItems.length, 3)

  const positions = result.placedItems
    .map((x) => x.position)
    .sort((a, b) => a.y - b.y)

  assert.deepEqual(
    positions.map((p) => p.y),
    [0, 100, 200]
  )
  assert.deepEqual(
    positions.map((p) => [p.x, p.z]),
    [[0, 0], [0, 0], [0, 0]]
  )
  assertNoOverlaps(result.placedItems)
  assertNoFloatingGaps(result.placedItems)
})

test('respeta maxStackHeight y no coloca niveles extra', async () => {
  const vehicle = makeVehicle({
    internalLength: 100,
    internalWidth: 100,
    internalHeight: 300,
    maxWeight: 20_000,
  })
  const product = makeProduct('p-max-stack', {
    length: 100,
    width: 100,
    height: 100,
    weight: 100,
    stackable: true,
    maxStackHeight: 2,
  })

  const result = await optimizeLoad([{ product, quantity: 3 }], vehicle)

  assert.equal(result.placedItems.length, 2)
  const yValues = result.placedItems.map((x) => x.position.y).sort((a, b) => a - b)
  assert.deepEqual(yValues, [0, 100])
  assertNoFloatingGaps(result.placedItems)
})

test('si hay apilado, la fragilidad de arriba nunca es menor que la base', async () => {
  const vehicle = makeVehicle({
    internalLength: 100,
    internalWidth: 100,
    internalHeight: 220,
    maxWeight: 20_000,
  })
  const hard = makeProduct('p-hard', {
    fragility: 'baja',
    length: 100,
    width: 100,
    height: 100,
    weight: 120,
    stackable: true,
    maxStackHeight: 3,
  })
  const fragile = makeProduct('p-fragile', {
    fragility: 'muy_alta',
    length: 100,
    width: 100,
    height: 100,
    weight: 80,
    stackable: true,
    maxStackHeight: 3,
  })

  const result = await optimizeLoad(
    [
      { product: hard, quantity: 1 },
      { product: fragile, quantity: 1 },
    ],
    vehicle
  )

  assert.equal(result.placedItems.length, 2)

  const orderedByHeight = result.placedItems
    .slice()
    .sort((a, b) => a.position.y - b.position.y)

  const base = orderedByHeight[0]
  const top = orderedByHeight[1]
  assert.equal(top.position.y > base.position.y, true)
  assert.equal(
    fragilityRank(top.product.fragility),
    Math.max(
      fragilityRank(base.product.fragility),
      fragilityRank(top.product.fragility)
    )
  )
  assertNoOverlaps(result.placedItems)
})

test('intelligent usa 6 escenarios para carga ligera', async () => {
  const vehicle = makeVehicle({
    internalLength: 1200,
    internalWidth: 240,
    internalHeight: 260,
    maxWeight: 24_000,
  })
  const light = makeProduct('p-light', {
    length: 100,
    width: 80,
    height: 60,
    weight: 90,
  })

  const result = await optimizeLoad(
    [{ product: light, quantity: 10 }],
    vehicle,
    { strategy: 'intelligent', seed: 1234 }
  )

  assert.equal(result.ai?.strategy, 'intelligent')
  assert.equal(result.ai?.candidatesEvaluated, 6)
})

test('intelligent usa 4 escenarios para optimizacion grande', async () => {
  const vehicle = makeVehicle({
    internalLength: 1200,
    internalWidth: 240,
    internalHeight: 260,
    maxWeight: 24_000,
  })
  const heavy = makeProduct('p-heavy', {
    length: 120,
    width: 100,
    height: 100,
    weight: 850,
  })

  const result = await optimizeLoad(
    [{ product: heavy, quantity: 14 }],
    vehicle,
    { strategy: 'intelligent', seed: 5678 }
  )

  assert.equal(result.ai?.strategy, 'intelligent')
  assert.equal(result.ai?.candidatesEvaluated, 4)
})

test('intelligent evita sobrecargar eje frontal cuando todo va en parada unica', async () => {
  const vehicle = makeVehicle({
    internalLength: 1360,
    internalWidth: 245,
    internalHeight: 260,
    maxWeight: 32_000,
    frontAxleMaxWeight: 7_000,
    rearAxleMaxWeight: 17_000,
    axles: 3,
  })
  const heavy = makeProduct('p-axle-safe', {
    length: 120,
    width: 100,
    height: 120,
    weight: 650,
    stackable: true,
    maxStackHeight: 2,
  })

  const result = await optimizeLoad(
    [{ product: heavy, quantity: 12, routeStop: 1 }],
    vehicle,
    { strategy: 'intelligent', seed: 9012 }
  )

  assert.equal(result.axleDistribution.frontOverKg <= 0.1, true)
  assert.equal(
    result.validations.some((issue) => issue.code === 'AXLE_OVERLOAD'),
    false
  )
})

test('baseline asienta alturas no multiples de resolucion sin crear gap', async () => {
  const vehicle = makeVehicle({
    internalLength: 120,
    internalWidth: 120,
    internalHeight: 200,
    maxWeight: 30_000,
  })
  const product = makeProduct('p-non-grid', {
    length: 120,
    width: 120,
    height: 37,
    weight: 80,
    stackable: true,
    maxStackHeight: 4,
  })

  const result = await optimizeLoad([{ product, quantity: 3 }], vehicle, { strategy: 'baseline' })
  assert.equal(result.placedItems.length, 3)
  assertNoOverlaps(result.placedItems)
  assertNoFloatingGaps(result.placedItems)
})

test('intelligent tambien evita gaps en apilado con alturas no multiples', async () => {
  const vehicle = makeVehicle({
    internalLength: 120,
    internalWidth: 120,
    internalHeight: 200,
    maxWeight: 30_000,
  })
  const product = makeProduct('p-non-grid-ai', {
    length: 120,
    width: 120,
    height: 37,
    weight: 80,
    stackable: true,
    maxStackHeight: 4,
  })

  const result = await optimizeLoad(
    [{ product, quantity: 3 }],
    vehicle,
    { strategy: 'intelligent', seed: 2026 }
  )
  assert.equal(result.placedItems.length, 3)
  assertNoOverlaps(result.placedItems)
  assertNoFloatingGaps(result.placedItems)
})
