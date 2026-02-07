"use client"

import React, { useEffect, useMemo, useState, useRef } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls, Grid, TransformControls } from "@react-three/drei"

export type Container3DProps = {
  width: number
  height: number
  depth: number
}

export type Cube3DData = {
  id: string
  // nombre visible (algunos módulos lo envían como productName)
  name?: string
  productName?: string
  color?: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
  rotY?: number
  // peso (algunos módulos lo envían como weight)
  weightKg?: number
  weight?: number
  product?: {
    category?: string | null
    subcategory?: string | null
  } | null
}

type Props = {
  container: Container3DProps
  cubes: Cube3DData[]

  // si ya calculas métricas afuera, pásalas; si no, se calculan aquí
  totalWeightKg?: number
  totalVolumeM3?: number
  utilizationPercent?: number

  onCubeClick?: (cube: Cube3DData) => void
  onCubesChange?: (cubes: Cube3DData[]) => void
}

const SNAP_STEP = 10
const GAP = 2 // pequeño gap para auto-ordenar cuando vienen encimados

function snap(v: number, step = SNAP_STEP) {
  return Math.round(v / step) * step
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function clampCubeInsideContainer(cube: Cube3DData, container: Container3DProps) {
  // 🔁 Convención interna usada por el backend/algoritmo:
  // - cube.x = avance (largo del contenedor)
  // - cube.z = lateral (ancho del contenedor)
  // En Three.js: X=lateral, Z=avance (por eso luego se mapean invertidos en cubeToCenteredPos).
  const minX = 0 // avance
  const minY = 0
  const minZ = 0 // lateral
  const maxX = container.depth - cube.depth
  const maxY = container.height - cube.height
  const maxZ = container.width - cube.width

  return {
    ...cube,
    x: clamp(cube.x, minX, Math.max(minX, maxX)),
    y: clamp(cube.y, minY, Math.max(minY, maxY)),
    z: clamp(cube.z, minZ, Math.max(minZ, maxZ)),
  }
}

/**
 * Normaliza posiciones que a veces llegan como "centro" en vez de "corner".
 * - Corner esperado: x,y,z = esquina inferior izquierda frontal (cm dentro del contenedor)
 * - Centro: x,y,z = centro del cubo dentro del contenedor
 *
 * Esta función detecta y convierte sin romper cuando ya vienen bien.
 */
function normalizeCubeXYZ(cube: Cube3DData, container: Container3DProps) {
  // OJO: por convención, X se valida contra DEPTH (largo) y Z contra WIDTH (ancho)
  const W = container.width
  const H = container.height
  const D = container.depth

  const w = cube.width
  const h = cube.height
  const d = cube.depth

  const isCornerValid =
    cube.x >= 0 &&
    cube.y >= 0 &&
    cube.z >= 0 &&
    cube.x <= D - d &&
    cube.y <= H - h &&
    cube.z <= W - w

  if (isCornerValid) return cube

  // intentar tratar como centro -> convertir a corner
  const asCorner = {
    ...cube,
    x: cube.x - d / 2,
    y: cube.y - h / 2,
    z: cube.z - w / 2,
  }

  const cornerReasonable =
    asCorner.x >= -d &&
    asCorner.z >= -w &&
    asCorner.x <= D &&
    asCorner.z <= W

  if (cornerReasonable) {
    return clampCubeInsideContainer(
      {
        ...cube,
        x: asCorner.x,
        y: asCorner.y,
        z: asCorner.z,
      },
      container
    )
  }

  // último recurso: clamp directo
  return clampCubeInsideContainer(cube, container)
}

function cubeToCenteredPos(cube: Cube3DData, container: Container3DProps): [number, number, number] {
  // Datos: cube.x=avance(largo), cube.z=lateral(ancho)
  // Three: X=lateral(ancho), Z=avance(largo)
  return [
    cube.z - container.width / 2 + cube.width / 2,
    cube.y + cube.height / 2,
    cube.x - container.depth / 2 + cube.depth / 2,
  ]
}

function centeredPosToCubeXYZ(
  pos: THREE.Vector3,
  cube: Cube3DData,
  container: Container3DProps
): { x: number; y: number; z: number } {
  return {
    x: pos.z + container.depth / 2 - cube.depth / 2,
    y: pos.y - cube.height / 2,
    z: pos.x + container.width / 2 - cube.width / 2,
  }
}

function aabbCentered(cube: Cube3DData, container: Container3DProps) {
  const [cx, cy, cz] = cubeToCenteredPos(cube, container)
  return new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(cx, cy, cz),
    new THREE.Vector3(cube.width, cube.height, cube.depth)
  )
}

