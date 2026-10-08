import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  ARM,
  BELT_A,
  BELT_B,
  BOWL,
  FEMALE_H,
  INSPECT_X,
  MALE_H,
  MATE_ANG,
  PACK,
  PART_SCALE,
  PLATE_TOP,
  RECYCLE,
  SPIRAL,
  TRACK_R,
  VISION_X,
  VIEWS,
  pointOnCircle,
  rimPoint,
  spiralPoint,
  trackPoint,
  type V3,
} from "./layout";
import { POOL, sim, stepSim, snapshot } from "./sim";
import { useHud } from "./hud";

const steel = new THREE.MeshStandardMaterial({
  color: "#3c444c",
  metalness: 0.72,
  roughness: 0.38,
  envMapIntensity: 0.8,
});
const steelDark = new THREE.MeshStandardMaterial({
  color: "#24282d",
  metalness: 0.6,
  roughness: 0.46,
  envMapIntensity: 0.7,
});
const aluminum = new THREE.MeshStandardMaterial({
  color: "#b7c0c6",
  metalness: 0.82,
  roughness: 0.28,
  envMapIntensity: 0.9,
});
const rubber = new THREE.MeshStandardMaterial({
  color: "#1a1d21",
  metalness: 0.08,
  roughness: 0.86,
});
const femMat = new THREE.MeshStandardMaterial({
  color: "#2c3338",
  metalness: 0.48,
  roughness: 0.4,
  envMapIntensity: 0.9,
});
const maleMat = new THREE.MeshStandardMaterial({
  color: "#d5dde2",
  metalness: 0.74,
  roughness: 0.26,
  envMapIntensity: 1,
});
const packMat = new THREE.MeshStandardMaterial({
  color: "#3e5348",
  metalness: 0.35,
  roughness: 0.55,
  envMapIntensity: 0.5,
});
const recycleMat = new THREE.MeshStandardMaterial({
  color: "#6a403c",
  metalness: 0.32,
  roughness: 0.55,
  envMapIntensity: 0.5,
});
const railMat = new THREE.MeshStandardMaterial({
  color: "#8e979e",
  metalness: 0.7,
  roughness: 0.32,
  envMapIntensity: 0.85,
});
const deckMat = new THREE.MeshStandardMaterial({
  color: "#4a5258",
  metalness: 0.55,
  roughness: 0.42,
  envMapIntensity: 0.6,
});

function prepareStl(geo: THREE.BufferGeometry) {
  geo.computeVertexNormals();
  geo.scale(PART_SCALE, PART_SCALE, PART_SCALE);
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return;
  geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geo.computeBoundingSphere();
}

function makeBeltTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.fillStyle = "#14171a";
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = "#2a3036";
  for (let i = 0; i < 8; i++) ctx.fillRect(i * 16, 0, 3, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function SimDriver() {
  const acc = useRef(0);
  useFrame((_, delta) => {
    const { playing, speed } = useHud.getState();
    const dt = Math.min(delta, 0.05) * (playing ? speed : 0);
    stepSim(dt);
    acc.current += delta;
    if (acc.current > 0.12) {
      acc.current = 0;
      useHud.getState().publish(snapshot());
    }
  });
  return null;
}

function Studio() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.62;
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target?: THREE.Vector3 } | null;
  const goalP = useMemo(() => new THREE.Vector3(), []);
  const goalT = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const { fly, view } = useHud.getState();
    const target = controls?.target;
    if (!fly || !target) return;
    const g = VIEWS[view];
    goalP.set(g.pos[0], g.pos[1], g.pos[2]);
    goalT.set(g.target[0], g.target[1], g.target[2]);
    const k = 1 - Math.exp(-3.2 * dt);
    camera.position.lerp(goalP, k);
    target.lerp(goalT, k);
    if (camera.position.distanceTo(goalP) < 0.05 && target.distanceTo(goalT) < 0.05) {
      useHud.setState({ fly: false });
    }
  });
  return null;
}

