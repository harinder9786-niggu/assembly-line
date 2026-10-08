import {
  BELT_A,
  BELT_B,
  BELT_SPEED,
  DUR,
  ENTRY_ANG,
  FEMALE_H,
  GRIP_ABOVE,
  HOME,
  HOVER_CLEAR,
  INSPECT_X,
  MALE_START,
  MATE_ANG,
  MATE_YAW,
  PACK,
  PLATE_TOP,
  RECYCLE,
  SINK,
  TRACK_R,
  clamp,
  damp,
  lerp,
  lerpAng,
  lerpCCW,
  pointOnCircle,
  pressEnd,
  pressStart,
  rimPoint,
  seatMale,
  smooth,
  spiralPoint,
  timeToScan,
  trackPoint,
  transferEnd,
  type V3,
} from "./layout";

export type ReadoutKind = "idle" | "scan" | "ok" | "fail";

export type Job = {
  id: number;
  age: number;
  reject: boolean;
  alive: boolean;
  yaw0: number;
  didMate: boolean;
  counted: boolean;
  falling: boolean;
  settled: boolean;
  captured: boolean;
  settleAge: number;
  vy: number;
  tilt: number;
  female: V3;
  male: V3;
  maleVisible: boolean;
  femaleYaw: number;
  maleYaw: number;
  step1: boolean;
  step2: boolean;
  step3: boolean;
  step4: boolean;
};

const GRIP_ON = 0.58;
const RELEASE = 1.98;
const SCAN_TO = timeToScan();
export const POOL = 8;

export type Sim = {
  jobs: (Job | null)[];
  time: number;
  spawnAcc: number;
  fed: number;
  mated: number;
  accepted: number;
  rejected: number;
  arm: V3 & { grip: number };
  press: number;
  beam: number;
  stopper: number;
  readout: string;
  readoutKind: ReadoutKind;
  hold: number;
  focus: string;
};

let seq = 0;

function dwellOf(job: Job) {
  const tOn = job.age - transferEnd;
  if (tOn < SCAN_TO) return null;
  return tOn - SCAN_TO;
}

function eachJob(fn: (job: Job, index: number) => void) {
  for (let i = 0; i < sim.jobs.length; i++) {
    const job = sim.jobs[i];
    if (job) fn(job, i);
  }
}