function findStackY(candidate: Cube3DData, others: Cube3DData[], container: Container3DProps) {
  const candBox = aabbCentered(candidate, container)
  const candMin = candBox.min
  const candMax = candBox.max

  let bestTopY = 0
  for (const o of others) {
    if (o.id === candidate.id) continue
    const ob = aabbCentered(o, container)

    const overlapX = !(candMax.x <= ob.min.x || candMin.x >= ob.max.x)
    const overlapZ = !(candMax.z <= ob.min.z || candMin.z >= ob.max.z)
    if (!overlapX || !overlapZ) continue

    const topY = o.y + o.height
    if (topY <= candidate.y + candidate.height + 1e-6) {
      bestTopY = Math.max(bestTopY, topY)
    }
  }
  return bestTopY
}

/**
 * Evita que lleguen encimados:
 * recorre en orden y si colisiona, lo “empuja” en X; si se sale, salta a Z.
 * Mantiene dentro del contenedor.
 */
function autoResolveOverlaps(input: Cube3DData[], container: Container3DProps) {
  const placed: Cube3DData[] = []
  const maxIters = 4000

  const intersectsAny = (c: Cube3DData) => {
    const bb = aabbCentered(c, container)
    for (const p of placed) {
      if (bb.intersectsBox(aabbCentered(p, container))) return true
    }
    return false
  }

  for (const raw of input) {
    let c = clampCubeInsideContainer(raw, container)
    c.x = snap(c.x)
    c.y = snap(c.y)
    c.z = snap(c.z)

    let it = 0
    while (intersectsAny(c) && it < maxIters) {
      // Empuja primero en lateral (Z datos) y después avanza (X datos)
      c = { ...c, z: c.z + c.width + GAP }
      if (c.z > container.width - c.width) {
        c = { ...c, z: 0, x: c.x + c.depth + GAP }
      }
      if (c.x > container.depth - c.depth) {
        // si ya no hay espacio, lo regresamos al origen clamped (mejor que “volarlo”)
        c = { ...c, x: 0, z: 0 }
        break
      }
      c = clampCubeInsideContainer(c, container)
      it++
    }

    placed.push(c)
  }

  return placed
}

function ClampPan({
  controlsRef,
  container,
}: {
  controlsRef: React.RefObject<any>
  container: Container3DProps
}) {
  const limits = useMemo(() => {
    const padX = container.width * 0.9
    const padY = container.height * 0.9
    const padZ = container.depth * 0.9
    return new THREE.Box3(
      new THREE.Vector3(-container.width / 2 - padX, -padY, -container.depth / 2 - padZ),
      new THREE.Vector3(container.width / 2 + padX, container.height + padY, container.depth / 2 + padZ)
    )
  }, [container.width, container.height, container.depth])

  useFrame(() => {
    const c = controlsRef.current
    if (!c) return
    const t = c.target as THREE.Vector3
    t.x = THREE.MathUtils.clamp(t.x, limits.min.x, limits.max.x)
    t.y = THREE.MathUtils.clamp(t.y, limits.min.y, limits.max.y)
    t.z = THREE.MathUtils.clamp(t.z, limits.min.z, limits.max.z)
    c.update()
  })

  return null
}

