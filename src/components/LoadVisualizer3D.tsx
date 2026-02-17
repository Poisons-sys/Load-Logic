"use client";

import React, { Fragment, useEffect, useMemo, useState, useRef, useCallback } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, TransformControls } from "@react-three/drei";
import trailerWallImg from "../assets/trailer-wall.png";
import trailerDoorsImg from "../assets/trailer-doors.png";

export type Container3DProps = {
  width: number;
  height: number;
  depth: number;
};

export type Cube3DData = {
  id: string;
  name?: string;
  productName?: string;
  color?: string;
  x: number; // avance (largo del contenedor)
  y: number;
  z: number; // lateral (ancho del contenedor)
  width: number; // ancho físico del producto (lateral)
  height: number;
  depth: number; // largo físico del producto (avance)
  rotY?: number; // rotación REAL en Y (radianes)
  weightKg?: number;
  weight?: number;
  product?: {
    id?: string;
    name?: string;
    category?: string | null;
    subcategory?: string | null;
    weight?: number | null;
    width?: number | null;
    height?: number | null;
    length?: number | null;
  } | null;
};

type Props = {
  container: Container3DProps;
  cubes: Cube3DData[];
  totalWeightKg?: number;
  totalVolumeM3?: number;
  utilizationPercent?: number;
  onCubeClick?: (cube: Cube3DData) => void;
  onCubesChange?: (cubes: Cube3DData[]) => void;
};

type CubeUpdateMode = "preview" | "commit";

const SNAP_STEP = 1;
const GAP = 2;

function snap(v: number, step = SNAP_STEP) {
  return Math.round(v / step) * step;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** ===========================
 *  Rotación real + huella efectiva (EasyCargo style)
 *  =========================== */
function normRotY(rotY?: number) {
  const r = rotY ?? 0;
  const twoPi = Math.PI * 2;
  return ((r % twoPi) + twoPi) % twoPi;
}

function rotQuarterTurns(rotY?: number) {
  const r = normRotY(rotY);
  return Math.round(r / (Math.PI / 2)) % 4; // 0,1,2,3
}

// Huella efectiva en el piso (w=lateral, d=avance) según rotY
function effectiveFootprint(cube: Cube3DData) {
  const q = rotQuarterTurns(cube.rotY);
  if (q === 1 || q === 3) return { w: cube.depth, d: cube.width }; // 90/270
  return { w: cube.width, d: cube.depth }; // 0/180
}

function clampCubeInsideContainer(cube: Cube3DData, container: Container3DProps) {
  const minX = 0;
  const minY = 0;
  const minZ = 0;

  const fp = effectiveFootprint(cube);

  const maxX = container.depth - fp.d;
  const maxY = container.height - cube.height;
  const maxZ = container.width - fp.w;

  return {
    ...cube,
    x: clamp(cube.x, minX, Math.max(minX, maxX)),
    y: clamp(cube.y, minY, Math.max(minY, maxY)),
    z: clamp(cube.z, minZ, Math.max(minZ, maxZ)),
  };
}

function normalizeCubeXYZ(cube: Cube3DData, container: Container3DProps) {
  const W = container.width;
  const H = container.height;
  const D = container.depth;

  const fp = effectiveFootprint(cube);
  const w = fp.w;
  const h = cube.height;
  const d = fp.d;

  const isCornerValid =
    cube.x >= 0 &&
    cube.y >= 0 &&
    cube.z >= 0 &&
    cube.x <= D - d &&
    cube.y <= H - h &&
    cube.z <= W - w;

  if (isCornerValid) return cube;

  // tratar como centro (pero con huella efectiva)
  const asCorner = {
    ...cube,
    x: cube.x - d / 2,
    y: cube.y - h / 2,
    z: cube.z - w / 2,
  };

  const cornerReasonable =
    asCorner.x >= -d &&
    asCorner.z >= -w &&
    asCorner.x <= D &&
    asCorner.z <= W;

  if (cornerReasonable) {
    return clampCubeInsideContainer(
      { ...cube, x: asCorner.x, y: asCorner.y, z: asCorner.z },
      container
    );
  }

  return clampCubeInsideContainer(cube, container);
}

// Convención interna:
// cube.x = avance (largo contenedor) -> Three Z
// cube.z = lateral (ancho contenedor) -> Three X
function cubeToCenteredPos(cube: Cube3DData, container: Container3DProps): [number, number, number] {
  const fp = effectiveFootprint(cube);
  return [
    cube.z - container.width / 2 + fp.w / 2,  // Three X (lateral)
    cube.y + cube.height / 2,                 // Three Y
    cube.x - container.depth / 2 + fp.d / 2,  // Three Z (avance)
  ];
}

function centeredPosToCubeXYZ(
  pos: THREE.Vector3,
  cube: Cube3DData,
  container: Container3DProps
): { x: number; y: number; z: number } {
  const fp = effectiveFootprint(cube);
  return {
    x: pos.z + container.depth / 2 - fp.d / 2,
    y: pos.y - cube.height / 2,
    z: pos.x + container.width / 2 - fp.w / 2,
  };
}

function aabbCentered(cube: Cube3DData, container: Container3DProps) {
  const [cx, cy, cz] = cubeToCenteredPos(cube, container);
  const fp = effectiveFootprint(cube);
  return new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(cx, cy, cz),
    new THREE.Vector3(fp.w, cube.height, fp.d)
  );
}