function Strut({ a, b, radius = 0.03, mat = steel }: { a: V3; b: V3; radius?: number; mat?: THREE.Material }) {
  const ref = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const from = new THREE.Vector3(a.x, a.y, a.z);
    const to = new THREE.Vector3(b.x, b.y, b.z);
    const dir = to.clone().sub(from);
    const len = Math.max(dir.length(), 0.001);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.scale.set(radius, len, radius);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.multiplyScalar(1 / len));
  }, [a.x, a.y, a.z, b.x, b.y, b.z, radius]);
  return (
    <mesh ref={ref} material={mat} castShadow>
      <cylinderGeometry args={[1, 1, 1, 10]} />
    </mesh>
  );
}

function Deck({ a, b, w = 0.5 }: { a: V3; b: V3; w?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const from = new THREE.Vector3(a.x, a.y, a.z);
    const to = new THREE.Vector3(b.x, b.y, b.z);
    const dir = to.clone().sub(from);
    const len = Math.max(dir.length(), 0.001);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.scale.set(w, 0.028, len);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.multiplyScalar(1 / len));
  }, [a.x, a.y, a.z, b.x, b.y, b.z, w]);
  return (
    <mesh ref={ref} material={deckMat} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function Conveyor({
  x0,
  x1,
  z,
  y,
  w,
  flow,
}: {
  x0: number;
  x1: number;
  z: number;
  y: number;
  w: number;
  flow: 1 | -1;
}) {
  const len = Math.abs(x1 - x0);
  const cx = (x0 + x1) / 2;
  const xMin = Math.min(x0, x1);
  const tex = useMemo(() => {
    const t = makeBeltTexture();
    t.repeat.set(len / 0.64, 1);
    return t;
  }, [len]);
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.92,
        metalness: 0.04,
        envMapIntensity: 0.25,
      }),
    [tex],
  );
  const arrows = useRef<THREE.Group>(null);
  useEffect(() => {
    return () => {
      tex.dispose();
      mat.dispose();
    };
  }, [tex, mat]);
  useFrame(() => {
    tex.offset.x = -flow * sim.time * 0.55;
    const group = arrows.current;
    if (!group) return;
    const entry = flow > 0 ? xMin : xMin + len;
    for (let i = 0; i < group.children.length; i++) {
      const u = ((i * len) / 5 + sim.time * 0.7) % len;
      const child = group.children[i];
      if (!child) continue;
      child.position.x = entry + flow * u;
      child.position.y = y + 0.028;
      child.position.z = z;
    }
  });
  const legs: number[] = [];
  for (let x = xMin + 0.55; x < xMin + len - 0.3; x += 1.5) legs.push(x);

  return (
    <group>
      <mesh position={[cx, y - 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat} receiveShadow>
        <planeGeometry args={[len, w * 0.86]} />
      </mesh>
      <mesh position={[cx, y - 0.06, z]} material={rubber} castShadow receiveShadow>
        <boxGeometry args={[len, 0.06, w]} />
      </mesh>
      <mesh position={[cx, y + 0.02, z - w / 2]} material={steelDark} castShadow>
        <boxGeometry args={[len, 0.1, 0.05]} />
      </mesh>
      <mesh position={[cx, y + 0.02, z + w / 2]} material={steelDark} castShadow>
        <boxGeometry args={[len, 0.1, 0.05]} />
      </mesh>
      {[x0, x1].map((x) => (
        <mesh key={x} position={[x, y - 0.02, z]} rotation={[Math.PI / 2, 0, 0]} material={aluminum} castShadow>
          <cylinderGeometry args={[0.07, 0.07, w * 0.92, 18]} />
        </mesh>
      ))}
      {legs.map((x) => (
        <group key={x}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[x, (y - 0.08) / 2, z + side * (w / 2 - 0.02)]} material={steel} castShadow>
              <cylinderGeometry args={[0.035, 0.045, y - 0.08, 10]} />
            </mesh>
          ))}
          <mesh position={[x, 0.04, z]} material={steelDark}>
            <boxGeometry args={[0.12, 0.04, w]} />
          </mesh>
        </group>
      ))}
      <group ref={arrows}>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} rotation={[0, 0, flow > 0 ? -Math.PI / 2 : Math.PI / 2]} material={aluminum}>
            <coneGeometry args={[0.045, 0.12, 4]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Plate() {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    group.current.rotation.y = sim.time * 0.55;
    group.current.position.y = 0.5 + Math.sin(sim.time * 38) * 0.003;
  });
  return (
    <group position={[BOWL.x, 0, BOWL.z]}>
      <mesh position={[0, 0.22, 0]} material={steelDark} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.44, 20]} />
      </mesh>
      <group ref={group} position={[0, 0.5, 0]}>
        <mesh position={[0, 0.07, 0]} material={steel} castShadow receiveShadow>
          <cylinderGeometry args={[BOWL.r, BOWL.r * 0.98, 0.14, 72]} />
        </mesh>
        <mesh position={[0, 0.145, 0]} rotation={[Math.PI / 2, 0, 0]} material={aluminum} castShadow>
          <torusGeometry args={[BOWL.r - 0.03, 0.032, 8, 72]} />
        </mesh>
        <mesh position={[0, 0.148, 0]} rotation={[Math.PI / 2, 0, 0]} material={steelDark}>
          <torusGeometry args={[TRACK_R + 0.16, 0.03, 8, 64]} />
        </mesh>
        <mesh position={[0, 0.16, 0]} material={steelDark} castShadow>
          <cylinderGeometry args={[0.26, 0.3, 0.08, 28]} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * TRACK_R, 0.146, Math.sin(a) * TRACK_R]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.1, 0.18, 20]} />
              <meshStandardMaterial color="#1b1f24" metalness={0.4} roughness={0.55} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function Spiral({ maleGeo }: { maleGeo: THREE.BufferGeometry | null }) {
  const tubes = useMemo(() => {
    const n = 84;
    const center: THREE.Vector3[] = [];
    const left: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = spiralPoint(u);
      const q = spiralPoint(Math.min(1, u + 0.01));
      const tx = q.x - p.x;
      const tz = q.z - p.z;
      const len = Math.hypot(tx, tz) || 1;
      const bx = -tz / len;
      const bz = tx / len;
      center.push(new THREE.Vector3(p.x, p.y - 0.04, p.z));
      left.push(new THREE.Vector3(p.x + bx * 0.1, p.y + 0.015, p.z + bz * 0.1));
      right.push(new THREE.Vector3(p.x - bx * 0.1, p.y + 0.015, p.z - bz * 0.1));
    }
    const tube = (pts: THREE.Vector3[], rad: number) =>
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 150, rad, 6, false);
    return { center: tube(center, 0.026), left: tube(left, 0.016), right: tube(right, 0.016) };
  }, []);
  useEffect(
    () => () => {
      tubes.center.dispose();
      tubes.left.dispose();
      tubes.right.dispose();
    },
    [tubes],
  );
  const top = spiralPoint(0);
  const braces = [0.14, 0.4, 0.66].map((u) => spiralPoint(u));
  const stock = maleGeo;
  return (
    <group>
      <mesh position={[SPIRAL.x, 1.05, SPIRAL.z]} material={steelDark} castShadow>
        <cylinderGeometry args={[0.07, 0.09, 2.1, 16]} />
      </mesh>
      <mesh geometry={tubes.center} material={railMat} castShadow />
      <mesh geometry={tubes.left} material={steel} castShadow />
      <mesh geometry={tubes.right} material={steel} castShadow />
      {braces.map((p, i) => (
        <Strut key={i} a={{ x: SPIRAL.x, y: p.y, z: SPIRAL.z }} b={{ x: p.x, y: p.y, z: p.z }} radius={0.02} />
      ))}
      <group position={[top.x, top.y + 0.38, top.z]}>
        <mesh position={[0, -0.16, 0]} material={steelDark} castShadow>
          <boxGeometry args={[0.52, 0.04, 0.52]} />
        </mesh>
        {[
          [0, 0.05, 0.24, 0.52, 0.42, 0.04],
          [0, 0.05, -0.24, 0.52, 0.42, 0.04],
          [0.24, 0.05, 0, 0.04, 0.42, 0.44],
        ].map((b, i) => (
          <mesh key={i} position={[b[0] ?? 0, b[1] ?? 0, b[2] ?? 0]} material={steel} castShadow>
            <boxGeometry args={[b[3], b[4], b[5]]} />
          </mesh>
        ))}
        {(stock ? [0, 1] : []).map((i) => (
          <mesh key={i} geometry={stock ?? undefined} material={maleMat} position={[0, -0.12 + i * 0.02, 0]} rotation={[0, i * 0.6, 0]} scale={0.82} />
        ))}
      </group>
    </group>
  );
}

