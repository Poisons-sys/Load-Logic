"use client";

import React, { Fragment, useEffect, useMemo, useState, useRef, useCallback, useLayoutEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, TransformControls, useGLTF } from "@react-three/drei";
import trailerWallImg from "../assets/trailer-wall.png";
import trailerDoorsImg from "../assets/trailer-doors.png";

export type Container3DProps = {
  width: number;
  height: number;
  depth: number;
};

export type Cube3DData = {
  id: string;
  instanceId?: string;
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
  routeStop?: number;
  loadingZone?: "front" | "center" | "rear";
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
  focusCubeIds?: string[];
  focusToken?: string | number | null;
  forceEditMode?: boolean;
  showControlPanel?: boolean;
  onCubeClick?: (cube: Cube3DData) => void;
  onCubesChange?: (cubes: Cube3DData[]) => void;
  onEditStatsChange?: (stats: LayoutEditStats) => void;
};

type CubeUpdateMode = "preview" | "commit";

export type LayoutEditStats = {
  moves: number;
  swaps: number;
  rotates: number;
  undos: number;
  redos: number;
  keyNudges: number;
  updatedAt: number;
};

const SNAP_STEP = 1;
const GAP = 2;
const TRAILER_MODEL_URL = "/models/trailer.gltf";

function cloneCubes(input: Cube3DData[]) {
  return input.map((cube) => ({
    ...cube,
    product: cube.product ? { ...cube.product } : cube.product,
  }));
}

function snap(v: number, step = SNAP_STEP) {
  return Math.round(v / step) * step;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function finite(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

    // Only treat boxes below (or touching) as supports.
    // Ignoring boxes above avoids artificial vertical gaps.
    if (ob.max.y > candMin.y + 0.01) continue;

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

function sanitizeCube(raw: Cube3DData, index: number): Cube3DData {
  const width = Math.max(1, finite(raw.width, 1));
  const height = Math.max(1, finite(raw.height, 1));
  const depth = Math.max(1, finite(raw.depth, 1));
  return {
    ...raw,
    id: String(raw.id ?? `cube-${index}`),
    x: Math.max(0, finite(raw.x, 0)),
    y: Math.max(0, finite(raw.y, 0)),
    z: Math.max(0, finite(raw.z, 0)),
    width,
    height,
    depth,
    rotY: finite(raw.rotY, 0),
    weightKg: finite(raw.weightKg, finite(raw.weight, 0)),
  };
}

function settleByGravity(input: Cube3DData[], container: Container3DProps) {
  const sorted = [...input].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.z - b.z;
  });
  const settled: Cube3DData[] = [];
  for (const cube of sorted) {
    const y = snap(findStackY(cube, settled, container));
    const next = clampCubeInsideContainer({ ...cube, y }, container);
    settled.push(next);
  }
  return settled;
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

    // CLAVE: colocar pegado al frente
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

function resolveTrailerCargoAnchor(root: THREE.Object3D): THREE.Object3D {
  const namedAnchor = root.getObjectByName("Cube");
  if (namedAnchor) return namedAnchor;

  let bestMesh: THREE.Mesh | null = null;
  let bestVolume = 0;
  const size = new THREE.Vector3();

  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const bbox = new THREE.Box3().setFromObject(obj);
    bbox.getSize(size);
    const volume = size.x * size.y * size.z;
    if (volume > bestVolume) {
      bestVolume = volume;
      bestMesh = obj;
    }
  });

  return bestMesh ?? root;
}