function applyPose(job: Job) {
  const age = job.age;
  const nest = trackPoint(MATE_ANG);
  job.maleVisible = false;
  job.tilt = 0;
  job.step1 = age < pressStart;
  job.step2 = age >= MALE_START && age < pressEnd;
  job.step3 = false;
  job.step4 = false;

  if (age < DUR.beltA) {
    const t = age / DUR.beltA;
    job.female = {
      x: lerp(BELT_A.x0 + 0.45, BELT_A.x1, t),
      y: BELT_A.y,
      z: BELT_A.z,
    };
    job.femaleYaw = job.yaw0;
  } else if (age < DUR.beltA + DUR.drop) {
    const t = (age - DUR.beltA) / DUR.drop;
    const s = smooth(t);
    const rim = rimPoint(ENTRY_ANG);
    job.female = {
      x: lerp(BELT_A.x1, rim.x, s),
      z: lerp(BELT_A.z, rim.z, s),
      y: lerp(BELT_A.y, PLATE_TOP, s) + Math.sin(Math.PI * clamp(t, 0, 1)) * 0.16,
    };
    job.femaleYaw = job.yaw0;
  } else if (age < pressStart) {
    const t = (age - DUR.beltA - DUR.drop) / DUR.orient;
    const s = smooth(t);
    const ang = lerpCCW(ENTRY_ANG, MATE_ANG, s);
    const rad = lerp(BOWL.r - 0.08, TRACK_R, smooth(Math.min(1, t / 0.42)));
    const p = pointOnCircle(ang, rad);
    const vib = t < 0.84 ? 0.012 : 0;
    job.female = {
      x: p.x + Math.sin(age * 34) * vib,
      y: PLATE_TOP,
      z: p.z + Math.cos(age * 29) * vib,
    };
    job.femaleYaw = lerpAng(job.yaw0, MATE_YAW, s);
  } else if (age < pressEnd) {
    const t = (age - pressStart) / DUR.press;
    let press = 0;
    if (t < 0.28) press = smooth(t / 0.28);
    else if (t < 0.62) press = 1;
    else press = 1 - smooth((t - 0.62) / 0.38);
    job.female = { x: nest.x, y: PLATE_TOP, z: nest.z };
    job.femaleYaw = MATE_YAW;
    const hover = PLATE_TOP + FEMALE_H + HOVER_CLEAR;
    const seated = PLATE_TOP + FEMALE_H - SINK;
    job.male = { x: nest.x, y: lerp(hover, seated, press), z: nest.z };
    job.maleYaw = MATE_YAW;
    job.maleVisible = true;
    sim.press = press;
  } else if (age < transferEnd) {
    const raw = (age - pressEnd) / DUR.transfer;
    const t = smooth(raw);
    job.female = {
      x: lerp(nest.x, BELT_B.x0, t),
      z: lerp(nest.z, BELT_B.z, t),
      y: lerp(PLATE_TOP, BELT_B.y, t) + Math.sin(Math.PI * clamp(raw, 0, 1)) * 0.07,
    };
    job.femaleYaw = MATE_YAW;
    job.male = seatMale(job.female);
    job.maleYaw = MATE_YAW;
    job.maleVisible = true;
    job.step3 = true;
  } else {
    const tOn = age - transferEnd;
    job.femaleYaw = MATE_YAW;
    job.maleYaw = MATE_YAW;
    job.maleVisible = true;
    if (tOn < SCAN_TO) {
      job.female = { x: BELT_B.x0 - BELT_SPEED * tOn, y: BELT_B.y, z: BELT_B.z };
      job.step3 = true;
    } else {
      const dwell = tOn - SCAN_TO;
      job.step4 = true;
      if (!job.reject) {
        const hold = 0.5;
        if (dwell < hold) {
          job.female = { x: INSPECT_X, y: BELT_B.y, z: BELT_B.z };
        } else {
          const x = INSPECT_X - BELT_SPEED * (dwell - hold);
          if (x > BELT_B.x1 + 0.18) {
            job.female = { x, y: BELT_B.y, z: BELT_B.z };
          } else if (!job.falling && !job.settled) {
            job.female = { x: BELT_B.x1 + 0.05, y: BELT_B.y, z: BELT_B.z };
            job.falling = true;
            job.vy = 0.15;
          }
        }
      } else if (!job.captured && !job.falling && !job.settled) {
        job.female = { x: INSPECT_X, y: BELT_B.y, z: BELT_B.z };
        if (dwell >= GRIP_ON) job.captured = true;
      }
    }
    if (!job.captured && !job.falling) job.male = seatMale(job.female);
  }

  if (age >= MALE_START && age < pressStart) {
    const t = (age - MALE_START) / (pressStart - MALE_START);
    const p = spiralPoint(t);
    job.male = { x: p.x, y: p.y + Math.sin(age * 16) * 0.006, z: p.z };
    job.maleYaw = 0.15;
    job.maleVisible = true;
  }

  if (age >= pressEnd && !job.didMate) {
    job.didMate = true;
    sim.mated += 1;
  }
}

const BOWL = { r: 1.36 };

function createJob(age: number, reject: boolean): Job {
  const id = ++seq;
  const job: Job = {
    id,
    age,
    reject,
    alive: true,
    yaw0: ((id * 1.7) % 6.2) - 1.1,
    didMate: age >= pressEnd,
    counted: false,
    falling: false,
    settled: false,
    captured: false,
    settleAge: 0,
    vy: 0,
    tilt: 0,
    female: { x: 0, y: 0, z: 0 },
    male: { x: 0, y: 0, z: 0 },
    maleVisible: false,
    femaleYaw: 0,
    maleYaw: 0,
    step1: false,
    step2: false,
    step3: false,
    step4: false,
  };
  applyPose(job);
  return job;
}

function place(job: Job) {
  const i = sim.jobs.findIndex((slot) => slot === null);
  if (i >= 0) sim.jobs[i] = job;
}

function stick(job: Job) {
  job.female = { x: sim.arm.x, y: sim.arm.y - GRIP_ABOVE, z: sim.arm.z };
  job.male = seatMale(job.female);
  job.maleVisible = true;
  job.maleYaw = job.femaleYaw;
  job.tilt = 0.2;
}