function boxesOverlap(a: THREE.Box3, b: THREE.Box3, eps = 0.001) {
  const overlapX = a.min.x < b.max.x - eps && a.max.x > b.min.x + eps;
  const overlapY = a.min.y < b.max.y - eps && a.max.y > b.min.y + eps;
  const overlapZ = a.min.z < b.max.z - eps && a.max.z > b.min.z + eps;
  return overlapX && overlapY && overlapZ;
}

function findStackY(candidate: Cube3DData, others: Cube3DData[], container: Container3DProps) {
  const candBox = aabbCentered(candidate, container);
  const candMin = candBox.min;
  const candMax = candBox.max;

  let bestTopY = 0;
  for (const o of others) {
    if (o.id === candidate.id) continue;
    const ob = aabbCentered(o, container);

    const overlapX = !(candMax.x <= ob.min.x || candMin.x >= ob.max.x);
    const overlapZ = !(candMax.z <= ob.min.z || candMin.z >= ob.max.z);
    if (!overlapX || !overlapZ) continue;

    const topY = o.y + o.height;
    bestTopY = Math.max(bestTopY, topY);
  }
  return clamp(bestTopY, 0, Math.max(0, container.height - candidate.height));
}

function autoResolveOverlaps(input: Cube3DData[], container: Container3DProps) {
  const placed: Cube3DData[] = [];
  const maxIters = 4000;

  const intersectsAny = (c: Cube3DData) => {
    const bb = aabbCentered(c, container);
    for (const p of placed) {
      if (boxesOverlap(bb, aabbCentered(p, container))) return true;
    }
    return false;
  };

  for (const raw of input) {
    let c = clampCubeInsideContainer(raw, container);
    c = { ...c, x: snap(c.x), y: snap(c.y), z: snap(c.z) };

    let it = 0;
    while (intersectsAny(c) && it < maxIters) {
      const fp = effectiveFootprint(c);

      c = { ...c, z: c.z + fp.w + GAP };
      if (c.z > container.width - fp.w) {
        c = { ...c, z: 0, x: c.x + fp.d + GAP };
      }
      if (c.x > container.depth - fp.d) {
        c = { ...c, x: 0, z: 0 };
        break;
      }
      c = clampCubeInsideContainer(c, container);
      it++;
    }

    placed.push(c);
  }

  return placed;
}

/**
 *  EasyCargo-style pero "hasta atrás" (al frente del trailer):
 * - Empieza pegado al frente: x = container.depth - boxDepth
 * - Llena el ancho (z) por filas
 * - Cuando no cabe en z, crea nueva fila "hacia las puertas" (x disminuye)
 * - Respeta rotación real vía effectiveFootprint()
 */