function Press() {
  const ram = useRef<THREE.Mesh>(null);
  const nest = trackPoint(MATE_ANG);
  const column = pointOnCircle(MATE_ANG, BOWL.r + 0.32);
  useFrame(() => {
    const mesh = ram.current;
    if (!mesh) return;
    const maleBottom = THREE.MathUtils.lerp(
      PLATE_TOP + FEMALE_H + 0.16,
      PLATE_TOP + FEMALE_H - 0.055,
      sim.press,
    );
    const ramBottom = maleBottom + MALE_H + 0.01;
    const h = 0.28;
    mesh.position.set(nest.x, ramBottom + h / 2, nest.z);
    mesh.scale.y = 0.55 + sim.press * 0.45;
  });
  return (
    <group>
      <mesh position={[column.x, 0.7, column.z]} material={steelDark} castShadow>
        <boxGeometry args={[0.16, 1.4, 0.16]} />
      </mesh>
      <Strut
        a={{ x: column.x, y: 1.38, z: column.z }}
        b={{ x: nest.x, y: 1.38, z: nest.z }}
        radius={0.04}
        mat={steel}
      />
      <mesh ref={ram} material={aluminum} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.5, 16]} />
      </mesh>
      <mesh position={[nest.x, PLATE_TOP + 0.01, nest.z]} rotation={[-Math.PI / 2, 0, MATE_ANG]}>
        <planeGeometry args={[0.08, 0.28]} />
        <meshStandardMaterial color="#d7dbe0" metalness={0.2} roughness={0.45} />
      </mesh>
    </group>
  );
}