function integrateFall(job: Job, dt: number) {
  job.vy -= 8 * dt;
  job.female.y += job.vy * dt;
  job.tilt = clamp(job.tilt + dt * 1.2, 0, 0.85);
  const goal = job.reject ? RECYCLE : PACK;
  job.female.x = damp(job.female.x, goal.x, 7, dt);
  job.female.z = damp(job.female.z, goal.z, 7, dt);
  if (job.female.y <= goal.yInner) {
    job.female.y = goal.yInner;
    job.vy = 0;
    job.falling = false;
    job.settled = true;
    job.settleAge = 0;
  }
  job.male = seatMale(job.female);
  job.maleVisible = true;
}

function focusFor(job: Job | null) {
  if (!job) return "Waiting for the next housing";
  if (job.falling && job.reject) return "Arm dropping a failed snaplock into recycle";
  if (job.falling) return "Accepted snaplock dropping into the pack bin";
  if (job.captured) return "Arm lifting a failed fit off belt B";
  if (job.age < DUR.beltA) return "Belt A carrying a female housing left to right";
  if (job.age < DUR.beltA + DUR.drop) return "Housing dropping onto the vibratory plate";
  if (job.age < pressStart) return "Plate turning the housing into the insert nest";
  if (job.age < pressEnd) return "Ram pressing the male plug into the housing";
  if (job.age < transferEnd) return "Mated snaplock transferring onto belt B";
  const dwell = dwellOf(job);
  if (dwell === null) return "Belt B carrying the snaplock right to left";
  if (dwell < 0.34) return "Vision gate scanning the fit";
  if (job.reject) return "Fit failed — arm will recycle this unit";
  return "Fit passed — continuing to the pack bin";
}

function leadJob() {
  let lead: Job | null = null;
  eachJob((job) => {
    if (!lead || job.id < lead.id) lead = job;
  });
  return lead;
}

function updateArm(dt: number) {
  let target: V3 = HOME;
  let grip = 0;
  let stopper = 0;
  let live: Job | null = null;
  eachJob((job) => {
    if (!job.reject || job.settled || job.falling) return;
    const d = dwellOf(job);
    if (d === null || d < 0) return;
    if (!live || job.id < live.id) live = job;
  });
  if (live) {
    const d = dwellOf(live) ?? 0;
    const grasp: V3 = { x: INSPECT_X, y: BELT_B.y + GRIP_ABOVE, z: BELT_B.z };
    const above: V3 = { x: grasp.x, y: grasp.y + 0.32, z: grasp.z };
    const lifted: V3 = { x: grasp.x, y: grasp.y + 0.46, z: grasp.z };
    const overBin: V3 = { x: RECYCLE.x, y: 1.28, z: RECYCLE.z };
    const inBin: V3 = { x: RECYCLE.x, y: RECYCLE.yInner + GRIP_ABOVE + 0.3, z: RECYCLE.z };
    stopper = d < GRIP_ON ? 1 : 0;
    if (d < 0.28) target = above;
    else if (d < GRIP_ON) target = grasp;
    else if (d < 0.78) {
      target = grasp;
      grip = 1;
    } else if (d < 1.08) {
      target = lifted;
      grip = 1;
    } else if (d < 1.7) {
      target = overBin;
      grip = 1;
    } else if (d < RELEASE) {
      target = inBin;
      grip = 1;
    }
  }
  const a = sim.arm;
  a.x = damp(a.x, target.x, 7.5, dt);
  a.y = damp(a.y, target.y, 7.5, dt);
  a.z = damp(a.z, target.z, 7.5, dt);
  a.grip = damp(a.grip, grip, 14, dt);
  sim.stopper = damp(sim.stopper, stopper, 10, dt);
}