function packEasyCargoRows(input: Cube3DData[], container: Container3DProps) {
  const out: Cube3DData[] = []

  let z = 0                 // lateral (0 = pared izquierda)
  let rowMaxD = 0           // profundidad máxima (avance) en esta fila
  let rowOffset = 0         // cuánto hemos avanzado desde el frente hacia las puertas

  for (const raw of input) {
    let c = clampCubeInsideContainer(normalizeCubeXYZ(raw, container), container)
    c = { ...c, y: 0 }

    const fp = effectiveFootprint(c)

    // Si no cabe en el ancho -> nueva fila
    if (z + fp.w > container.width) {
      z = 0
      rowOffset += rowMaxD + GAP
      rowMaxD = 0
    }

    // Si ya no cabe en el largo total -> clamp y seguimos (o break si prefieres)
    if (rowOffset + fp.d > container.depth) {
      const xClamped = 0
      c = clampCubeInsideContainer({ ...c, x: xClamped, z, y: 0 }, container)
      out.push({ ...c, x: snap(c.x), y: 0, z: snap(c.z) })
      continue
    }

    // ✅ CLAVE: colocar pegado al frente
    // "Frente" = x máximo posible dentro del contenedor para esta fila
    const x = rowOffset

    c = clampCubeInsideContainer({ ...c, x, z, y: 0 }, container)
    c = { ...c, x: snap(c.x), y: 0, z: snap(c.z) }

    out.push(c)

    // avanzar en z dentro de la fila
    z = z + fp.w + GAP
    rowMaxD = Math.max(rowMaxD, fp.d)
  }

  return autoResolveOverlaps(out, container)
}

function ClampPan({
  controlsRef,
  container,
}: {
  controlsRef: React.RefObject<any>;
  container: Container3DProps;
}) {
  const limits = useMemo(() => {
    const padX = container.width * 0.9;
    const padY = container.height * 0.9;
    const padZ = container.depth * 0.9;
    return new THREE.Box3(
      new THREE.Vector3(-container.width / 2 - padX, -padY, -container.depth / 2 - padZ),
      new THREE.Vector3(container.width / 2 + padX, container.height + padY, container.depth / 2 + padZ)
    );
  }, [container.width, container.height, container.depth]);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    const t = c.target as THREE.Vector3;
    t.x = THREE.MathUtils.clamp(t.x, limits.min.x, limits.max.x);
    t.y = THREE.MathUtils.clamp(t.y, limits.min.y, limits.max.y);
    t.z = THREE.MathUtils.clamp(t.z, limits.min.z, limits.max.z);
    c.update();
  });

  return null;
}