function OpenBin({
  x,
  z,
  w,
  d,
  h,
  mat,
  low,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  mat: THREE.Material;
  low?: "px" | "nx";
}) {
  const t = 0.045;
  const sideH = (which: "px" | "nx") => (low === which ? h * 0.42 : h);
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, t / 2, 0]} material={mat} receiveShadow castShadow>
        <boxGeometry args={[w, t, d]} />
      </mesh>
      <mesh position={[w / 2 - t / 2, sideH("px") / 2, 0]} material={mat} castShadow>
        <boxGeometry args={[t, sideH("px"), d]} />
      </mesh>
      <mesh position={[-w / 2 + t / 2, sideH("nx") / 2, 0]} material={mat} castShadow>
        <boxGeometry args={[t, sideH("nx"), d]} />
      </mesh>
      <mesh position={[0, h / 2, d / 2 - t / 2]} material={mat} castShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
      <mesh position={[0, h / 2, -d / 2 + t / 2]} material={mat} castShadow>
        <boxGeometry args={[w, h, t]} />
      </mesh>
    </group>
  );
}

function Vision() {
  const beam = useRef<THREE.Mesh>(null);
  const led = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#14171a",
        emissive: "#c5ccd1",
        emissiveIntensity: 0.4,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => led.dispose(), [led]);
  useFrame(() => {
    const mesh = beam.current;
    const mat = mesh?.material;
    if (mesh && mat instanceof THREE.MeshStandardMaterial) {
      mat.opacity = 0.15 + sim.beam * 0.75;
      mesh.visible = sim.beam > 0.04;
    }
    if (sim.readoutKind === "ok") led.emissive.set("#7d9a78");
    else if (sim.readoutKind === "fail") led.emissive.set("#b56860");
    else if (sim.readoutKind === "scan") led.emissive.set("#d7dbe0");
    else led.emissive.set("#8b939a");
    led.emissiveIntensity = sim.readoutKind === "idle" ? 0.35 : 1.15;
  });
  const z0 = BELT_B.z - 0.72;
  const z1 = BELT_B.z + 0.72;
  return (
    <group>
      {[z0, z1].map((z) => (
        <mesh key={z} position={[VISION_X, 0.92, z]} material={steelDark} castShadow>
          <boxGeometry args={[0.08, 1.84, 0.08]} />
        </mesh>
      ))}
      <mesh position={[VISION_X, 1.8, BELT_B.z]} material={steel} castShadow>
        <boxGeometry args={[0.1, 0.08, 1.52]} />
      </mesh>
      <mesh position={[VISION_X, 1.48, BELT_B.z]} material={steelDark} castShadow>
        <boxGeometry args={[0.22, 0.16, 0.28]} />
      </mesh>
      <mesh position={[VISION_X, 1.36, BELT_B.z]} rotation={[Math.PI / 2, 0, 0]} material={aluminum}>
        <cylinderGeometry args={[0.05, 0.07, 0.08, 16]} />
      </mesh>
      <mesh position={[VISION_X + 0.12, 1.52, BELT_B.z]} material={led}>
        <sphereGeometry args={[0.035, 16, 12]} />
      </mesh>
      {[z0 + 0.08, z1 - 0.08].map((z) => (
        <mesh key={z} position={[INSPECT_X + 0.35, BELT_B.y + 0.16, z]} material={aluminum} castShadow>
          <boxGeometry args={[0.08, 0.1, 0.08]} />
        </mesh>
      ))}
      <mesh ref={beam} position={[INSPECT_X + 0.35, BELT_B.y + 0.16, BELT_B.z]} visible={false}>
        <boxGeometry args={[0.012, 0.012, BELT_B.w]} />
        <meshStandardMaterial transparent opacity={0.2} emissive="#d7ddd8" color="#d7ddd8" toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Stopper() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const h = 0.02 + sim.stopper * 0.2;
    mesh.scale.y = h;
    mesh.position.y = BELT_B.y + h / 2;
  });
  return (
    <mesh ref={ref} position={[INSPECT_X - 0.2, BELT_B.y, BELT_B.z]} scale={[1, 0.02, 1]} material={aluminum} castShadow>
      <boxGeometry args={[0.035, 1, 0.5]} />
    </mesh>
  );
}