function TrailerReferenceModel({ container }: { container: Container3DProps }) {
  const gltf = useGLTF(TRAILER_MODEL_URL) as { scene: THREE.Group };

  const trailerScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    trailerScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.raycast = () => null;

      const source = Array.isArray(obj.material) ? obj.material : [obj.material];
      const ghost = source.map((mat) => {
        const cloned =
          mat && typeof (mat as any).clone === "function"
            ? ((mat as any).clone() as THREE.MeshStandardMaterial)
            : new THREE.MeshStandardMaterial({ color: "#9CA3AF" });
        cloned.transparent = true;
        cloned.opacity = 0.36;
        cloned.depthWrite = false;
        cloned.metalness = Math.max(0, Number(cloned.metalness ?? 0.1));
        cloned.roughness = Math.max(0.35, Number(cloned.roughness ?? 0.7));
        return cloned;
      });

      obj.material = (Array.isArray(obj.material) ? ghost : ghost[0]) as any;
    });
  }, [trailerScene]);

  const bind = useMemo(() => {
    trailerScene.updateWorldMatrix(true, true);
    const cargoAnchor = resolveTrailerCargoAnchor(trailerScene);
    const cargoBox = new THREE.Box3().setFromObject(cargoAnchor);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    cargoBox.getSize(size);
    cargoBox.getCenter(center);

    if (size.x <= 0.0001 || size.y <= 0.0001 || size.z <= 0.0001) return null;

    const scale = Math.min(
      container.width / size.x,
      container.height / size.y,
      container.depth / size.z
    ) * 1.02; // un poco mas grande para que la carga quede visible dentro

    if (!Number.isFinite(scale) || scale <= 0) return null;

    return {
      scale,
      position: [
        -center.x * scale,
        -cargoBox.min.y * scale,
        -center.z * scale,
      ] as [number, number, number],
    };
  }, [container.width, container.height, container.depth, trailerScene]);

  if (!bind) return null;

  return (
    <group position={bind.position} scale={[bind.scale, bind.scale, bind.scale]} renderOrder={-1}>
      <primitive object={trailerScene} />
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
  snapStep,
  onClick,
  isSelected,
  editable,
  onUpdate,
  onTransformingChange,
}: {
  cube: Cube3DData;
  container: Container3DProps;
  snapStep: number;
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
      x: snap(raw.x, snapStep),
      y: snap(raw.y, snapStep),
      z: snap(raw.z, snapStep),
    }, container);

    return next;
  }, [container, cube, snapStep]);

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