function Container({ width, height, depth }: Container3DProps) {
  const cy = height / 2

  return (
    <group>
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[width, 1, depth]} />
        <meshStandardMaterial color="#374151" transparent opacity={0.9} />
      </mesh>

      <lineSegments position={[0, cy, 0]} renderOrder={10}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color="#6B7280" depthTest={false} />
      </lineSegments>
    </group>
  )
}

function ReferenceGrid({ width, depth }: { width: number; depth: number }) {
  return (
    <Grid
      position={[0, 0, 0]}
      args={[width, depth]}
      cellSize={Math.max(10, Math.min(width, depth) / 20)}
      cellThickness={0.5}
      cellColor="#6B7280"
      sectionSize={Math.max(50, Math.min(width, depth) / 5)}
      sectionThickness={1}
      sectionColor="#374151"
      fadeDistance={Math.max(width, depth) * 1.2}
      infiniteGrid={false}
    />
  )
}

function ProductCube({
  cube,
  container,
  onClick,
  isSelected,
  editable,
  onUpdate,
  allCubes,
  onTransformingChange,
}: {
  cube: Cube3DData
  container: Container3DProps
  onClick?: (cube: Cube3DData) => void
  isSelected?: boolean
  editable?: boolean
  onUpdate?: (next: Cube3DData) => void
  allCubes: Cube3DData[]
  onTransformingChange?: (v: boolean) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera, gl } = useThree()

  const position = useMemo(() => cubeToCenteredPos(cube, container), [cube, container])
  const rotation: [number, number, number] = [0, cube.rotY ?? 0, 0]

  const baseColor = cube.color ?? "#3B82F6"
  const color = isSelected ? "#60A5FA" : baseColor

  const collides = (candidate: Cube3DData) => {
    const bb = aabbCentered(candidate, container)
    for (const other of allCubes) {
      if (other.id === candidate.id) continue
      if (bb.intersectsBox(aabbCentered(other, container))) return true
    }
    return false
  }

  const handleObjectChange = () => {
    const m = meshRef.current
    if (!m) return

    const raw = centeredPosToCubeXYZ(m.position, cube, container)

    let next: Cube3DData = {
      ...cube,
      x: snap(raw.x),
      y: snap(raw.y),
      z: snap(raw.z),
    }

    // “Pegado” a piso/stack simple
    const baseY = findStackY(next, allCubes, container)
    next.y = snap(baseY)

    next = clampCubeInsideContainer(next, container)

    if (collides(next)) {
      const [px, py, pz] = cubeToCenteredPos(cube, container)
      m.position.set(px, py, pz)
      m.rotation.set(0, cube.rotY ?? 0, 0)
      return
    }

    onUpdate?.(next)
  }

  const MeshEl = (
    <mesh
      ref={meshRef}
      position={position as any}
      rotation={rotation as any}
      castShadow
      onPointerDown={(e) => {
        e.stopPropagation()
        onClick?.(cube)
      }}
    >
      <boxGeometry args={[cube.width, cube.height, cube.depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )

  // ✅ CLAVE: envolver el mesh con TransformControls hace que el gizmo SIEMPRE esté en el producto (no en el centro)
  if (editable && isSelected) {
    return (
      <TransformControls
        camera={camera}
        domElement={gl.domElement}
        mode="translate"
        showX
        showY
        showZ
        translationSnap={SNAP_STEP}
        onObjectChange={handleObjectChange}
        onDraggingChanged={(dragging) => onTransformingChange?.(!!dragging)}
      >
        {MeshEl}
      </TransformControls>
    )
  }

  return MeshEl
}

export default function LoadVisualizer3D({
  container,
  cubes,
  totalWeightKg,
  totalVolumeM3,
  utilizationPercent,
  onCubeClick,
  onCubesChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const controlsRef = useRef<any>(null)

  const [items, setItems] = useState<Cube3DData[]>([])
  const [editMode, setEditMode] = useState(false)
  const [isTransforming, setIsTransforming] = useState(false)

  // 🔒 Evita que se quede "pegado" si el mouseUp no llega
  useEffect(() => {
    const release = () => setIsTransforming(false)
    window.addEventListener("pointerup", release)
    window.addEventListener("mouseup", release)
    window.addEventListener("touchend", release)
    return () => {
      window.removeEventListener("pointerup", release)
      window.removeEventListener("mouseup", release)
      window.removeEventListener("touchend", release)
    }
  }, [])

  // Si sales de modo edición, libera el estado y vuelve OrbitControls
  useEffect(() => {
    if (!editMode) setIsTransforming(false)
  }, [editMode])

  // Si entras a modo edición sin selección, selecciona el primer cubo.
  // Esto evita el caso en que el gizmo quede en el origen por no tener nada seleccionado.
  useEffect(() => {
    if (editMode && !selectedId && items.length > 0) {
      setSelectedId(items[0].id)
    }
  }, [editMode, selectedId, items])

  // Normaliza + clamp + evita overlaps al cargar
  useEffect(() => {
    const normalized = (cubes ?? []).map((c) =>
      clampCubeInsideContainer(normalizeCubeXYZ(c, container), container)
    )
    const resolved = autoResolveOverlaps(normalized, container)
    setItems(resolved)
  }, [cubes, container.width, container.height, container.depth])

  const selectedCube = useMemo(
    () => items.find((c) => c.id === selectedId) ?? null,
    [items, selectedId]
  )

  const selectedName = useMemo(() => {
    if (!selectedCube) return ""
    return (selectedCube.name ?? selectedCube.productName ?? "Producto").trim()
  }, [selectedCube])

  const selectedWeightKg = useMemo(() => {
    if (!selectedCube) return 0
    const v = selectedCube.weightKg ?? selectedCube.weight ?? 0
    return Number.isFinite(Number(v)) ? Number(v) : 0
  }, [selectedCube])

  const computed = useMemo(() => {
    const weight = items.reduce((acc, c) => acc + (Number(c.weightKg ?? c.weight ?? 0) || 0), 0)
    const volume = items.reduce((acc, c) => acc + (c.width * c.height * c.depth), 0)
    const containerVol = container.width * container.height * container.depth
    const util = containerVol > 0 ? (volume / containerVol) * 100 : 0
    return {
      weightKg: weight,
      volumeM3: volume / 1_000_000,
      utilPercent: util,
    }
  }, [items, container.width, container.height, container.depth])

  const W = totalWeightKg ?? computed.weightKg
  const V = totalVolumeM3 ?? computed.volumeM3
  const U = utilizationPercent ?? computed.utilPercent

  const cam = useMemo(() => {
    const m = Math.max(container.width, container.height, container.depth)
    return {
      position: [m * 0.9, m * 0.65, m * 0.9] as [number, number, number],
      fov: 50,
      near: Math.max(0.1, m / 1000),
      far: m * 50,
    }
  }, [container.width, container.height, container.depth])

  const resetView = () => {
    const m = Math.max(container.width, container.height, container.depth)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, container.height / 2, 0)
      controlsRef.current.object.position.set(m * 0.9, m * 0.65, m * 0.9)
      controlsRef.current.update()
    }
  }

  const rotateSelected90 = () => {
    if (!selectedId) return
    setItems((prev) => {
      const next = prev.map((c) => {
        if (c.id !== selectedId) return c
        const rot = (c.rotY ?? 0) + Math.PI / 2
        const rotated: Cube3DData = {
          ...c,
          rotY: rot % (Math.PI * 2),
          width: c.depth,
          depth: c.width,
        }
        return clampCubeInsideContainer(rotated, container)
      })
      onCubesChange?.(next)
      return next
    })
  }

  const updateCube = (nextCube: Cube3DData) => {
    const safe = clampCubeInsideContainer(nextCube, container)
    setItems((prev) => {
      const next = prev.map((c) => (c.id === safe.id ? safe : c))
      onCubesChange?.(next)
      return next
    })
  }

  return (
    <div className="w-full">
      {/* OVERLAY 3D */}
      <div className="w-full h-[420px] overflow-hidden rounded-lg border bg-gray-100">
        <Canvas
          shadows
          camera={cam}
          style={{ background: "#F3F4F6" }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[200, 400, 200]}
            intensity={1.0}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />

          {/* ✅ Orbit:
              - fuera de edición: SIEMPRE activo
              - en edición: bloqueado (para que no se mueva la unidad mientras ajustas cajas)
              - si estás arrastrando gizmo: también bloqueado */}
          <OrbitControls
            ref={controlsRef}
            target={[0, container.height / 2, 0]}
            enabled={!editMode && !isTransforming}
            enableDamping
            dampingFactor={0.08}
            minDistance={Math.max(container.width, container.depth) * 0.35}
            maxDistance={Math.max(container.width, container.depth) * 6}
            makeDefault
          />

          <ClampPan controlsRef={controlsRef} container={container} />

          <ReferenceGrid width={container.width} depth={container.depth} />
          <Container {...container} />

          {items.map((cube) => (
            <ProductCube
              key={cube.id}
              cube={cube}
              container={container}
              allCubes={items}
              editable={editMode}
              onUpdate={updateCube}
              onTransformingChange={setIsTransforming}
              isSelected={selectedId === cube.id}
              onClick={(c) => {
                setSelectedId(c.id)
                onCubeClick?.(c)
              }}
            />
          ))}
        </Canvas>
      </div>

      {/* CONTROLES + DETALLES */}
      <div className="mt-3 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-500">Peso Total:</span>{" "}
              <span className="font-semibold">{(W / 1000).toFixed(2)} ton</span>
            </div>
            <div>
              <span className="text-gray-500">Volumen:</span>{" "}
              <span className="font-semibold">{V.toFixed(2)} m³</span>
            </div>
            <div>
              <span className="text-gray-500">Utilización:</span>{" "}
              <span className="font-semibold">{U.toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-gray-500">Productos:</span>{" "}
              <span className="font-semibold">{items.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`rounded-md border px-3 py-2 text-sm hover:bg-gray-50 ${
                editMode ? "bg-gray-50" : ""
              }`}
            >
              {editMode ? "Modo edición: ON" : "Modo edición: OFF"}
            </button>

            <button
              type="button"
              onClick={rotateSelected90}
              disabled={!selectedId}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              title="Rotar 90° (Y)"
            >
              Rotar 90°
            </button>

            <button
              type="button"
              onClick={resetView}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
            >
              Centrar
            </button>
          </div>
        </div>

        {/* Detalle de selección */}
        <div className="mt-4">
          {!selectedCube ? (
            <div className="text-sm text-gray-500">
              Selecciona una caja en el visor para ver sus detalles.
            </div>
          ) : (
            <div className="rounded-md border p-4">
              <div className="text-lg font-semibold">{selectedName || "Producto"}</div>

              <div className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-5">
                <div>
                  <div className="text-gray-500">Producto</div>
                  <div className="font-semibold">{selectedName || "Producto"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Peso</div>
                  <div className="font-semibold">{selectedWeightKg} kg</div>
                </div>
                <div>
                  <div className="text-gray-500">Dimensiones</div>
                  <div className="font-semibold">
                    {selectedCube.width}×{selectedCube.depth}×{selectedCube.height}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Posición</div>
                  <div className="font-semibold">
                    ({selectedCube.x}, {selectedCube.y}, {selectedCube.z})
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Categoría</div>
                  <div className="font-semibold">
                    {selectedCube.product?.category ?? "—"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