function aimBetween(mesh: THREE.Mesh | null, from: THREE.Vector3, to: THREE.Vector3, up: THREE.Vector3, dir: THREE.Vector3) {
  if (!mesh) return;
  dir.copy(to).sub(from);
  const len = Math.max(dir.length(), 0.001);
  dir.multiplyScalar(1 / len);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.scale.set(1, len, 1);
  mesh.quaternion.setFromUnitVectors(up, dir);
}

function Arm() {
  const yaw = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Mesh>(null);
  const fore = useRef<THREE.Mesh>(null);
  const gripL = useRef<THREE.Mesh>(null);
  const gripR = useRef<THREE.Mesh>(null);
  const palm = useRef<THREE.Mesh>(null);
  const elbow = useRef<THREE.Mesh>(null);
  const wrist = useRef<THREE.Mesh>(null);
  const tmp = useMemo(
    () => ({
      up: new THREE.Vector3(0, 1, 0),
      dir: new THREE.Vector3(),
      shoulder: new THREE.Vector3(),
      elbow: new THREE.Vector3(),
      wrist: new THREE.Vector3(),
    }),
    [],
  );
  useFrame(() => {
    const L1 = 1.05;
    const L2 = 0.92;
    const shoulderY = 0.52;
    const dx = sim.arm.x - ARM.x;
    const dz = sim.arm.z - ARM.z;
    if (yaw.current) yaw.current.rotation.y = Math.atan2(dx, dz);
    const dist = Math.hypot(dx, dz);
    const dy = sim.arm.y - shoulderY;
    const reach = Math.max(0.001, Math.hypot(dist, dy));
    const maxR = L1 + L2 - 0.02;
    const minR = Math.abs(L1 - L2) + 0.02;
    const r = THREE.MathUtils.clamp(reach, minR, maxR);
    const fit = r / reach;
    const rz = dist * fit;
    const ry = dy * fit;
    const elev = Math.atan2(ry, rz) + Math.acos(THREE.MathUtils.clamp((L1 * L1 + r * r - L2 * L2) / (2 * L1 * r), -1, 1));
    const shoulder = tmp.shoulder.set(0, shoulderY, 0);
    const elbowP = tmp.elbow.set(0, shoulderY + Math.sin(elev) * L1, Math.cos(elev) * L1);
    const wristP = tmp.wrist.set(0, shoulderY + ry, rz);
    aimBetween(upper.current, shoulder, elbowP, tmp.up, tmp.dir);
    aimBetween(fore.current, elbowP, wristP, tmp.up, tmp.dir);
    elbow.current?.position.copy(elbowP);
    wrist.current?.position.copy(wristP);
    const spread = 0.038 + (1 - sim.arm.grip) * 0.055;
    gripL.current?.position.set(-spread, wristP.y - 0.09, wristP.z);
    gripR.current?.position.set(spread, wristP.y - 0.09, wristP.z);
    palm.current?.position.set(0, wristP.y - 0.035, wristP.z);
  });
  return (
    <group position={[ARM.x, 0, ARM.z]}>
      <mesh position={[0, 0.16, 0]} material={steelDark} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.32, 20]} />
      </mesh>
      <mesh position={[0, 0.34, 0]} material={aluminum}>
        <cylinderGeometry args={[0.12, 0.12, 0.06, 20]} />
      </mesh>
      <group ref={yaw}>
        <mesh position={[0, 0.52, 0]} material={aluminum}>
          <sphereGeometry args={[0.09, 18, 14]} />
        </mesh>
        <mesh ref={upper} material={steelDark} castShadow>
          <cylinderGeometry args={[0.055, 0.07, 1, 14]} />
        </mesh>
        <mesh ref={elbow} material={aluminum}>
          <sphereGeometry args={[0.075, 16, 12]} />
        </mesh>
        <mesh ref={fore} material={steel} castShadow>
          <cylinderGeometry args={[0.042, 0.055, 1, 14]} />
        </mesh>
        <mesh ref={wrist} material={aluminum}>
          <sphereGeometry args={[0.055, 14, 12]} />
        </mesh>
        <mesh ref={palm} material={steelDark} castShadow>
          <boxGeometry args={[0.1, 0.05, 0.07]} />
        </mesh>
        <mesh ref={gripL} material={rubber} castShadow>
          <boxGeometry args={[0.022, 0.12, 0.05]} />
        </mesh>
        <mesh ref={gripR} material={rubber} castShadow>
          <boxGeometry args={[0.022, 0.12, 0.05]} />
        </mesh>
      </group>
    </group>
  );
}