function InstancedCubeLayer({
  cubes,
  container,
  onCubeClick,
}: {
  cubes: Cube3DData[];
  container: Container3DProps;
  onCubeClick?: (cube: Cube3DData) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh | null>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < cubes.length; i++) {
      const cube = cubes[i];
      const [x, y, z] = cubeToCenteredPos(cube, container);
      position.set(x, y, z);
      quaternion.setFromEuler(new THREE.Euler(0, cube.rotY ?? 0, 0));
      scale.set(cube.width, cube.height, cube.depth);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
      color.set(cube.color ?? "#3B82F6");
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [container, cubes]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, cubes.length]}
      castShadow
      onPointerDown={(event) => {
        event.stopPropagation();
        const id = event.instanceId;
        if (id === undefined) return;
        const cube = cubes[id];
        if (!cube) return;
        onCubeClick?.(cube);
      }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

export default function LoadVisualizer3D({
  container,
  cubes,
  totalWeightKg,
  totalVolumeM3,
  utilizationPercent,
  focusCubeIds,
  focusToken,
  forceEditMode,
  showControlPanel = true,
  onCubeClick,
  onCubesChange,
  onEditStatsChange,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const orbitRef = useRef<any>(null);
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);

  const [items, setItems] = useState<Cube3DData[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const undoStackRef = useRef<Cube3DData[][]>([]);
  const redoStackRef = useRef<Cube3DData[][]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [snapStep, setSnapStep] = useState(1);
  const [visibleMaxY, setVisibleMaxY] = useState<number>(container.height);
  const focusAnimRafRef = useRef<number | null>(null);
  const [editStats, setEditStats] = useState<LayoutEditStats>({
    moves: 0,
    swaps: 0,
    rotates: 0,
    undos: 0,
    redos: 0,
    keyNudges: 0,
    updatedAt: 0,
  });
  const shouldEmitChangesRef = useRef(false);
  const effectiveEditMode = forceEditMode ?? editMode;

  const stopFocusAnimation = useCallback(() => {
    if (focusAnimRafRef.current !== null) {
      cancelAnimationFrame(focusAnimRafRef.current);
      focusAnimRafRef.current = null;
    }
  }, []);

  const syncHistoryCounts = useCallback(() => {
    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  const bumpStats = useCallback((delta: Partial<Omit<LayoutEditStats, "updatedAt">>) => {
    setEditStats((prev) => ({
      moves: prev.moves + (delta.moves ?? 0),
      swaps: prev.swaps + (delta.swaps ?? 0),
      rotates: prev.rotates + (delta.rotates ?? 0),
      undos: prev.undos + (delta.undos ?? 0),
      redos: prev.redos + (delta.redos ?? 0),
      keyNudges: prev.keyNudges + (delta.keyNudges ?? 0),
      updatedAt: Date.now(),
    }));
  }, []);

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
    if (!effectiveEditMode) setIsTransforming(false);
  }, [effectiveEditMode]);

  useEffect(() => {
    setVisibleMaxY(container.height);
  }, [container.height]);

  useEffect(() => {
    if (effectiveEditMode) return;
    if (!focusCubeIds || focusCubeIds.length === 0) return;
    const controls = orbitRef.current;
    if (!controls?.object) return;

    const idSet = new Set(focusCubeIds.map(String));
    const focused = items.filter((cube) => idSet.has(String(cube.id)));
    if (focused.length === 0) return;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;

    for (const cube of focused) {
      const fp = effectiveFootprint(cube);
      minX = Math.min(minX, cube.x);
      minY = Math.min(minY, cube.y);
      minZ = Math.min(minZ, cube.z);
      maxX = Math.max(maxX, cube.x + fp.d);
      maxY = Math.max(maxY, cube.y + cube.height);
      maxZ = Math.max(maxZ, cube.z + fp.w);
    }

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const spanZ = Math.max(1, maxZ - minZ);
    const radius = Math.max(spanX, spanY, spanZ) / 2;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const target = new THREE.Vector3(
      centerZ - container.width / 2,
      centerY,
      centerX - container.depth / 2
    );

    const camera = controls.object as THREE.Camera;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    if (dir.lengthSq() < 0.0001) dir.set(1, 0.6, 1);
    dir.normalize();

    const minDist = Math.max(container.width, container.depth) * 0.35;
    const maxDist = Math.max(container.width, container.depth) * 6;
    const distance = clamp(radius * 2.4, minDist, maxDist);

    const nextPos = target.clone().addScaledVector(dir, distance);
    nextPos.y = clamp(nextPos.y, Math.max(20, container.height * 0.25), container.height * 2);

    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const toPos = nextPos.clone();
    const toTarget = target.clone();

    if (fromPos.distanceToSquared(toPos) < 0.0001 && fromTarget.distanceToSquared(toTarget) < 0.0001) {
      controls.target.copy(toTarget);
      camera.position.copy(toPos);
      controls.update();
      return;
    }

    stopFocusAnimation();
    const durationMs = 420;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - (Math.pow(-2 * t + 2, 2) / 2);
      camera.position.lerpVectors(fromPos, toPos, eased);
      controls.target.lerpVectors(fromTarget, toTarget, eased);
      controls.update();

      if (t < 1) {
        focusAnimRafRef.current = requestAnimationFrame(step);
      } else {
        focusAnimRafRef.current = null;
      }
    };

    focusAnimRafRef.current = requestAnimationFrame(step);
  }, [items, container, focusToken, focusCubeIds, effectiveEditMode, stopFocusAnimation]);

  useEffect(() => {
    return () => {
      stopFocusAnimation();
    };
  }, [stopFocusAnimation]);

  // If cubes already include calculated coordinates, preserve them.
  // Otherwise, fallback to auto-packing rows.
  useEffect(() => {
    const containerBounds = {
      width: container.width,
      height: container.height,
      depth: container.depth,
    };

    setLockedIds([]);
    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryCounts();

    const normalized = (cubes ?? []).map((c, index) => {
      const safe = sanitizeCube(c, index);
      return clampCubeInsideContainer(normalizeCubeXYZ(safe, containerBounds), containerBounds);
    });

    const hasExplicitLayout = normalized.some(
      (c) => Math.abs(c.x) > 0.001 || Math.abs(c.y) > 0.001 || Math.abs(c.z) > 0.001
    );

    if (hasExplicitLayout) {
      setItems(settleByGravity(normalized, containerBounds));
      return;
    }

    setItems(settleByGravity(packEasyCargoRows(normalized, containerBounds), containerBounds));
  }, [cubes, container.width, container.height, container.depth, syncHistoryCounts]);

  useEffect(() => {
    if (!shouldEmitChangesRef.current) return;
    shouldEmitChangesRef.current = false;
    onCubesChange?.(items);
  }, [items, onCubesChange]);

  useEffect(() => {
    onEditStatsChange?.(editStats);
  }, [editStats, onEditStatsChange]);

  const selectedCube = useMemo(
    () => items.find((c) => c.id === selectedId) ?? null,
    [items, selectedId]
  );
  const selectedLocked = useMemo(
    () => (selectedId ? lockedIds.includes(selectedId) : false),
    [lockedIds, selectedId]
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
    stopFocusAnimation();
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
          x: snap(candidate.x, snapStep),
          y: snap(candidate.y, snapStep),
          z: snap(candidate.z, snapStep),
        },
        container
      ),
    [container, snapStep]
  );

  const tryAtAnchor = useCallback(
    (
      cube: Cube3DData,
      occupied: Cube3DData[],
      anchor: { x: number; y?: number; z: number },
      seen: Set<string>
    ) => {
      const baseRaw = normalizeManualPlacement({
        ...cube,
        x: anchor.x,
        y: anchor.y ?? cube.y,
        z: anchor.z,
      });
      const base = normalizeManualPlacement({
        ...baseRaw,
        y: snap(findStackY(baseRaw, occupied, container), snapStep),
      });
      const keyBase = `${base.x}|${base.y}|${base.z}|${normRotY(base.rotY)}`;
      if (seen.has(keyBase)) return null;
      seen.add(keyBase);

      const variants: Cube3DData[] = [base];

      if (Math.abs(base.y) > 0.001) variants.push(normalizeManualPlacement({ ...base, y: 0 }));

      for (const variant of variants) {
        if (!collidesWithOthers(variant, occupied)) return variant;
      }
      return null;
    },
    [collidesWithOthers, container, normalizeManualPlacement, snapStep]
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
        return { moving: safeMoving, others, shiftedCount: 0 };
      }

      let relocatedOthers = [...others];
      const initialCollisions = getCollisions(safeMoving, relocatedOthers).sort((a, b) => {
        const da = Math.abs(a.x - safeMoving.x) + Math.abs(a.y - safeMoving.y) + Math.abs(a.z - safeMoving.z);
        const db = Math.abs(b.x - safeMoving.x) + Math.abs(b.y - safeMoving.y) + Math.abs(b.z - safeMoving.z);
        return da - db;
      });

      // Deterministic swap: if only one box collides, first try direct exchange.
      if (initialCollisions.length === 1) {
        const blocked = initialCollisions[0];
        const withoutBlocked = relocatedOthers.filter((c) => c.id !== blocked.id);
        const swappedBlocked = normalizeManualPlacement({
          ...blocked,
          x: movingFrom.x,
          y: movingFrom.y,
          z: movingFrom.z,
        });

        if (!collidesWithOthers(swappedBlocked, [safeMoving, ...withoutBlocked])) {
          return {
            moving: safeMoving,
            others: [...withoutBlocked, swappedBlocked],
            shiftedCount: 1,
          };
        }
      }

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
      return { moving: safeMoving, others: relocatedOthers, shiftedCount: initialCollisions.length };
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
      const rotatedSettled = clampCubeInsideContainer(
        { ...rotated, y: snap(findStackY(rotated, others, container), snapStep) },
        container
      );

      if (!collidesWithOthers(rotatedSettled, others)) return rotatedSettled;

      const stacked = clampCubeInsideContainer(
        { ...rotated, y: snap(findStackY(rotated, others, container)) },
        container
      );
      if (!collidesWithOthers(stacked, others)) return stacked;

      const step = Math.max(1, snapStep);
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
    [collidesWithOthers, container, normalizeManualPlacement, snapStep]
  );

  const pushHistory = useCallback((snapshot: Cube3DData[]) => {
    undoStackRef.current.push(cloneCubes(snapshot));
    if (undoStackRef.current.length > 50) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    syncHistoryCounts();
  }, [syncHistoryCounts]);

  const undoLayout = () => {
    setItems((prev) => {
      const previous = undoStackRef.current.pop();
      if (!previous) {
        syncHistoryCounts();
        return prev;
      }
      redoStackRef.current.push(cloneCubes(prev));
      syncHistoryCounts();
      shouldEmitChangesRef.current = true;
      setLayoutNotice("Se deshizo el ultimo cambio.");
      bumpStats({ undos: 1 });
      return cloneCubes(previous);
    });
  };

  const redoLayout = () => {
    setItems((prev) => {
      const next = redoStackRef.current.pop();
      if (!next) {
        syncHistoryCounts();
        return prev;
      }
      undoStackRef.current.push(cloneCubes(prev));
      syncHistoryCounts();
      shouldEmitChangesRef.current = true;
      setLayoutNotice("Se rehizo el ultimo cambio.");
      bumpStats({ redos: 1 });
      return cloneCubes(next);
    });
  };

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

      pushHistory(prev);
      const next = prev.map((c) => (c.id === selectedId ? rotated : c));
      setLayoutNotice(null);
      bumpStats({ rotates: 1 });
      shouldEmitChangesRef.current = true;
      return next;
    });
  };

  const updateCube = useCallback((nextCube: Cube3DData, mode: CubeUpdateMode = "commit") => {
    const safe = normalizeManualPlacement(nextCube);

    setItems((prev) => {
      const moving = prev.find((c) => c.id === safe.id);
      if (!moving) return prev;
      if (lockedIds.includes(safe.id)) {
        setLayoutNotice("Esa caja esta bloqueada. Desbloqueala para editar.");
        return prev;
      }

      if (mode === "preview") {
        const next = prev.map((c) => (c.id === safe.id ? safe : c));
        setLayoutNotice(null);
        return next;
      }

      const others = prev.filter((c) => c.id !== safe.id);
      // Always settle the moved box on the nearest valid support (or floor).
      // This avoids floating gaps that later become "unsupported stack" issues.
      const stackedY = snap(findStackY(safe, others, container), snapStep);
      const settled = normalizeManualPlacement({ ...safe, y: stackedY });

      const resolved = reflowAfterMove(moving, settled, others);
      if (!resolved) {
        setLayoutNotice("No hay espacio válido para ese movimiento sin salir del trailer ni colisionar.");
        return prev;
      }

      const othersMap = new Map(resolved.others.map((c) => [c.id, c]));
      pushHistory(prev);
      const next = prev.map((c) => {
        if (c.id === resolved.moving.id) return resolved.moving;
        return othersMap.get(c.id) ?? c;
      });

      setLayoutNotice(null);
      bumpStats({ moves: 1, swaps: resolved.shiftedCount > 0 ? resolved.shiftedCount : 0 });
      shouldEmitChangesRef.current = true;
      return next;
    });
  }, [bumpStats, lockedIds, normalizeManualPlacement, pushHistory, reflowAfterMove, container, snapStep]);

  const setSelectedPosition = (axis: "x" | "y" | "z", value: number) => {
    if (!selectedId || !Number.isFinite(value)) return;
    const selected = items.find((c) => c.id === selectedId);
    if (!selected) return;
    updateCube({ ...selected, [axis]: value }, "commit");
  };

  const nudgeSelected = useCallback((dx: number, dy: number, dz: number) => {
    if (!selectedId) return;
    const selected = items.find((c) => c.id === selectedId);
    if (!selected) return;
    const next = {
      ...selected,
      x: selected.x + dx,
      y: selected.y + dy,
      z: selected.z + dz,
    };
    updateCube(next, "commit");
    bumpStats({ keyNudges: 1 });
  }, [bumpStats, items, selectedId, updateCube]);

  useEffect(() => {
    if (!effectiveEditMode || !selectedId) return;

    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;

      const step = Math.max(1, snapStep);
      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        nudgeSelected(0, 0, -step);
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        nudgeSelected(0, 0, step);
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        nudgeSelected(-step, 0, 0);
      } else if (ev.key === "ArrowRight") {
        ev.preventDefault();
        nudgeSelected(step, 0, 0);
      } else if (ev.key === "PageUp") {
        ev.preventDefault();
        nudgeSelected(0, step, 0);
      } else if (ev.key === "PageDown") {
        ev.preventDefault();
        nudgeSelected(0, -step, 0);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [effectiveEditMode, nudgeSelected, selectedId, snapStep, items]);

  const renderedItems = useMemo(
    () => items.filter((cube) => cube.y <= visibleMaxY + 0.001),
    [items, visibleMaxY]
  );

  return (
    <div className="w-full">
      <div className="w-full h-[420px] overflow-hidden rounded-lg border bg-gray-100">
        <Canvas
          shadows
          camera={cam}
          style={{ background: "#F3F4F6" }}
          onPointerMissed={() => {
            if (!effectiveEditMode) setSelectedId(null);
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
            enabled={!isTransforming}
            enableDamping
            dampingFactor={0.08}
            minDistance={Math.max(container.width, container.depth) * 0.35}
            maxDistance={Math.max(container.width, container.depth) * 6}
            makeDefault
          />

          <ClampPan controlsRef={orbitRef} container={container} />

          <ReferenceGrid width={container.width} depth={container.depth} />
          <TrailerReferenceModel container={container} />
          <Container {...container} />

          {renderedItems.length > 100 ? (
            <>
              <InstancedCubeLayer
                cubes={renderedItems.filter((cube) => cube.id !== selectedId)}
                container={container}
                onCubeClick={(c) => {
                  setSelectedId(c.id);
                  if (effectiveEditMode) setLayoutNotice(null);
                  onCubeClick?.(c);
                }}
              />
              {selectedCube && renderedItems.some((cube) => cube.id === selectedCube.id) && (
                <ProductCube
                  key={selectedCube.id}
                  cube={selectedCube}
                  container={container}
                  snapStep={snapStep}
                  editable={effectiveEditMode && !lockedIds.includes(selectedCube.id)}
                  onUpdate={updateCube}
                  onTransformingChange={setIsTransforming}
                  isSelected
                  onClick={(c) => {
                    setSelectedId(c.id);
                    if (effectiveEditMode) setLayoutNotice(null);
                    onCubeClick?.(c);
                  }}
                />
              )}
            </>
          ) : (
            renderedItems.map((cube) => (
              <ProductCube
                key={cube.id}
                cube={cube}
                container={container}
                snapStep={snapStep}
                editable={effectiveEditMode && !lockedIds.includes(cube.id)}
                onUpdate={updateCube}
                onTransformingChange={setIsTransforming}
                isSelected={selectedId === cube.id}
                onClick={(c) => {
                  setSelectedId(c.id);
                  if (effectiveEditMode) setLayoutNotice(null);
                  onCubeClick?.(c);
                }}
              />
            ))
          )}
        </Canvas>
      </div>

      {showControlPanel && (
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
            <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
              <span className="text-gray-600">Snap</span>
              <input
                type="number"
                min={1}
                max={50}
                value={snapStep}
                onChange={(e) => setSnapStep(clamp(Number(e.target.value) || 1, 1, 50))}
                className="w-14 rounded border px-1 py-0.5 text-xs"
              />
            </label>

            <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
              <span className="text-gray-600">Capa Y</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, container.height)}
                step={1}
                value={visibleMaxY}
                onChange={(e) => setVisibleMaxY(Number(e.target.value))}
                className="w-24"
              />
              <span className="w-10 text-right">{visibleMaxY.toFixed(0)}</span>
            </label>

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
              className={`rounded-md border px-3 py-2 text-sm hover:bg-gray-50 ${effectiveEditMode ? "bg-gray-50" : ""}`}
            >
              {effectiveEditMode ? "Modo edición: ON" : "Modo edición: OFF"}
            </button>

            <button
              type="button"
              onClick={rotateSelected90}
              disabled={!selectedId || selectedLocked}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              title="Rotar 90° (Y)"
            >
              Rotar 90°
            </button>

            <button
              type="button"
              onClick={() => {
                if (!selectedId) return;
                setLockedIds((prev) =>
                  prev.includes(selectedId)
                    ? prev.filter((id) => id !== selectedId)
                    : [...prev, selectedId]
                );
                setLayoutNotice(
                  selectedLocked
                    ? "Caja desbloqueada para edicion."
                    : "Caja bloqueada. Ya no se movera accidentalmente."
                );
              }}
              disabled={!selectedId}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {selectedLocked ? "Desbloquear" : "Bloquear"}
            </button>

            <button
              type="button"
              onClick={undoLayout}
              disabled={undoCount === 0}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Deshacer
            </button>

            <button
              type="button"
              onClick={redoLayout}
              disabled={redoCount === 0}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Rehacer
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

              {effectiveEditMode && (
                <div className="mt-4 rounded-md border bg-gray-50 p-3">
                  <p className="mb-2 text-sm font-medium">Edicion fina</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                    <label className="text-xs text-gray-600">
                      X (avance)
                      <input
                        type="number"
                        value={selectedCube.x}
                        onChange={(e) => setSelectedPosition("x", Number(e.target.value))}
                        className="mt-1 w-full rounded border bg-white px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Y (altura)
                      <input
                        type="number"
                        value={selectedCube.y}
                        onChange={(e) => setSelectedPosition("y", Number(e.target.value))}
                        className="mt-1 w-full rounded border bg-white px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Z (lateral)
                      <input
                        type="number"
                        value={selectedCube.z}
                        onChange={(e) => setSelectedPosition("z", Number(e.target.value))}
                        className="mt-1 w-full rounded border bg-white px-2 py-1 text-sm"
                      />
                    </label>
                    <div className="flex items-end text-xs text-gray-600">
                      Flechas = mover, PgUp/PgDn = altura
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 rounded-md border bg-gray-50 p-3 text-xs text-gray-700">
            <span className="font-medium">Telemetria layout:</span>{" "}
            mov:{editStats.moves} swap:{editStats.swaps} rot:{editStats.rotates} undo:{editStats.undos} redo:{editStats.redos} nudges:{editStats.keyNudges}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

useGLTF.preload(TRAILER_MODEL_URL);
