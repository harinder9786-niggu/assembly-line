import { create } from "zustand";
import { resetSim, snapshot } from "./sim";
import type { CamId } from "./layout";

type HudState = {
  playing: boolean;
  speed: number;
  view: CamId;
  fly: boolean;
  labels: boolean;
  fed: number;
  mated: number;
  accepted: number;
  rejected: number;
  steps: [boolean, boolean, boolean, boolean];
  focus: string;
  cad: "loading" | "ready" | "error";
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  setView: (view: CamId) => void;
  setLabels: (labels: boolean) => void;
  setCad: (cad: HudState["cad"]) => void;
  publish: (snap: ReturnType<typeof snapshot>) => void;
  reset: () => void;
};

const initial = snapshot();

export const useHud = create<HudState>((set) => ({
  playing: true,
  speed: 1,
  view: "line",
  fly: false,
  labels: true,
  fed: initial.fed,
  mated: initial.mated,
  accepted: initial.accepted,
  rejected: initial.rejected,
  steps: initial.steps,
  focus: initial.focus,
  cad: "loading",
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  setView: (view) => set({ view, fly: true }),
  setLabels: (labels) => set({ labels }),
  setCad: (cad) => set({ cad }),
  publish: (snap) =>
    set((s) => {
      if (
        s.fed === snap.fed &&
        s.mated === snap.mated &&
        s.accepted === snap.accepted &&
        s.rejected === snap.rejected &&
        s.focus === snap.focus &&
        s.steps[0] === snap.steps[0] &&
        s.steps[1] === snap.steps[1] &&
        s.steps[2] === snap.steps[2] &&
        s.steps[3] === snap.steps[3]
      ) {
        return s;
      }
      return {
        fed: snap.fed,
        mated: snap.mated,
        accepted: snap.accepted,
        rejected: snap.rejected,
        steps: snap.steps,
        focus: snap.focus,
      };
    }),
  reset: () => {
    resetSim();
    const snap = snapshot();
    set({
      fed: snap.fed,
      mated: snap.mated,
      accepted: snap.accepted,
      rejected: snap.rejected,
      steps: snap.steps,
      focus: snap.focus,
      playing: true,
    });
  },
}));
