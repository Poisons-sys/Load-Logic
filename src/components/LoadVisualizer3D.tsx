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
  axleCount?: number;
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
const TRAILER_MODEL_URL = "/models/trailer.gltf?v=20260313-2";
const TRAILER_HITCH_GAP = 0;
// Distancia del acople (quinta rueda) medida desde la cola del tracto, en ratio del largo total del modelo.
const TRAILER_HITCH_FROM_REAR_RATIO = 0.24;
// Altura aproximada de la quinta rueda en el modelo (ratio vertical del bounding box).
const TRAILER_HITCH_HEIGHT_RATIO = 0.29;
// Altura objetivo del acople respecto al piso interno de la caja (y=0).
// Valor negativo deja la plataforma justo por debajo del piso de la caja.
const TRAILER_HITCH_TARGET_Y = -1;
// Escala de llantas del remolque calibrada para verse del mismo tamano visual que el tracto.
const TRAILER_AXLE_WHEEL_RADIUS_RATIO = 0.125;
const TRAILER_AXLE_WHEEL_THICKNESS_RATIO = 0.06;
const TRAILER_ATTACH_SIDE: "front" | "rear" = "rear";
// Eje extra para dejar el tracto en configuracion de 3 ejes (1 direccional + 2 tractivos).
const TRACTOR_THIRD_AXLE_LOCAL_Z = -6.45;
const TRACTOR_THIRD_AXLE_LOCAL_Y = 0.54;
const TRACTOR_THIRD_AXLE_HALF_TRACK = 1.10;
const TRACTOR_THIRD_AXLE_WHEEL_RADIUS = 0.52;
const TRACTOR_THIRD_AXLE_WHEEL_THICKNESS = 0.28;
const TRACTOR_RIM_MAIN_COLOR = "#9CA3AF";
const TRACTOR_RIM_HUB_COLOR = "#A8AFBA";
const TRACTOR_RIM_CAP_COLOR = "#7B8594";
const TRACTOR_RIM_MAIN_METALNESS = 0.25;
const TRACTOR_RIM_MAIN_ROUGHNESS = 0.52;
const TRACTOR_RIM_HUB_METALNESS = 0.2;
const TRACTOR_RIM_HUB_ROUGHNESS = 0.58;
const TRACTOR_RIM_CAP_METALNESS = 0.15;
const TRACTOR_RIM_CAP_ROUGHNESS = 0.62;

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
 * Balanced local packer:
 * - Splits depth into rear/center/front zones
 * - Spreads load by weight proxy across zones
 * - Alternates left/right inside each zone to reduce lateral bias
 * - Honors loadingZone when provided by intelligent strategy
 */