function Tag({ position, children }: { position: [number, number, number]; children: string }) {
  return (
    <Html position={position} center distanceFactor={9} wrapperClass="tag-wrap" zIndexRange={[12, 0]}>
      <div className="tag">{children}</div>
    </Html>
  );
}

function Labels() {
  const on = useHud((s) => s.labels);
  const nest = trackPoint(MATE_ANG);
  const top = spiralPoint(0.08);
  if (!on) return null;
  return (
    <>
      <Tag position={[(BELT_A.x0 + BELT_A.x1) / 2, 1.35, BELT_A.z - 0.15]}>01 Female infeed</Tag>
      <Tag position={[BOWL.x, 1.55, BOWL.z - BOWL.r - 0.05]}>02 Vibratory plate</Tag>
      <Tag position={[top.x, top.y + 0.85, top.z]}>03 Male spiral</Tag>
      <Tag position={[nest.x + 0.15, 1.85, nest.z + 0.15]}>Insert ram</Tag>
      <Tag position={[-3.4, 1.28, BELT_B.z + 0.15]}>04 Belt B</Tag>
      <Tag position={[VISION_X, 2.15, BELT_B.z]}>Vision gate</Tag>
      <Tag position={[PACK.x, 0.95, PACK.z]}>Pack bin</Tag>
      <Tag position={[RECYCLE.x, 0.95, RECYCLE.z]}>Recycle</Tag>
    </>
  );
}

