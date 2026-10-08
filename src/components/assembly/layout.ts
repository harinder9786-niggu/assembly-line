export type V3 = { x: number; y: number; z: number };

export const PART_SCALE = 0.024;
export const FEMALE_H = 6.55 * PART_SCALE;
export const MALE_H = 15.85 * PART_SCALE;
export const SINK = 0.055;
export const HOVER_CLEAR = 0.16;
export const GRIP_ABOVE = 0.16;

export const BOWL = { x: 1.22, z: 0, r: 1.36 };
export const TRACK_R = 0.78;
export const PLATE_TOP = 0.64;

export const BELT_A = { x0: -6.9, x1: 0.12, z: -1.68, y: 0.86, w: 0.8 };
export const BELT_B = { x0: 1.08, x1: -6.85, z: 1.68, y: 0.82, w: 0.8 };
export const BELT_SPEED = 1.12;

export const MATE_ANG = 1.02;
export const MATE_YAW = 0.35;

export const INSPECT_X = -2.5;
export const VISION_X = -2.35;

export const ARM = { x: -2.15, z: 3.28 };
export const HOME: V3 = { x: -2.1, y: 1.58, z: 2.72 };

export const RECYCLE = { x: -0.82, z: 3.5, yInner: 0.06 };
export const PACK = { x: -7.58, z: 1.68, yInner: 0.06 };

export const SPIRAL = { x: 2.88, z: -0.08 };

export const DUR = {
  beltA: 4.2,
  drop: 0.75,
  orient: 2.8,
  press: 1.25,
  transfer: 0.9,
} as const;

export const pressStart = DUR.beltA + DUR.drop + DUR.orient;
export const pressEnd = pressStart + DUR.press;
export const transferEnd = pressEnd + DUR.transfer;
export const MALE_START = DUR.beltA + DUR.drop * 0.2;

export const ENTRY_ANG = Math.atan2(BELT_A.z - BOWL.z, BELT_A.x1 - BOWL.x);

export function timeToScan() {
  return (BELT_B.x0 - INSPECT_X) / BELT_SPEED;
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smooth(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function damp(cur: number, goal: number, lambda: number, dt: number) {
  return lerp(cur, goal, 1 - Math.exp(-lambda * dt));
}

export function lerpAng(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Counter-clockwise sweep so housings travel the right-hand arc of the plate. */
export function lerpCCW(a: number, b: number, t: number) {
  let d = b - a;
  while (d < 0) d += Math.PI * 2;
  while (d >= Math.PI * 2) d -= Math.PI * 2;
  return a + d * t;
}

export function pointOnCircle(ang: number, radius: number) {
  return {
    x: BOWL.x + Math.cos(ang) * radius,
    z: BOWL.z + Math.sin(ang) * radius,
  };
}

export function trackPoint(ang = MATE_ANG) {
  return pointOnCircle(ang, TRACK_R);
}

export function rimPoint(ang = ENTRY_ANG) {
  return pointOnCircle(ang, BOWL.r - 0.04);
}

export function seatMale(f: V3): V3 {
  return { x: f.x, y: f.y + FEMALE_H - SINK, z: f.z };
}

/** Male-plug bottom along the spiral rail. u = 0 at the hopper, 1 at the nest. */
export function spiralPoint(u: number): V3 {
  const uu = clamp(u, 0, 1);
  const turns = 3.05;
  const ang = 0.35 + uu * Math.PI * 2 * turns;
  const r = 0.5 - uu * 0.05;
  const hy = lerp(2.2, 1.05, uu);
  const hx = SPIRAL.x + Math.cos(ang) * r;
  const hz = SPIRAL.z + Math.sin(ang) * r;
  if (uu <= 0.76) return { x: hx, y: hy, z: hz };
  const t = smooth((uu - 0.76) / 0.24);
  const nest = trackPoint(MATE_ANG);
  return {
    x: lerp(hx, nest.x, t),
    y: lerp(hy, PLATE_TOP + FEMALE_H + HOVER_CLEAR, t),
    z: lerp(hz, nest.z, t),
  };
}

export type CamId = "line" | "infeed" | "feeder" | "outfeed" | "inspect" | "pack";

export const VIEWS: Record<CamId, { pos: [number, number, number]; target: [number, number, number] }> = {
  line: { pos: [6.6, 5.15, 7.35], target: [-0.15, 0.55, 0.1] },
  infeed: { pos: [-1.6, 2.9, 1.15], target: [-3.4, 0.85, -1.55] },
  feeder: { pos: [4.55, 3.15, 2.35], target: [1.7, 0.9, 0.25] },
  outfeed: { pos: [1.4, 3.5, 5.15], target: [-2.4, 0.7, 1.55] },
  inspect: { pos: [-0.15, 2.55, 5.55], target: [-2.15, 0.85, 1.9] },
  pack: { pos: [-4.6, 2.45, 4.35], target: [-7.1, 0.55, 1.6] },
};
