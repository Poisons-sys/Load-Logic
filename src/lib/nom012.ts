type SupportedVehicleType =
  | "camion"
  | "remolque"
  | "caja_seca"
  | "refrigerado"
  | "plataforma"
  | "cisterna";

type VehicleNom012Input = {
  type?: string | null;
  axles?: number | null;
  maxWeight?: number | null;
  internalLength?: number | null;
};

const GROSS_LIMIT_BY_AXLES_KG: Record<number, number> = {
  2: 17000,
  3: 26000,
  4: 36000,
  5: 43000,
  6: 48000,
  7: 50000,
  8: 52000,
  9: 54000,
};

// Baselines operativos por tipo de unidad (kg de carga declarada).
// Esto evita falsos negativos cuando maxWeight representa capacidad de caja/remolque.
const TRAILER_PAYLOAD_LIMIT_BY_AXLES_KG: Record<Exclude<SupportedVehicleType, "camion">, Record<number, number>> = {
  caja_seca: { 2: 27000, 3: 35000, 4: 41000, 5: 46000 },
  refrigerado: { 2: 26000, 3: 34000, 4: 40000, 5: 45000 },
  plataforma: { 2: 30000, 3: 37000, 4: 43000, 5: 47000 },
  cisterna: { 2: 24000, 3: 33000, 4: 40000, 5: 46000 },
  remolque: { 2: 27000, 3: 35000, 4: 41000, 5: 46000 },
};

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeVehicleType(raw: string | null | undefined): SupportedVehicleType {
  const type = String(raw ?? "").trim().toLowerCase();
  if (
    type === "camion" ||
    type === "remolque" ||
    type === "caja_seca" ||
    type === "refrigerado" ||
    type === "plataforma" ||
    type === "cisterna"
  ) {
    return type;
  }
  return "remolque";
}

function resolveByAxles(table: Record<number, number>, axles: number) {
  if (table[axles] !== undefined) return table[axles];
  const keys = Object.keys(table).map((k) => Number(k)).filter(Number.isFinite).sort((a, b) => a - b);
  if (keys.length === 0) return null;
  const lower = [...keys].reverse().find((k) => k <= axles);
  if (lower !== undefined) return table[lower];
  return table[keys[0]];
}

function longTrailerBonusKg(type: SupportedVehicleType, internalLengthCm: number) {
  if (type === "cisterna" || type === "camion") return 0;
  if (internalLengthCm >= 1400) return 2500;
  if (internalLengthCm >= 1300) return 1500;
  return 0;
}

export function getVehicleNom012LimitKg(input: VehicleNom012Input) {
  const type = normalizeVehicleType(input.type);
  const axles = clampInt(Number(input.axles ?? 2), 2, 9);
  const lengthCm = Number(input.internalLength ?? 0);

  if (type === "camion") {
    return resolveByAxles(GROSS_LIMIT_BY_AXLES_KG, axles) ?? 36000;
  }

  const typeTable = TRAILER_PAYLOAD_LIMIT_BY_AXLES_KG[type] ?? TRAILER_PAYLOAD_LIMIT_BY_AXLES_KG.remolque;
  const baseLimit = resolveByAxles(typeTable, axles) ?? 30000;
  return baseLimit + longTrailerBonusKg(type, lengthCm);
}

export function isVehicleNom012Compliant(input: VehicleNom012Input) {
  const declaredMaxWeight = Number(input.maxWeight ?? 0);
  if (!Number.isFinite(declaredMaxWeight) || declaredMaxWeight <= 0) return true;
  const maxAllowed = getVehicleNom012LimitKg(input);
  return declaredMaxWeight <= maxAllowed;
}