function packEasyCargoRows(input: Cube3DData[], container: Container3DProps) {
  type LongZone = "front" | "center" | "rear";
  type ZoneState = {
    zone: LongZone;
    startX: number;
    endX: number;
    rowOffset: number;
    rowMaxD: number;
    leftZ: number;
    rightZ: number;
    leftLoad: number;
    rightLoad: number;
    totalLoad: number;
  };

  const cubeMassScore = (cube: Cube3DData) => {
    const weight = Math.max(0, finite(cube.weightKg, finite(cube.weight, 0)));
    const volume = Math.max(1, cube.width * cube.height * cube.depth);
    return weight > 0 ? weight : volume * 0.00035;
  };

  const zonesOrder: LongZone[] = ["rear", "center", "front"];
  const third = container.depth / 3;
  const zoneState: Record<LongZone, ZoneState> = {
    rear: {
      zone: "rear",
      startX: 0,
      endX: third,
      rowOffset: 0,
      rowMaxD: 0,
      leftZ: 0,
      rightZ: container.width,
      leftLoad: 0,
      rightLoad: 0,
      totalLoad: 0,
    },
    center: {
      zone: "center",
      startX: third,
      endX: third * 2,
      rowOffset: 0,
      rowMaxD: 0,
      leftZ: 0,
      rightZ: container.width,
      leftLoad: 0,
      rightLoad: 0,
      totalLoad: 0,
    },
    front: {
      zone: "front",
      startX: third * 2,
      endX: container.depth,
      rowOffset: 0,
      rowMaxD: 0,
      leftZ: 0,
      rightZ: container.width,
      leftLoad: 0,
      rightLoad: 0,
      totalLoad: 0,
    },
  };

  const out: Cube3DData[] = [];
  const sorted = [...input]
    .map((raw) => clampCubeInsideContainer(normalizeCubeXYZ(raw, container), container))
    .sort((a, b) => {
      const massDelta = cubeMassScore(b) - cubeMassScore(a);
      if (Math.abs(massDelta) > 0.0001) return massDelta;
      const volA = a.width * a.height * a.depth;
      const volB = b.width * b.height * b.depth;
      return volB - volA;
    });

  const tryPlaceInZone = (cube: Cube3DData, zoneName: LongZone) => {
    const zone = zoneState[zoneName];
    const fp = effectiveFootprint(cube);
    const zoneDepth = Math.max(1, zone.endX - zone.startX);

    let rowOffset = zone.rowOffset;
    let rowMaxD = zone.rowMaxD;
    let leftZ = zone.leftZ;
    let rightZ = zone.rightZ;
    let leftLoad = zone.leftLoad;
    let rightLoad = zone.rightLoad;

    const beginNextRowIfNeeded = () => {
      rowOffset += rowMaxD + GAP;
      rowMaxD = 0;
      leftZ = 0;
      rightZ = container.width;
    };

    if (leftZ + fp.w > rightZ + 0.001) {
      beginNextRowIfNeeded();
    }

    if (rowOffset + fp.d > zoneDepth + 0.001) return null;

    const preferLeft = leftLoad <= rightLoad;
    const sideOrder: Array<"left" | "right"> = preferLeft ? ["left", "right"] : ["right", "left"];
    let placedZ: number | null = null;
    let side: "left" | "right" | null = null;

    for (const candidate of sideOrder) {
      if (candidate === "left") {
        if (leftZ + fp.w <= rightZ + 0.001) {
          placedZ = leftZ;
          side = "left";
          break;
        }
      } else if (rightZ - fp.w >= leftZ - 0.001) {
        placedZ = rightZ - fp.w;
        side = "right";
        break;
      }
    }

    if (placedZ === null || side === null) {
      beginNextRowIfNeeded();
      if (rowOffset + fp.d > zoneDepth + 0.001) return null;
      if (fp.w > container.width + 0.001) return null;
      if (leftLoad <= rightLoad) {
        placedZ = 0;
        side = "left";
      } else {
        placedZ = container.width - fp.w;
        side = "right";
      }
    }

    const x = zone.startX + rowOffset;
    const next = clampCubeInsideContainer({ ...cube, x, y: 0, z: placedZ }, container);
    const mass = cubeMassScore(cube);
    rowMaxD = Math.max(rowMaxD, fp.d);

    if (side === "left") {
      leftZ = placedZ + fp.w + GAP;
      leftLoad += mass;
    } else {
      rightZ = placedZ - GAP;
      rightLoad += mass;
    }

    zoneState[zoneName] = {
      ...zone,
      rowOffset,
      rowMaxD,
      leftZ,
      rightZ,
      leftLoad,
      rightLoad,
      totalLoad: zone.totalLoad + mass,
    };

    return { ...next, x: snap(next.x), y: 0, z: snap(next.z) };
  };

  for (const cube of sorted) {
    const preferred = cube.loadingZone;
    const fallbackZones = [...zonesOrder].sort((a, b) => zoneState[a].totalLoad - zoneState[b].totalLoad);
    const candidates = preferred
      ? [preferred, ...fallbackZones.filter((z) => z !== preferred)]
      : fallbackZones;

    let placed: Cube3DData | null = null;
    for (const zone of candidates) {
      placed = tryPlaceInZone(cube, zone);
      if (placed) break;
    }

    if (!placed) {
      const fallback = clampCubeInsideContainer({ ...cube, x: 0, y: 0, z: 0 }, container);
      out.push({ ...fallback, x: snap(fallback.x), y: 0, z: snap(fallback.z) });
      continue;
    }

    out.push(placed);
  }

  return autoResolveOverlaps(out, container);
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

function Container({ width, height, depth, axleCount = 3 }: Container3DProps & { axleCount?: number }) {
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

      <TrailerAxles width={width} height={height} depth={depth} axleCount={axleCount} />

      {/* Wireframe edges */}
      <lineSegments position={[0, cy, 0]} renderOrder={10}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, depth)]} />
        <lineBasicMaterial color="#1A1A1A" linewidth={2} depthTest={false} />
      </lineSegments>
    </group>
  );
}