function Readout() {
  const ref = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    if (el.textContent !== sim.readout) el.textContent = sim.readout;
    if (el.dataset.kind !== sim.readoutKind) el.dataset.kind = sim.readoutKind;
  });
  return (
    <Html position={[VISION_X - 0.05, 1.95, BELT_B.z + 0.55]} center wrapperClass="tag-wrap" distanceFactor={8}>
      <div ref={ref} className="readout" data-kind="idle">
        IDLE
      </div>
    </Html>
  );
}

function Parts({ femaleGeo, maleGeo }: { femaleGeo: THREE.BufferGeometry | null; maleGeo: THREE.BufferGeometry | null }) {
  const femFallback = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.09, 0.11, FEMALE_H, 18);
    g.translate(0, FEMALE_H / 2, 0);
    return g;
  }, []);
  const maleFallback = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.08, 0.14, MALE_H, 18);
    g.translate(0, MALE_H / 2, 0);
    return g;
  }, []);
  return (
    <>
      {Array.from({ length: POOL }, (_, index) => (
        <PartSlot
          key={index}
          index={index}
          femaleGeo={femaleGeo ?? femFallback}
          maleGeo={maleGeo ?? maleFallback}
        />
      ))}
    </>
  );
}

function PartSlot({
  index,
  femaleGeo,
  maleGeo,
}: {
  index: number;
  femaleGeo: THREE.BufferGeometry;
  maleGeo: THREE.BufferGeometry;
}) {
  const female = useRef<THREE.Mesh>(null);
  const male = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const job = sim.jobs[index];
    const f = female.current;
    const m = male.current;
    if (!f || !m) return;
    if (!job || !job.alive) {
      f.visible = false;
      m.visible = false;
      return;
    }
    f.visible = true;
    f.position.set(job.female.x, job.female.y, job.female.z);
    f.rotation.set(job.tilt, job.femaleYaw, 0);
    m.visible = job.maleVisible;
    m.position.set(job.male.x, job.male.y, job.male.z);
    m.rotation.set(job.tilt * 0.35, job.maleYaw, 0);
  });
  return (
    <>
      <mesh ref={female} geometry={femaleGeo} material={femMat} castShadow />
      <mesh ref={male} geometry={maleGeo} material={maleMat} castShadow />
    </>
  );
}

function Cad({ onGeos }: { onGeos: (g: { female: THREE.BufferGeometry; male: THREE.BufferGeometry } | null) => void }) {
  useEffect(() => {
    let dead = false;
    let female: THREE.BufferGeometry | null = null;
    let male: THREE.BufferGeometry | null = null;
    const loader = new STLLoader();
    Promise.all([loader.loadAsync("/models/female.stl"), loader.loadAsync("/models/male.stl")])
      .then(([f, m]) => {
        prepareStl(f);
        prepareStl(m);
        if (dead) {
          f.dispose();
          m.dispose();
          return;
        }
        female = f;
        male = m;
        onGeos({ female: f, male: m });
        useHud.getState().setCad("ready");
      })
      .catch(() => {
        if (!dead) useHud.getState().setCad("error");
      });
    return () => {
      dead = true;
      female?.dispose();
      male?.dispose();
    };
  }, [onGeos]);
  return null;
}