function updateReadout(dt: number) {
  const hit: { found: boolean; text: string; kind: ReadoutKind; beam: number } = {
    found: false,
    text: "IDLE",
    kind: "idle",
    beam: 0,
  };
  eachJob((job) => {
    const d = dwellOf(job);
    if (d === null || d < 0 || d > 1.35 || job.falling) return;
    hit.found = true;
    if (d < 0.32) {
      hit.text = "SCAN";
      hit.kind = "scan";
      hit.beam = 1;
    } else if (job.reject) {
      hit.text = "FIT FAIL";
      hit.kind = "fail";
      hit.beam = d < 0.7 ? 1 : 0.25;
    } else {
      hit.text = "FIT OK";
      hit.kind = "ok";
      hit.beam = d < 0.62 ? 1 : 0;
    }
  });
  if (hit.found) {
    sim.readout = hit.text;
    sim.readoutKind = hit.kind;
    sim.hold = 1.1;
  } else if (sim.hold > 0) {
    sim.hold = Math.max(0, sim.hold - dt);
  } else {
    sim.readout = "IDLE";
    sim.readoutKind = "idle";
  }
  sim.beam = damp(sim.beam, hit.beam, 12, dt);
}

export const sim: Sim = {
  jobs: Array.from({ length: POOL }, () => null),
  time: 0,
  spawnAcc: 3.4,
  fed: 0,
  mated: 0,
  accepted: 0,
  rejected: 0,
  arm: { ...HOME, grip: 0 },
  press: 0,
  beam: 0,
  stopper: 0,
  readout: "IDLE",
  readoutKind: "idle",
  hold: 0,
  focus: "Belt A carrying a female housing left to right",
};

export function stepSim(dt: number) {
  if (dt <= 0) return;
  sim.time += dt;
  sim.spawnAcc += dt;
  sim.press = 0;

  if (sim.spawnAcc >= 6.8) {
    sim.spawnAcc -= 6.8;
    const reject = (seq + 1) % 3 === 0;
    place(createJob(0, reject));
    sim.fed += 1;
  }

  eachJob((job, index) => {
    job.age += dt;
    if (!job.captured && !job.falling && !job.settled) applyPose(job);
    else {
      job.step1 = false;
      job.step2 = false;
      job.step3 = false;
      job.step4 = true;
      const d = dwellOf(job);
      if (job.captured && !job.falling && d !== null && d >= RELEASE) {
        job.captured = false;
        job.falling = true;
        job.vy = -0.05;
      }
    }
    if (job.settled && job.counted) sim.jobs[index] = null;
  });

  updateArm(dt);

  eachJob((job) => {
    if (job.captured && !job.falling) stick(job);
    else if (job.falling) integrateFall(job, dt);
    else if (job.settled) {
      job.settleAge += dt;
      if (job.settleAge > 0.35 && !job.counted) {
        job.counted = true;
        job.alive = false;
        if (job.reject) sim.rejected += 1;
        else sim.accepted += 1;
      }
    }
  });

  sim.focus = focusFor(leadJob());
  updateReadout(dt);
  sim.arm.y = Math.max(0.72, sim.arm.y);
}

export function resetSim() {
  seq = 0;
  sim.jobs = Array.from({ length: POOL }, () => null);
  sim.time = 0.6;
  sim.spawnAcc = 3.4;
  sim.mated = 0;
  sim.accepted = 0;
  sim.rejected = 0;
  sim.arm = { ...HOME, grip: 0 };
  sim.press = 0;
  sim.beam = 0;
  sim.stopper = 0;
  sim.readout = "IDLE";
  sim.readoutKind = "idle";
  sim.hold = 0;
  const seeds = [
    createJob(DUR.beltA * 0.42, false),
    createJob(DUR.beltA + DUR.drop + DUR.orient * 0.48, false),
    createJob(transferEnd + SCAN_TO * 0.42, true),
  ];
  for (const job of seeds) place(job);
  sim.fed = seeds.length;
  sim.mated = seeds.filter((j) => j.didMate).length;
  sim.focus = focusFor(seeds[0] ?? null);
}

export function snapshot() {
  const steps: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  eachJob((j) => {
    steps[0] = steps[0] || j.step1;
    steps[1] = steps[1] || j.step2;
    steps[2] = steps[2] || j.step3;
    steps[3] = steps[3] || j.step4;
  });
  return {
    fed: sim.fed,
    mated: sim.mated,
    accepted: sim.accepted,
    rejected: sim.rejected,
    steps,
    focus: sim.focus,
  };
}

resetSim();