function TrailerAxles({
  width,
  height,
  depth,
  axleCount,
}: {
  width: number;
  height: number;
  depth: number;
  axleCount?: number;
}) {
  const totalAxles = clamp(Math.round(finite(axleCount, 3)), 1, 9);
  const wheelRadius = clamp(height * TRAILER_AXLE_WHEEL_RADIUS_RATIO, 16, 40);
  const wheelThickness = clamp(width * TRAILER_AXLE_WHEEL_THICKNESS_RATIO, 6, 16);
  const axleBeamRadius = clamp(wheelRadius * 0.12, 2, 8);
  const sideInset = wheelThickness * 0.65;
  const wheelX = Math.max(0, width / 2 - sideInset);
  const wheelY = -wheelRadius;
  const axleMargin = Math.max(wheelRadius * 1.8, depth * 0.09);
  const minZ = -depth / 2 + axleMargin;
  const maxZ = depth / 2 - axleMargin;
  const usableDepth = Math.max(1, maxZ - minZ);

  // Distribucion por grupos (no lineal): eje(s) adelantado(s) + cluster trasero.
  const rearClusterCount = totalAxles <= 2 ? totalAxles : Math.min(3, totalAxles - 1);
  const frontCount = totalAxles - rearClusterCount;

  // El lado donde se acopla el tracto depende del side actual.
  const tractorAtRear = TRAILER_ATTACH_SIDE === "rear";
  const fromTractorRatio = (t: number) => {
    const clampedT = clamp(t, 0, 1);
    return tractorAtRear
      ? THREE.MathUtils.lerp(minZ, maxZ, clampedT)
      : THREE.MathUtils.lerp(maxZ, minZ, clampedT);
  };

  const frontStartT = 0.16;
  const frontEndT = 0.48;
  // Evitar que las llantas de ejes consecutivos se vean encimadas en vista lateral.
  const minAxlePitch = wheelRadius * 2.25;
  const desiredRearPitch = Math.max(minAxlePitch, depth * 0.065);
  const rearGapT = clamp(desiredRearPitch / usableDepth, 0.08, 0.16);
  const rearSpanT = rearGapT * Math.max(0, rearClusterCount - 1);
  const rearAnchorT = frontCount > 0 ? 0.92 : 0.95;
  const rearStartT = clamp(rearAnchorT - rearSpanT, 0.58, 0.94);

  const frontZs =
    frontCount <= 0
      ? []
      : frontCount === 1
        ? [fromTractorRatio(frontStartT)]
        : Array.from({ length: frontCount }, (_, i) => {
            const t = i / Math.max(1, frontCount - 1);
            return fromTractorRatio(frontStartT + t * (frontEndT - frontStartT));
          });

  const rearZs = Array.from({ length: rearClusterCount }, (_, i) =>
    fromTractorRatio(rearStartT + i * rearGapT)
  );

  const axleZs = [...frontZs, ...rearZs];

  return (
    <group>
      {axleZs.map((z, i) => (
        <group key={`axle-${i}`}>
          <mesh position={[0, wheelY, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[axleBeamRadius, axleBeamRadius, Math.max(1, width - sideInset * 1.6), 16]} />
            <meshStandardMaterial color="#4B5563" metalness={0.65} roughness={0.35} />
          </mesh>

          <mesh position={[-wheelX, wheelY, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 24]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>
          <mesh position={[wheelX, wheelY, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 24]} />
            <meshStandardMaterial color="#111827" roughness={0.9} />
          </mesh>

          <mesh position={[-wheelX, wheelY, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[wheelRadius * 0.45, wheelRadius * 0.45, wheelThickness + 0.1, 18]} />
            <meshStandardMaterial color="#9CA3AF" metalness={0.75} roughness={0.3} />
          </mesh>
          <mesh position={[wheelX, wheelY, z]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
            <cylinderGeometry args={[wheelRadius * 0.45, wheelRadius * 0.45, wheelThickness + 0.1, 18]} />
            <meshStandardMaterial color="#9CA3AF" metalness={0.75} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function resolveTrailerSceneBounds(root: THREE.Object3D) {
  const bounds = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasMesh = false;

  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.name === "Plane" || !obj.visible) return;

    const geom = obj.geometry;
    if (!geom) return;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;

    meshBox.copy(geom.boundingBox).applyMatrix4(obj.matrixWorld);
    if (!hasMesh) {
      bounds.copy(meshBox);
      hasMesh = true;
      return;
    }
    bounds.union(meshBox);
  });

  return hasMesh ? bounds : null;
}

function resolveTrailerCargoBounds(root: THREE.Object3D) {
  const bounds = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasMesh = false;

  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.name !== "Cube" || !obj.visible) return;

    const geom = obj.geometry;
    if (!geom) return;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;

    meshBox.copy(geom.boundingBox).applyMatrix4(obj.matrixWorld);
    if (!hasMesh) {
      bounds.copy(meshBox);
      hasMesh = true;
      return;
    }
    bounds.union(meshBox);
  });

  if (hasMesh) return bounds;
  return resolveTrailerSceneBounds(root);
}

function TractorThirdAxleVisual() {
  const wheelRadius = TRACTOR_THIRD_AXLE_WHEEL_RADIUS;
  const wheelThickness = TRACTOR_THIRD_AXLE_WHEEL_THICKNESS;
  const halfTrack = TRACTOR_THIRD_AXLE_HALF_TRACK;
  const wheelY = TRACTOR_THIRD_AXLE_LOCAL_Y;
  const wheelZ = TRACTOR_THIRD_AXLE_LOCAL_Z;
  const beamRadius = Math.max(0.03, wheelRadius * 0.13);
  const beamLength = Math.max(0.2, halfTrack * 2 - wheelThickness * 1.4);
  const rimRadius = wheelRadius * 0.62;
  const hubRadius = wheelRadius * 0.38;
  const capRadius = wheelRadius * 0.2;
  const rimThickness = wheelThickness + 0.02;
  const capThickness = wheelThickness + 0.04;

  return (
    <group renderOrder={-1}>
      <mesh position={[0, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[beamRadius, beamRadius, beamLength, 16]} />
        <meshStandardMaterial color="#4B5563" metalness={0.65} roughness={0.35} />
      </mesh>

      <mesh position={[-halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 24]} />
        <meshStandardMaterial color="#111827" roughness={0.9} />
      </mesh>
      <mesh position={[halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelThickness, 24]} />
        <meshStandardMaterial color="#111827" roughness={0.9} />
      </mesh>

      <mesh position={[-halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[rimRadius, rimRadius, rimThickness, 24]} />
        <meshStandardMaterial
          color={TRACTOR_RIM_MAIN_COLOR}
          metalness={TRACTOR_RIM_MAIN_METALNESS}
          roughness={TRACTOR_RIM_MAIN_ROUGHNESS}
        />
      </mesh>
      <mesh position={[halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[rimRadius, rimRadius, rimThickness, 24]} />
        <meshStandardMaterial
          color={TRACTOR_RIM_MAIN_COLOR}
          metalness={TRACTOR_RIM_MAIN_METALNESS}
          roughness={TRACTOR_RIM_MAIN_ROUGHNESS}
        />
      </mesh>

      <mesh position={[-halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[hubRadius, hubRadius, capThickness, 20]} />
        <meshStandardMaterial
          color={TRACTOR_RIM_HUB_COLOR}
          metalness={TRACTOR_RIM_HUB_METALNESS}
          roughness={TRACTOR_RIM_HUB_ROUGHNESS}
        />
      </mesh>
      <mesh position={[halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[hubRadius, hubRadius, capThickness, 20]} />
        <meshStandardMaterial
          color={TRACTOR_RIM_HUB_COLOR}
          metalness={TRACTOR_RIM_HUB_METALNESS}
          roughness={TRACTOR_RIM_HUB_ROUGHNESS}
        />
      </mesh>

      <mesh position={[-halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[capRadius, capRadius, capThickness + 0.02, 18]} />
        <meshStandardMaterial
          color={TRACTOR_RIM_CAP_COLOR}
          metalness={TRACTOR_RIM_CAP_METALNESS}
          roughness={TRACTOR_RIM_CAP_ROUGHNESS}
        />
      </mesh>
      <mesh position={[halfTrack, wheelY, wheelZ]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[capRadius, capRadius, capThickness + 0.02, 18]} />
        <meshStandardMaterial
          color={TRACTOR_RIM_CAP_COLOR}
          metalness={TRACTOR_RIM_CAP_METALNESS}
          roughness={TRACTOR_RIM_CAP_ROUGHNESS}
        />
      </mesh>
    </group>
  );
}

function TrailerReferenceModel({ container }: { container: Container3DProps }) {
  const gltf = useGLTF(TRAILER_MODEL_URL) as { scene: THREE.Group };

  const trailerScene = useMemo(() => {
    const primary = gltf.scene.clone(true);
    const primaryBounds = resolveTrailerSceneBounds(primary);
    if (!primaryBounds) return primary;

    const eps = 0.001;
    const isOneSidedInX = primaryBounds.min.x >= -eps || primaryBounds.max.x <= eps;
    if (!isOneSidedInX) return primary;

    // Este modelo trae solo medio trailer; espejarlo evita que un lateral se vea "cortado".
    const mirrored = gltf.scene.clone(true);
    mirrored.scale.x = -1;

    const combined = new THREE.Group();
    combined.add(primary);
    combined.add(mirrored);
    return combined;
  }, [gltf.scene]);

  useEffect(() => {
    trailerScene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.name === "Plane") {
        obj.visible = false;
        return;
      }
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.raycast = () => null;

      const source = Array.isArray(obj.material) ? obj.material : [obj.material];
      const solid = source.map((mat) => {
        const cloned =
          mat && typeof (mat as THREE.Material).clone === "function"
            ? ((mat as THREE.Material).clone() as THREE.Material)
            : new THREE.MeshStandardMaterial({ color: "#9CA3AF" });
        cloned.transparent = false;
        cloned.opacity = 1;
        cloned.depthWrite = true;
        cloned.depthTest = true;
        // Este GLTF trae algunas caras con normales invertidas.
        // DoubleSide evita huecos visuales en un lateral del tractor.
        cloned.side = THREE.DoubleSide;
        return cloned;
      });

      obj.material = (Array.isArray(obj.material) ? solid : solid[0]) as any;
    });
  }, [trailerScene]);

  const bind = useMemo(() => {
    trailerScene.updateWorldMatrix(true, true);
    const cargoBox = resolveTrailerCargoBounds(trailerScene);
    const sceneBox = resolveTrailerSceneBounds(trailerScene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    if (!cargoBox) return null;
    cargoBox.getSize(size);
    cargoBox.getCenter(center);

    if (!sceneBox || size.x <= 0.0001 || size.y <= 0.0001 || size.z <= 0.0001) return null;

    const scale = Math.min(
      container.width / size.x,
      container.height / size.y,
      container.depth / size.z
    ) * 1.02; // un poco mas grande para que la carga quede visible dentro

    if (!Number.isFinite(scale) || scale <= 0) return null;

    const attachFront = TRAILER_ATTACH_SIDE === "front";
    // En "rear" queremos que el tractor apunte hacia el frente de la caja.
    const rotationY = attachFront ? 0 : Math.PI;
    // Acople real en quinta rueda: no usar el extremo del modelo (bumper), sino un punto
    // adelantado sobre el chasis para que la caja quede montada sobre la plataforma.
    const hitchRearLocalZ = sceneBox.min.z + size.z * TRAILER_HITCH_FROM_REAR_RATIO;
    const hitchFrontLocalZ = sceneBox.max.z - size.z * TRAILER_HITCH_FROM_REAR_RATIO;
    const hitchLocalY = sceneBox.min.y + size.y * TRAILER_HITCH_HEIGHT_RATIO;
    const hitchLocalZ = attachFront ? hitchFrontLocalZ : hitchRearLocalZ;
    const hitchOffset = new THREE.Vector3(0, hitchLocalY, hitchLocalZ)
      .applyEuler(new THREE.Euler(0, rotationY, 0))
      .multiplyScalar(scale);
    const frontPlaneZ = container.depth / 2;
    const rearPlaneZ = -container.depth / 2;
    const targetHitchZ = attachFront
      ? frontPlaneZ + TRAILER_HITCH_GAP
      : rearPlaneZ - TRAILER_HITCH_GAP;
    const zPosition = targetHitchZ - hitchOffset.z;
    const yPosition = TRAILER_HITCH_TARGET_Y - hitchOffset.y;

    return {
      scale,
      rotationY,
      position: [
        -center.x * scale,
        yPosition,
        // Anclar por punto de enganche real (hitch) evita invertir frente/rear.
        zPosition,
      ] as [number, number, number],
    };
  }, [container.width, container.height, container.depth, trailerScene]);

  if (!bind) return null;

  return (
    <group
      position={bind.position}
      rotation={[0, bind.rotationY, 0]}
      scale={[bind.scale, bind.scale, bind.scale]}
      renderOrder={-1}
    >
      <primitive object={trailerScene} />
      <TractorThirdAxleVisual />
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
  axleCount,
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
  const normalizedAxleCount = useMemo(
    () => clamp(Math.round(finite(axleCount, 3)), 1, 9),
    [axleCount]
  );

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
    const hasCollapsedExplicitLayout = (() => {
      if (normalized.length < 5) return false;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;
      for (const c of normalized) {
        const fp = effectiveFootprint(c);
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x + fp.d);
        minZ = Math.min(minZ, c.z);
        maxZ = Math.max(maxZ, c.z + fp.w);
      }
      const spanX = Math.max(0, maxX - minX);
      const spanZ = Math.max(0, maxZ - minZ);
      // If payload spans too little of the trailer footprint, rebalance with local packer.
      return spanX < containerBounds.depth * 0.35 && spanZ < containerBounds.width * 0.7;
    })();

    if (hasExplicitLayout && !hasCollapsedExplicitLayout) {
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
          <Container {...container} axleCount={normalizedAxleCount} />

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