function Container({ width, height, depth }: Container3DProps) {
  const cy = height / 2;

  const wallTexture = useLoader(THREE.TextureLoader, trailerWallImg.src);
  const doorTexture = useLoader(THREE.TextureLoader, trailerDoorsImg.src);

  wallTexture.wrapS = wallTexture.wrapT = THREE.ClampToEdgeWrapping;
  doorTexture.wrapS = doorTexture.wrapT = THREE.ClampToEdgeWrapping;

  return (
    <group>
      {/* Floor */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[width, 1, depth]} />
        <meshStandardMaterial side={THREE.BackSide} color="#2C2C2C" />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, cy, -depth / 2]} receiveShadow>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          map={doorTexture}
          opacity={1}
          side={THREE.FrontSide}
          depthTest={true}
          polygonOffset={true}
          polygonOffsetFactor={-1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {/* Left wall */}
      <mesh position={[-width / 2, cy, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={wallTexture} side={THREE.FrontSide} />
      </mesh>

      {/* Right wall */}
      <mesh position={[width / 2, cy, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial map={wallTexture} side={THREE.FrontSide} />
      </mesh>

      {/* Top */}
      <mesh position={[0, height, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#E5E5E5" metalness={0.2} roughness={0.6} side={THREE.BackSide} />
      </mesh>

      {/* Wireframe edges */}
      <lineSegments position={[0, cy, 0]} renderOrder={10}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color="#1A1A1A" linewidth={2} depthTest={false} />
      </lineSegments>
    </group>
  );
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
  );
}

function ProductCube({
  cube,
  container,
  onClick,
  isSelected,
  editable,
  onUpdate,
  onTransformingChange,
}: {
  cube: Cube3DData;
  container: Container3DProps;
  onClick?: (cube: Cube3DData) => void;
  isSelected?: boolean;
  editable?: boolean;
  onUpdate?: (next: Cube3DData, mode: CubeUpdateMode) => void;
  onTransformingChange?: (v: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<any>(null);
  const [meshObject, setMeshObject] = useState<THREE.Mesh | null>(null);
  const { camera, gl } = useThree();

  const position = useMemo(() => cubeToCenteredPos(cube, container), [cube, container]);
  const rotation: [number, number, number] = [0, cube.rotY ?? 0, 0];

  const baseColor = cube.color ?? "#3B82F6";
  const color = isSelected ? "#60A5FA" : baseColor;

  const readClampedMeshCube = useCallback(() => {
    const m = meshRef.current;
    if (!m) return null;

    const raw = centeredPosToCubeXYZ(m.position, cube, container);

    const next: Cube3DData = clampCubeInsideContainer({
      ...cube,
      x: snap(raw.x),
      y: snap(raw.y),
      z: snap(raw.z),
    }, container);

    return next;
  }, [container, cube]);

  const handleObjectChange = useCallback(() => {
    const m = meshRef.current;
    if (!m) return;

    const next = readClampedMeshCube();
    if (!next) return;

    // Forzar el mesh a la posición válida para no salirse del contenedor.
    const [px, py, pz] = cubeToCenteredPos(next, container);
    m.position.set(px, py, pz);
    onUpdate?.(next, "preview");
  }, [container, onUpdate, readClampedMeshCube]);

  useEffect(() => {
    const tc = controlsRef.current;
    if (!tc || !editable || !isSelected) return;

    const onDrag = (e: any) => {
      const dragging = !!e?.value;
      onTransformingChange?.(dragging);
      if (dragging) return;

      const next = readClampedMeshCube();
      if (!next) return;
      onUpdate?.(next, "commit");
    };
    tc.addEventListener?.("dragging-changed", onDrag);

    return () => {
      tc.removeEventListener?.("dragging-changed", onDrag);
    };
  }, [editable, isSelected, onTransformingChange, onUpdate, readClampedMeshCube]);

  const bindMeshRef = useCallback((node: THREE.Mesh | null) => {
    meshRef.current = node;
    setMeshObject(node);
  }, []);

  const MeshEl = (
    <mesh
      ref={bindMeshRef}
      position={position as any}
      rotation={rotation as any}
      castShadow
      onPointerDown={(e) => {
        e.stopPropagation();
        onClick?.(cube);
      }}
    >
      {/* Geometría física fija; la rotación REAL la da rotY */}
      <boxGeometry args={[cube.width, cube.height, cube.depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );

  if (editable && isSelected) {
    return (
      <Fragment>
        {MeshEl}
        {meshObject && (
          <TransformControls
            ref={controlsRef}
            object={meshObject as any}
            camera={camera}
            domElement={gl.domElement}
            mode="translate"
            showX
            showY
            showZ
            onObjectChange={handleObjectChange}
          />
        )}
      </Fragment>
    );
  }

  return MeshEl;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const orbitRef = useRef<any>(null);
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);

  const [items, setItems] = useState<Cube3DData[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const shouldEmitChangesRef = useRef(false);

  // evitar que se quede pegado si se pierde mouseUp/touchEnd
  useEffect(() => {
    const release = () => setIsTransforming(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("mouseup", release);
    window.addEventListener("touchend", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("mouseup", release);
      window.removeEventListener("touchend", release);
    };
  }, []);

  useEffect(() => {
    if (!editMode) setIsTransforming(false);
  }, [editMode]);

  // If cubes already include calculated coordinates, preserve them.
  // Otherwise, fallback to auto-packing rows.
  useEffect(() => {
    const containerBounds = {
      width: container.width,
      height: container.height,
      depth: container.depth,
    };

    const normalized = (cubes ?? []).map((c) =>
      clampCubeInsideContainer(normalizeCubeXYZ(c, containerBounds), containerBounds)
    );

    const hasExplicitLayout = normalized.some(
      (c) => Math.abs(c.x) > 0.001 || Math.abs(c.y) > 0.001 || Math.abs(c.z) > 0.001
    );

    if (hasExplicitLayout) {
      setItems(normalized);
      return;
    }

    setItems(packEasyCargoRows(normalized, containerBounds));
  }, [cubes, container.width, container.height, container.depth]);

  useEffect(() => {
    if (!shouldEmitChangesRef.current) return;
    shouldEmitChangesRef.current = false;
    onCubesChange?.(items);
  }, [items, onCubesChange]);

  const selectedCube = useMemo(
    () => items.find((c) => c.id === selectedId) ?? null,
    [items, selectedId]
  );

  const selectedName = useMemo(() => {
    if (!selectedCube) return "";
    return (selectedCube.name ?? selectedCube.productName ?? "Producto").trim();
  }, [selectedCube]);

  const selectedWeightKg = useMemo(() => {
    if (!selectedCube) return 0;
    const v = selectedCube.weightKg ?? selectedCube.weight ?? 0;
    return Number.isFinite(Number(v)) ? Number(v) : 0;
  }, [selectedCube]);

  const computed = useMemo(() => {
    const weight = items.reduce((acc, c) => acc + (Number(c.weightKg ?? c.weight ?? 0) || 0), 0);
    const volume = items.reduce((acc, c) => acc + c.width * c.height * c.depth, 0);
    const containerVol = container.width * container.height * container.depth;
    const util = containerVol > 0 ? (volume / containerVol) * 100 : 0;
    return {
      weightKg: weight,
      volumeM3: volume / 1_000_000,
      utilPercent: util,
    };
  }, [items, container.width, container.height, container.depth]);

  const W = totalWeightKg ?? computed.weightKg;
  const V = totalVolumeM3 ?? computed.volumeM3;
  const U = utilizationPercent ?? computed.utilPercent;

  const cam = useMemo(() => {
    const m = Math.max(container.width, container.height, container.depth);
    return {
      position: [m * 0.9, m * 0.65, m * 0.9] as [number, number, number],
      fov: 50,
      near: Math.max(0.1, m / 1000),
      far: m * 50,
    };
  }, [container.width, container.height, container.depth]);

  const resetView = () => {
    const m = Math.max(container.width, container.height, container.depth);
    if (orbitRef.current) {
      orbitRef.current.target.set(0, container.height / 2, 0);
      orbitRef.current.object.position.set(m * 0.9, m * 0.65, m * 0.9);
      orbitRef.current.update();
    }
  };

  // Local rotate helpers (EasyCargo-style): rotate selected cube only.
  const collidesWithOthers = useCallback(
    (candidate: Cube3DData, others: Cube3DData[]) => {
      const bb = aabbCentered(candidate, container);
      for (const other of others) {
        if (boxesOverlap(bb, aabbCentered(other, container))) return true;
      }
      return false;
    },
    [container]
  );

  const getCollisions = useCallback(
    (candidate: Cube3DData, others: Cube3DData[]) => {
      const bb = aabbCentered(candidate, container);
      return others.filter((other) => boxesOverlap(bb, aabbCentered(other, container)));
    },
    [container]
  );

  const normalizeManualPlacement = useCallback(
    (candidate: Cube3DData) =>
      clampCubeInsideContainer(
        {
          ...candidate,
          x: snap(candidate.x),
          y: snap(candidate.y),
          z: snap(candidate.z),
        },
        container
      ),
    [container]
  );

  const tryAtAnchor = useCallback(
    (
      cube: Cube3DData,
      occupied: Cube3DData[],
      anchor: { x: number; y?: number; z: number },
      seen: Set<string>
    ) => {
      const base = normalizeManualPlacement({
        ...cube,
        x: anchor.x,
        y: anchor.y ?? cube.y,
        z: anchor.z,
      });
      const keyBase = `${base.x}|${base.y}|${base.z}|${normRotY(base.rotY)}`;
      if (seen.has(keyBase)) return null;
      seen.add(keyBase);

      const variants: Cube3DData[] = [base];

      if (Math.abs(base.y) > 0.001) {
        variants.push(normalizeManualPlacement({ ...base, y: 0 }));
      }

      const stackedY = snap(findStackY(base, occupied, container));
      if (Math.abs(stackedY - base.y) > 0.001) {
        variants.push(normalizeManualPlacement({ ...base, y: stackedY }));
      }

      for (const variant of variants) {
        if (!collidesWithOthers(variant, occupied)) return variant;
      }
      return null;
    },
    [collidesWithOthers, container, normalizeManualPlacement]
  );

  const findNearestFreeSlot = useCallback(
    (cube: Cube3DData, occupied: Cube3DData[], preferred: Array<{ x: number; y?: number; z: number }>) => {
      const seen = new Set<string>();

      for (const anchor of preferred) {
        const placed = tryAtAnchor(cube, occupied, anchor, seen);
        if (placed) return placed;
      }

      const candidateFp = effectiveFootprint(cube);
      const adjacencyAnchors: Array<{ x: number; y?: number; z: number }> = [];
      for (const occ of occupied) {
        const occFp = effectiveFootprint(occ);
        adjacencyAnchors.push(
          { x: occ.x - candidateFp.d - GAP, y: occ.y, z: occ.z },
          { x: occ.x + occFp.d + GAP, y: occ.y, z: occ.z },
          { x: occ.x, y: occ.y, z: occ.z - candidateFp.w - GAP },
          { x: occ.x, y: occ.y, z: occ.z + occFp.w + GAP },
          { x: occ.x - candidateFp.d - GAP, y: occ.y, z: occ.z - candidateFp.w - GAP },
          { x: occ.x + occFp.d + GAP, y: occ.y, z: occ.z + occFp.w + GAP },
          { x: occ.x - candidateFp.d - GAP, y: occ.y, z: occ.z + occFp.w + GAP },
          { x: occ.x + occFp.d + GAP, y: occ.y, z: occ.z - candidateFp.w - GAP }
        );
      }

      for (const anchor of adjacencyAnchors) {
        const placed = tryAtAnchor(cube, occupied, anchor, seen);
        if (placed) return placed;
      }

      const maxX = Math.max(0, container.depth - candidateFp.d);
      const maxZ = Math.max(0, container.width - candidateFp.w);
      const stepX = Math.max(SNAP_STEP, Math.floor(candidateFp.d / 2), 1);
      const stepZ = Math.max(SNAP_STEP, Math.floor(candidateFp.w / 2), 1);
      const yLevels = Array.from(new Set([cube.y, 0]));

      for (const y of yLevels) {
        for (let x = 0; x <= maxX; x += stepX) {
          for (let z = 0; z <= maxZ; z += stepZ) {
            const placed = tryAtAnchor(cube, occupied, { x, y, z }, seen);
            if (placed) return placed;
          }
        }
      }

      return null;
    },
    [container.depth, container.width, tryAtAnchor]
  );

  const reflowAfterMove = useCallback(
    (movingFrom: Cube3DData, movingTo: Cube3DData, others: Cube3DData[]) => {
      const safeMoving = normalizeManualPlacement(movingTo);
      if (!collidesWithOthers(safeMoving, others)) {
        return { moving: safeMoving, others };
      }

      let relocatedOthers = [...others];
      const initialCollisions = getCollisions(safeMoving, relocatedOthers).sort((a, b) => {
        const da = Math.abs(a.x - safeMoving.x) + Math.abs(a.y - safeMoving.y) + Math.abs(a.z - safeMoving.z);
        const db = Math.abs(b.x - safeMoving.x) + Math.abs(b.y - safeMoving.y) + Math.abs(b.z - safeMoving.z);
        return da - db;
      });

      for (let i = 0; i < initialCollisions.length; i++) {
        const blockedId = initialCollisions[i]?.id;
        if (!blockedId) continue;
        const blocked = relocatedOthers.find((c) => c.id === blockedId);
        if (!blocked) continue;

        const withoutBlocked = relocatedOthers.filter((c) => c.id !== blocked.id);
        const preferredAnchors =
          i === 0
            ? [
                { x: movingFrom.x, y: movingFrom.y, z: movingFrom.z },
                { x: blocked.x, y: blocked.y, z: blocked.z },
              ]
            : [{ x: blocked.x, y: blocked.y, z: blocked.z }];

        const relocated = findNearestFreeSlot(blocked, [safeMoving, ...withoutBlocked], preferredAnchors);
        if (!relocated) return null;

        relocatedOthers = [...withoutBlocked, relocated];
      }

      if (collidesWithOthers(safeMoving, relocatedOthers)) return null;
      return { moving: safeMoving, others: relocatedOthers };
    },
    [collidesWithOthers, findNearestFreeSlot, getCollisions, normalizeManualPlacement]
  );

  const tryRotateWithoutRepack = useCallback(
    (selected: Cube3DData, others: Cube3DData[]) => {
      const rotatedRaw: Cube3DData = {
        ...selected,
        rotY: normRotY((selected.rotY ?? 0) + Math.PI / 2),
      };
      const rotated = normalizeManualPlacement(rotatedRaw);

      if (!collidesWithOthers(rotated, others)) return rotated;

      const stacked = clampCubeInsideContainer(
        { ...rotated, y: snap(findStackY(rotated, others, container)) },
        container
      );
      if (!collidesWithOthers(stacked, others)) return stacked;

      const step = Math.max(1, SNAP_STEP);
      const maxRadius = Math.max(rotated.width, rotated.depth) + GAP * 4;
      for (let radius = step; radius <= maxRadius; radius += step) {
        const offsets: Array<[number, number]> = [
          [radius, 0],
          [-radius, 0],
          [0, radius],
          [0, -radius],
          [radius, radius],
          [radius, -radius],
          [-radius, radius],
          [-radius, -radius],
        ];

        for (const [dx, dz] of offsets) {
          const moved = normalizeManualPlacement({
            ...rotated,
            x: selected.x + dx,
            y: selected.y,
            z: selected.z + dz,
          });
          if (!collidesWithOthers(moved, others)) return moved;

          const movedStacked = clampCubeInsideContainer(
            { ...moved, y: snap(findStackY(moved, others, container)) },
            container
          );
          if (!collidesWithOthers(movedStacked, others)) return movedStacked;
        }
      }

      return null;
    },
    [collidesWithOthers, container, normalizeManualPlacement]
  );

  // Rotate only the selected cube. Never re-pack all cargo.
  const rotateSelected90 = () => {
    if (!selectedId) return;

    setItems((prev) => {
      const selected = prev.find((c) => c.id === selectedId);
      if (!selected) return prev;

      const others = prev.filter((c) => c.id !== selectedId);
      const rotated = tryRotateWithoutRepack(selected, others);
      if (!rotated) {
        setLayoutNotice("No se pudo rotar esa caja sin colisionar. Muevela un poco e intenta de nuevo.");
        return prev;
      }

      const next = prev.map((c) => (c.id === selectedId ? rotated : c));
      setLayoutNotice(null);
      shouldEmitChangesRef.current = true;
      return next;
    });
  };

  const updateCube = (nextCube: Cube3DData, mode: CubeUpdateMode = "commit") => {
    const safe = normalizeManualPlacement(nextCube);

    setItems((prev) => {
      const moving = prev.find((c) => c.id === safe.id);
      if (!moving) return prev;

      if (mode === "preview") {
        const next = prev.map((c) => (c.id === safe.id ? safe : c));
        setLayoutNotice(null);
        return next;
      }

      const others = prev.filter((c) => c.id !== safe.id);

      const resolved = reflowAfterMove(moving, safe, others);
      if (!resolved) {
        setLayoutNotice("No hay espacio válido para ese movimiento sin salir del trailer ni colisionar.");
        return prev;
      }

      const othersMap = new Map(resolved.others.map((c) => [c.id, c]));
      const next = prev.map((c) => {
        if (c.id === resolved.moving.id) return resolved.moving;
        return othersMap.get(c.id) ?? c;
      });

      setLayoutNotice(null);
      shouldEmitChangesRef.current = true;
      return next;
    });
  };

  return (
    <div className="w-full">
      <div className="w-full h-[420px] overflow-hidden rounded-lg border bg-gray-100">
        <Canvas
          shadows
          camera={cam}
          style={{ background: "#F3F4F6" }}
          onPointerMissed={() => {
            if (!editMode) setSelectedId(null);
          }}
        >
          <ambientLight intensity={0.7} />
          <directionalLight
            position={[200, 400, 200]}
            intensity={1.0}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />

          <OrbitControls
            ref={orbitRef}
            target={[0, container.height / 2, 0]}
            enabled={!editMode && !isTransforming}
            enableDamping
            dampingFactor={0.08}
            minDistance={Math.max(container.width, container.depth) * 0.35}
            maxDistance={Math.max(container.width, container.depth) * 6}
            makeDefault
          />

          <ClampPan controlsRef={orbitRef} container={container} />

          <ReferenceGrid width={container.width} depth={container.depth} />
          <Container {...container} />

          {items.map((cube) => (
            <ProductCube
              key={cube.id}
              cube={cube}
              container={container}
              editable={editMode}
              onUpdate={updateCube}
              onTransformingChange={setIsTransforming}
              isSelected={selectedId === cube.id}
              onClick={(c) => {
                setSelectedId(c.id);
                if (editMode) setLayoutNotice(null);
                onCubeClick?.(c);
              }}
            />
          ))}
        </Canvas>
      </div>

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
              onClick={() =>
                setEditMode((v) => {
                  const next = !v;
                  if (next) {
                    setSelectedId(null);
                    setLayoutNotice("Selecciona una caja para editarla con el gizmo.");
                  } else {
                    setLayoutNotice(null);
                  }
                  return next;
                })
              }
              className={`rounded-md border px-3 py-2 text-sm hover:bg-gray-50 ${editMode ? "bg-gray-50" : ""}`}
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
              onClick={() => setSelectedId(null)}
              disabled={!selectedId}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Deseleccionar
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

        <div className="mt-4">
          {layoutNotice && (
            <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {layoutNotice}
            </div>
          )}
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
                  <div className="font-semibold">{selectedCube.product?.category ?? "—"}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
