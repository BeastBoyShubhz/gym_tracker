"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TemplateExercise, Unit } from "@/lib/types";
import { ExerciseCard } from "@/components/exercise-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  exercises: TemplateExercise[];
  date: string;
  unit: Unit;
};

const AXIS_LOCK_THRESHOLD = 10; // px before deciding horizontal vs vertical
const SWIPE_DISTANCE = 40; // user-specified threshold
const VELOCITY_THRESHOLD = 0.35; // px/ms
const MAX_ROTATION = 90; // full quarter-turn at edge
const ANIMATION_MS = 350;

function vibrate(ms: number) {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // ignore
  }
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    "input, textarea, select, button, a, [role='button'], [data-no-swipe]"
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function ExerciseCarousel({ exercises, date, unit }: Props) {
  const count = exercises.length;
  const [rawIndex, setIndex] = useState(0);
  const index = count > 0 ? ((rawIndex % count) + count) % count : 0;
  const reducedMotion = useReducedMotion();

  // Drag progress (-1 .. +1). Positive = dragging right (previous).
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointerState = useRef<{
    id: number;
    startX: number;
    startY: number;
    startT: number;
    startedOnInteractive: boolean;
    locked: "h" | "v" | null;
    captured: boolean;
  } | null>(null);

  const wrap = useCallback(
    (n: number) => ((n % count) + count) % count,
    [count]
  );

  const goNext = useCallback(() => {
    setIndex((i) => wrap(i + 1));
    setProgress(0);
    vibrate(15);
  }, [wrap]);
  const goPrev = useCallback(() => {
    setIndex((i) => wrap(i - 1));
    setProgress(0);
    vibrate(15);
  }, [wrap]);
  const goTo = useCallback(
    (n: number) => {
      setIndex(wrap(n));
      setProgress(0);
    },
    [wrap]
  );

  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setTrackWidth(el.clientWidth);
    });
    ro.observe(el);
    setTrackWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerState.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: e.timeStamp,
      startedOnInteractive: isInteractive(e.target),
      locked: null,
      captured: false,
    };
    setDragging(false);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ps = pointerState.current;
    if (!ps || ps.id !== e.pointerId) return;
    const dx = e.clientX - ps.startX;
    const dy = e.clientY - ps.startY;
    if (ps.locked == null) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < AXIS_LOCK_THRESHOLD && absY < AXIS_LOCK_THRESHOLD) return;
      if (absX > absY * 1.2 && !ps.startedOnInteractive) {
        ps.locked = "h";
        setDragging(true);
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          ps.captured = true;
        } catch {
          // ignore
        }
      } else {
        pointerState.current = null;
        setDragging(false);
        setProgress(0);
        return;
      }
    }
    if (ps.locked === "h") {
      e.preventDefault();
      // Normalise drag to [-1, +1] across the carousel width.
      const w = trackWidth || 1;
      const p = Math.max(-1, Math.min(1, dx / w));
      setProgress(p);
    }
  };

  const releaseCapture = (
    e: React.PointerEvent<HTMLDivElement>,
    ps: NonNullable<typeof pointerState.current>
  ) => {
    if (ps.captured) {
      try {
        (e.currentTarget as HTMLDivElement).releasePointerCapture(
          e.pointerId
        );
      } catch {
        // ignore
      }
    }
  };

  const finishDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    clientX: number,
    t: number
  ) => {
    const ps = pointerState.current;
    pointerState.current = null;
    setDragging(false);
    if (!ps) {
      setProgress(0);
      return;
    }
    releaseCapture(e, ps);
    if (ps.locked !== "h") {
      setProgress(0);
      return;
    }
    const dx = clientX - ps.startX;
    const dt = Math.max(1, t - ps.startT);
    const velocity = dx / dt;
    const passed =
      Math.abs(dx) > SWIPE_DISTANCE ||
      Math.abs(velocity) > VELOCITY_THRESHOLD;
    if (passed) {
      // Drag right (positive dx) advances to the next exercise — matches
      // the cube rotation: the face that visually rotates in during a
      // right-drag is the next exercise.
      if (dx > 0) goNext();
      else goPrev();
    } else {
      setProgress(0);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const ps = pointerState.current;
    if (!ps || ps.id !== e.pointerId) {
      pointerState.current = null;
      setDragging(false);
      setProgress(0);
      return;
    }
    finishDrag(e, e.clientX, e.timeStamp);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const ps = pointerState.current;
    if (ps) releaseCapture(e, ps);
    pointerState.current = null;
    setDragging(false);
    setProgress(0);
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const a = document.activeElement;
      if (
        a &&
        (a.tagName === "INPUT" ||
          a.tagName === "TEXTAREA" ||
          (a as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (ev.key === "ArrowRight") {
        ev.preventDefault();
        goNext();
      } else if (ev.key === "ArrowLeft") {
        ev.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  const current = exercises[index];
  const prevIdx = wrap(index - 1);
  const nextIdx = wrap(index + 1);
  const prevExercise = exercises[prevIdx];
  const nextExercise = exercises[nextIdx];

  // Drag-right (progress > 0) should rotate the cube so the *right* face
  // (the next exercise) comes into view — i.e. you visually see where
  // you're going. Drag-left brings the left face (previous) forward.
  const angle = progress * MAX_ROTATION;
  const halfWidth = trackWidth / 2;

  const transition = dragging
    ? "transform 0s"
    : `transform ${ANIMATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;

  return (
    <div className="space-y-3">
      {/* Top progress: counter + dots */}
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Exercise{" "}
          <span className="text-foreground">
            {count > 0 ? index + 1 : 0}
          </span>{" "}
          of <span className="text-foreground">{count}</span>
        </p>
        <CarouselDots count={count} active={index} onPick={goTo} />
      </div>

      {/* 3D cube track. Reduced-motion users get a plain slide. */}
      <div
        ref={containerRef}
        className="relative select-none"
        style={{
          touchAction: "pan-y",
          perspective: reducedMotion ? undefined : "1200px",
          height: reducedMotion ? "auto" : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {reducedMotion ? (
          <PlainSlide
            current={current}
            date={date}
            unit={unit}
            offset={progress * (trackWidth || 0)}
            transition={transition}
          />
        ) : (
          <CubeStage
            width={trackWidth}
            angle={angle}
            transition={transition}
            front={current}
            left={prevExercise}
            right={nextExercise}
            date={date}
            unit={unit}
            halfWidth={halfWidth}
          />
        )}
      </div>

      {/* Prev / Next */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={goPrev}
          aria-label="Previous exercise"
          className="h-12 justify-start gap-2 px-3"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" />
          <span className="flex min-w-0 flex-col text-left leading-tight">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Previous
            </span>
            <span className="truncate text-sm font-medium">
              {prevExercise?.name ?? "—"}
            </span>
          </span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={goNext}
          aria-label="Next exercise"
          className="h-12 justify-end gap-2 px-3"
        >
          <span className="flex min-w-0 flex-col text-right leading-tight">
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Next
            </span>
            <span className="truncate text-sm font-medium">
              {nextExercise?.name ?? "—"}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Button>
      </div>
    </div>
  );
}

function CubeStage({
  width,
  angle,
  transition,
  front,
  left,
  right,
  date,
  unit,
  halfWidth,
}: {
  width: number;
  angle: number;
  transition: string;
  front: TemplateExercise | undefined;
  left: TemplateExercise | undefined;
  right: TemplateExercise | undefined;
  date: string;
  unit: Unit;
  halfWidth: number;
}) {
  // Measure intrinsic height of the front face so the stage matches it.
  const frontRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>(0);
  useEffect(() => {
    const el = frontRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [front?.id]);

  return (
    <div
      className="relative w-full"
      style={{
        height: height ? `${height}px` : undefined,
        minHeight: "12rem",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: `translate3d(0,0,${-halfWidth}px) rotateY(${angle}deg)`,
          transition,
          willChange: "transform",
        }}
      >
        <CubeFace
          rotation={0}
          width={width}
          halfWidth={halfWidth}
          ref={frontRef}
        >
          {front && (
            <ExerciseCard
              key={`front-${front.id}`}
              exercise={front}
              date={date}
              unit={unit}
            />
          )}
        </CubeFace>
        <CubeFace rotation={90} width={width} halfWidth={halfWidth} aria-hidden>
          {right && (
            <ExerciseCard
              key={`right-${right.id}`}
              exercise={right}
              date={date}
              unit={unit}
            />
          )}
        </CubeFace>
        <CubeFace rotation={-90} width={width} halfWidth={halfWidth} aria-hidden>
          {left && (
            <ExerciseCard
              key={`left-${left.id}`}
              exercise={left}
              date={date}
              unit={unit}
            />
          )}
        </CubeFace>
      </div>
    </div>
  );
}

type CubeFaceProps = {
  rotation: number;
  width: number;
  halfWidth: number;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>;

const CubeFace = ({
  rotation,
  width,
  halfWidth,
  children,
  ref,
  ...rest
}: CubeFaceProps & { ref?: React.Ref<HTMLDivElement> }) => {
  return (
    <div
      ref={ref}
      className="absolute inset-0"
      style={{
        width: width || "100%",
        backfaceVisibility: "hidden",
        transform: `rotateY(${rotation}deg) translate3d(0,0,${halfWidth}px)`,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

function PlainSlide({
  current,
  date,
  unit,
  offset,
  transition,
}: {
  current: TemplateExercise | undefined;
  date: string;
  unit: Unit;
  offset: number;
  transition: string;
}) {
  return (
    <div className="overflow-hidden">
      <div
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition,
          willChange: "transform",
        }}
      >
        {current && (
          <ExerciseCard
            key={current.id}
            exercise={current}
            date={date}
            unit={unit}
          />
        )}
      </div>
    </div>
  );
}

function CarouselDots({
  count,
  active,
  onPick,
}: {
  count: number;
  active: number;
  onPick: (i: number) => void;
}) {
  const MAX = 9;
  const indexes = useMemo(() => {
    if (count <= MAX) return Array.from({ length: count }, (_, i) => i);
    const half = Math.floor(MAX / 2);
    let start = Math.max(0, active - half);
    let end = start + MAX;
    if (end > count) {
      end = count;
      start = end - MAX;
    }
    return Array.from({ length: end - start }, (_, i) => start + i);
  }, [count, active]);
  if (count <= 1) return null;
  return (
    <div className="flex items-center gap-1.5">
      {indexes.map((i) => {
        const isActive = i === active;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Go to exercise ${i + 1}`}
            onClick={() => onPick(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              isActive
                ? "w-5 bg-foreground"
                : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"
            )}
          />
        );
      })}
    </div>
  );
}
