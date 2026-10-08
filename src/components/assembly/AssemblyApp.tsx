import { useEffect, useState, type ComponentType } from "react";
import { Pause, Play, RotateCcw, Tag } from "lucide-react";
import type { CamId } from "./layout";
import { useHud } from "./hud";

const STEPS: { n: string; title: string; body: string; view: CamId }[] = [
  {
    n: "01",
    title: "Female infeed",
    body: "Belt A carries housings left to right and drops them onto the vibratory plate.",
    view: "infeed",
  },
  {
    n: "02",
    title: "Spiral insert",
    body: "The plate orients each housing. A spiral feeds the male plug and the ram presses it in.",
    view: "feeder",
  },
  {
    n: "03",
    title: "Belt B outfeed",
    body: "The mated snaplock transfers to the return belt and travels right to left.",
    view: "outfeed",
  },
  {
    n: "04",
    title: "Vision sort",
    body: "Camera and sensors check the fit. Passes fall into the pack bin. Fails are picked into recycle.",
    view: "inspect",
  },
];

const CAMERAS: { id: CamId; label: string }[] = [
  { id: "line", label: "Overview" },
  { id: "infeed", label: "Infeed" },
  { id: "feeder", label: "Insert" },
  { id: "outfeed", label: "Outfeed" },
  { id: "inspect", label: "Sort" },
  { id: "pack", label: "Pack" },
];

const SPEEDS = [0.5, 1, 2, 4];

export function AssemblyApp() {
  const [Scene, setScene] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const playing = useHud((s) => s.playing);
  const speed = useHud((s) => s.speed);
  const view = useHud((s) => s.view);
  const labels = useHud((s) => s.labels);
  const steps = useHud((s) => s.steps);
  const focus = useHud((s) => s.focus);
  const fed = useHud((s) => s.fed);
  const mated = useHud((s) => s.mated);
  const accepted = useHud((s) => s.accepted);
  const rejected = useHud((s) => s.rejected);
  const cad = useHud((s) => s.cad);

  useEffect(() => {
    let live = true;
    import("./scene")
      .then((mod) => {
        if (live) setScene(() => mod.CellScene);
      })
      .catch((err: unknown) => {
        if (live) setFailed(err instanceof Error ? err.message : "Could not start the 3D view");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const hud = useHud.getState();
      if (e.code === "Space") {
        e.preventDefault();
        hud.togglePlay();
      } else if (e.key === "r" || e.key === "R") hud.reset();
      else if (e.key === "l" || e.key === "L") hud.setLabels(!hud.labels);
      else if (e.key === "1") hud.setView("line");
      else if (e.key === "2") hud.setView("infeed");
      else if (e.key === "3") hud.setView("feeder");
      else if (e.key === "4") hud.setView("inspect");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cadLine =
    cad === "ready"
      ? "CAD loaded · male plug and female housing"
      : cad === "error"
        ? "CAD unreadable · stand-in parts on the line"
        : "Reading snaplock CAD";

  return (
    <main className="stage">
      <div className="viewport">{failed ? <p className="fail-note">{failed}</p> : Scene ? <Scene /> : null}</div>

      <header className="topbar">
        <div className="brand">
          <p className="kicker">Automation cell</p>
          <h1>Snaplock assembly</h1>
          <p className="focus" aria-live="polite">
            {focus}
          </p>
        </div>
        <div className="transport">
          <button type="button" className="icon-btn" onClick={() => useHud.getState().togglePlay()} aria-label={playing ? "Pause line" : "Run line"}>
            {playing ? <Pause /> : <Play />}
          </button>
          <button type="button" className="icon-btn" onClick={() => useHud.getState().reset()} aria-label="Reset line">
            <RotateCcw />
          </button>
          <div className="speeds" role="group" aria-label="Line speed">
            {SPEEDS.map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={speed === value}
                onClick={() => useHud.getState().setSpeed(value)}
              >
                {value === 0.5 ? "0.5×" : `${value}×`}
              </button>
            ))}
          </div>
        </div>
      </header>

      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step.n}>
            <button type="button" className="step" aria-pressed={steps[i]} onClick={() => useHud.getState().setView(step.view)}>
              <span className="step-no">{step.n}</span>
              <span className="step-copy">
                <span className="step-title">{step.title}</span>
                <span className="step-body">{step.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <footer className="dock">
        <dl className="stats">
          <div>
            <dt>Fed</dt>
            <dd>{fed}</dd>
          </div>
          <div>
            <dt>Mated</dt>
            <dd>{mated}</dd>
          </div>
          <div>
            <dt>Packed</dt>
            <dd>{accepted}</dd>
          </div>
          <div>
            <dt>Recycle</dt>
            <dd>{rejected}</dd>
          </div>
        </dl>
        <div className="cameras" role="group" aria-label="Camera">
          {CAMERAS.map((cam) => (
            <button key={cam.id} type="button" className="chip" aria-pressed={view === cam.id} onClick={() => useHud.getState().setView(cam.id)}>
              {cam.label}
            </button>
          ))}
          <button type="button" className="chip icon-chip" aria-pressed={labels} onClick={() => useHud.getState().setLabels(!labels)}>
            <Tag />
            Labels
          </button>
        </div>
        <p className="meta">
          <span className="swatch swatch-f" />
          Female
          <span className="swatch swatch-m" />
          Male
          <span className="meta-note">{cadLine}. Every third unit is a forced fail so both paths stay visible. Drag to orbit.</span>
        </p>
      </footer>
    </main>
  );
}
