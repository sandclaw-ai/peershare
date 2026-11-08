/**
 * The gallery: every scenario, step by step. `?frame=<id>` renders one frame alone, at its
 * device's size, and runs its interaction script; the gallery shows those pages scaled down, so
 * dialogs, menus and their state stay inside each frame. Screenshots are taken of the same pages.
 */

import { ExternalLink } from "lucide-react";
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "../src/kit/primitives.js";
import { BrandMark } from "../src/kit/status.js";
import { type Device, type Frame, frames, type Scenario, scenarios } from "./scenarios.js";
import "./gallery.css";

export const SIZE: Record<Device, { width: number; height: number }> = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 },
};

const frameHeight = (f: Frame) => f.height ?? SIZE[f.device].height;

function FramePage({ frame }: { frame: Frame }) {
  useEffect(() => {
    document.title = `${frame.title} · PeerShare`;
    let live = true;
    void (async () => {
      await new Promise((r) => setTimeout(r, 150));
      await frame.play?.();
      // Let animations (dialogs, menus) settle before a screenshot.
      await new Promise((r) => setTimeout(r, 400));
      if (live) document.documentElement.dataset.ready = "true";
    })().catch((e) => {
      console.error(e);
      document.documentElement.dataset.ready = "error";
    });
    return () => {
      live = false;
    };
  }, [frame]);
  return <div className="h-full">{frame.render()}</div>;
}

/** A frame's page, scaled to the width it is given. */
function Preview({ frame }: { frame: Frame }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const { width } = SIZE[frame.device];
  const height = frameHeight(frame);
  useEffect(() => {
    const el = box.current;
    if (el == null) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div
      ref={box}
      className={
        frame.device === "phone" ? "mx-auto w-full max-w-[300px] min-w-0" : "w-full min-w-0"
      }
    >
      <div
        className="bg-background relative overflow-hidden rounded-lg border shadow-sm"
        style={{ height: height * scale }}
      >
        <iframe
          title={frame.title}
          src={`?frame=${frame.id}`}
          loading="lazy"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        />
      </div>
    </div>
  );
}

function FrameCard({ frame, index }: { frame: Frame; index: number }) {
  return (
    <figure className="grid min-w-0 content-start gap-3">
      <Preview frame={frame} />
      <figcaption className="grid gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">
            <span className="text-muted-foreground mr-1.5 tabular-nums">{index + 1}.</span>
            {frame.title}
          </p>
          <a
            href={`?frame=${frame.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={`Open ${frame.title} on its own`}
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        <p className="text-muted-foreground text-sm">{frame.caption}</p>
        {frame.commands != null && (
          <div className="flex flex-wrap gap-1">
            {frame.commands.map((c) => (
              <code key={c} className="bg-muted rounded px-1.5 py-0.5 text-[11px]">
                {c}
              </code>
            ))}
          </div>
        )}
      </figcaption>
    </figure>
  );
}

function ScenarioSection({ scenario }: { scenario: Scenario }) {
  const phones = scenario.frames.every((f) => f.device === "phone");
  return (
    <section id={scenario.id} className="grid scroll-mt-6 gap-5 border-b pb-12">
      <div className="grid max-w-2xl gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={scenario.actor === "Sharer" ? "default" : "secondary"}>
            {scenario.actor}
          </Badge>
          <span className="text-muted-foreground font-mono text-xs uppercase">{scenario.id}</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{scenario.title}</h2>
        <p className="text-muted-foreground">{scenario.summary}</p>
      </div>
      <div
        className={
          phones ? "grid gap-6 sm:grid-cols-2 xl:grid-cols-4" : "grid gap-8 md:grid-cols-2"
        }
      >
        {scenario.frames.map((f, i) => (
          <FrameCard key={f.id} frame={f} index={i} />
        ))}
      </div>
    </section>
  );
}

function Gallery() {
  const actors = ["Sharer", "Guest"] as const;
  return (
    <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
      <nav className="top-8 grid content-start gap-6 lg:sticky lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
        <BrandMark />
        {actors.map((actor) => (
          <div key={actor} className="grid gap-1">
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">{actor}</p>
            {scenarios
              .filter((s) => s.actor === actor)
              .map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-2 py-1 text-sm"
                >
                  {s.title}
                </a>
              ))}
          </div>
        ))}
      </nav>
      <main className="grid min-w-0 gap-12">
        <header className="grid max-w-3xl gap-3">
          <h1 className="text-4xl font-semibold tracking-tight">PeerShare, screen by screen</h1>
          <p className="text-muted-foreground text-lg">
            The main usage scenarios of PeerShare, from the code as it is: a Sharer opens services
            on their computer to guests they invite, over an httpeers mesh their own browser tab
            hosts. Every frame is a live page built from shadcn/ui components on Tailwind; open one
            to click through it.
          </p>
          <p className="text-muted-foreground text-sm">
            {scenarios.length} scenarios · {frames.length} frames · commands are those of{" "}
            <code className="bg-muted rounded px-1">@statewalker/peershare.share</code>
          </p>
        </header>
        {scenarios.map((s) => (
          <ScenarioSection key={s.id} scenario={s} />
        ))}
      </main>
    </div>
  );
}

const id = new URLSearchParams(location.search).get("frame");
const frame = id == null ? undefined : frames.find((f) => f.id === id);
const root = document.getElementById("root");
if (root == null) throw new Error("no #root");
createRoot(root).render(
  <StrictMode>{frame != null ? <FramePage frame={frame} /> : <Gallery />}</StrictMode>,
);