function World({ geos }: { geos: { female: THREE.BufferGeometry; male: THREE.BufferGeometry } | null }) {
  const entry = rimPoint();
  const nest = trackPoint(MATE_ANG);
  const exit = pointOnCircle(Math.atan2(BELT_B.z - BOWL.z, BELT_B.x0 - BOWL.x), BOWL.r - 0.02);
  return (
    <>
      <SimDriver />
      <Studio />
      <CameraRig />
      <hemisphereLight args={["#d5dbe2", "#2a3036", 0.55]} />
      <ambientLight intensity={0.28} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={3.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={2}
        shadow-camera-far={36}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[-7, 6, -4]} intensity={0.45} />
      <fog attach="fog" args={["#101214", 16, 34]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#121518" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[-1.1, 0.012, 0.05]} receiveShadow>
        <boxGeometry args={[16.8, 0.024, 8.4]} />
        <meshStandardMaterial color="#1a1e22" roughness={0.92} metalness={0.08} />
      </mesh>
      <gridHelper args={[28, 28, "#2c3238", "#1b2024"]} position={[0, 0.03, 0]} />
      <Conveyor x0={BELT_A.x0} x1={BELT_A.x1} z={BELT_A.z} y={BELT_A.y} w={BELT_A.w} flow={1} />
      <Conveyor x0={BELT_B.x0} x1={BELT_B.x1} z={BELT_B.z} y={BELT_B.y} w={BELT_B.w} flow={-1} />
      <Deck a={{ x: BELT_A.x1, y: BELT_A.y, z: BELT_A.z }} b={{ x: entry.x, y: PLATE_TOP + 0.02, z: entry.z }} />
      <Deck a={{ x: exit.x, y: PLATE_TOP + 0.02, z: exit.z }} b={{ x: BELT_B.x0, y: BELT_B.y, z: BELT_B.z }} w={0.46} />
      <Plate />
      <Spiral maleGeo={geos?.male ?? null} />
      <Press />
      <Vision />
      <Stopper />
      <Arm />
      <OpenBin x={PACK.x} z={PACK.z} w={0.92} d={0.78} h={0.46} mat={packMat} low="px" />
      <OpenBin x={RECYCLE.x} z={RECYCLE.z} w={0.78} d={0.7} h={0.42} mat={recycleMat} />
      <mesh position={[-3.55, 0.52, 3.15]} material={steelDark} castShadow>
        <boxGeometry args={[0.42, 1.04, 0.28]} />
      </mesh>
      <Parts femaleGeo={geos?.female ?? null} maleGeo={geos?.male ?? null} />
      <Labels />
      <Readout />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={1.32}
        minPolarAngle={0.18}
        minDistance={2.2}
        maxDistance={18}
        target={[0.05, 0.55, 0.12]}
        onStart={() => useHud.setState({ fly: false })}
      />
    </>
  );
}

export function CellScene() {
  const [geos, setGeos] = useState<{ female: THREE.BufferGeometry; male: THREE.BufferGeometry } | null>(null);
  const onGeos = useMemo(() => (g: { female: THREE.BufferGeometry; male: THREE.BufferGeometry } | null) => setGeos(g), []);
  return (
    <Canvas
      shadows
      dpr={[1, 1.7]}
      camera={{ position: VIEWS.line.pos, fov: 34, near: 0.08, far: 60 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#101214");
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.12;
      }}
    >
      <Cad onGeos={onGeos} />
      <World geos={geos} />
    </Canvas>
  );
}
