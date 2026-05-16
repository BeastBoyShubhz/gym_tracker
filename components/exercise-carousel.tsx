"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ListTree, Save } from "lucide-react";
import type { TemplateExercise, Unit } from "@/lib/types";
import { ExerciseCard } from "@/components/exercise-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRestTimer } from "@/components/rest-timer";
import { useStore } from "@/lib/store";

type Props = {
  exercises: TemplateExercise[];
  date: string;
  unit: Unit;
};

const SWIPE_THRESHOLD = 60; // px to register a swipe
const VELOCITY_THRESHOLD = 0.3; // px/ms

export function ExerciseCarousel({ exercises, date, unit }: Props) {
  const count = exercises.length;
  const [rawIndex, setIndex] = useState(0);
  // Derive effective index — keeps state in sync when the template grows/shrinks
  // without triggering a setState-in-effect cascade.
  const index = count > 0 ? ((rawIndex % count) + count) % count : 0;
  // dragX: visible delta of current slide while user is dragging
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointerState = useRef<{
    id: number;
    startX: number;
    startY: number;
    startT: number;
    locked: "h" | "v" | null;
  } | null>(null);

  const wrap = useCallback(
    (n: number) => ((n % count) + count) % count,
    [count]
  );

  const goNext = useCallback(() => {
    setIndex((i) => wrap(i + 1));
    setDragX(0);
  }, [wrap]);
  const goPrev = useCallback(() => {
    setIndex((i) => wrap(i - 1));
    setDragX(0);
  }, [wrap]);
  const goTo = useCallback(
    (n: number) => {
      setIndex(wrap(n));
      setDragX(0);
    },
    [wrap]
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't initiate swipe drag on interactive elements (inputs, buttons, etc.)
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "input, textarea, button, select, a, [data-no-swipe], [role='button']"
      )
    ) {
      return;
    }
    pointerState.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: e.timeStamp,
      locked: null,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ps = pointerState.current;
    if (!ps || ps.id !== e.pointerId) return;
    const dx = e.clientX - ps.startX;
    const dy = e.clientY - ps.startY;
    if (ps.locked == null) {
      // Lock direction once movement exceeds a small threshold
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      ps.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      if (ps.locked === "h") {
        // capture pointer so we keep getting move events even off-element
        try {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      } else {
        // Vertical scroll: cancel this swipe entirely
        pointerState.current = null;
        setDragging(false);
        setDragX(0);
        return;
      }
    }
    if (ps.locked === "h") {
      e.preventDefault();
      setDragX(dx);
    }
  };

  const finishDrag = (clientX: number, t: number) => {
    const ps = pointerState.current;
    pointerState.current = null;
    setDragging(false);
    if (!ps || ps.locked !== "h") {
      setDragX(0);
      return;
    }
    const dx = clientX - ps.startX;
    const dt = Math.max(1, t - ps.startT);
    const velocity = dx / dt; // px/ms (signed)
    const passed =
      Math.abs(dx) > SWIPE_THRESHOLD ||
      Math.abs(velocity) > VELOCITY_THRESHOLD;
    if (passed) {
      if (dx < 0) goNext();
      else goPrev();
    } else {
      setDragX(0);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const ps = pointerState.current;
    if (!ps || ps.id !== e.pointerId) {
      pointerState.current = null;
      setDragging(false);
      setDragX(0);
      return;
    }
    finishDrag(e.clientX, e.timeStamp);
  };

  const onPointerCancel = () => {
    pointerState.current = null;
    setDragging(false);
    setDragX(0);
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't hijack when user is typing
      const a = document.activeElement;
      if (
        a &&
        (a.tagName === "INPUT" ||
          a.tagName === "TEXTAREA" ||
          (a as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
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

  // Width is measured at runtime so we can compute px translate
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

      {/* Swipe track */}
      <div
        ref={containerRef}
        className="relative overflow-hidden select-none touch-pan-y"
        style={{ touchAction: "pan-y" }}
      >
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className={cn(
            "flex w-full transition-transform",
            dragging ? "duration-0" : "duration-300 ease-out"
          )}
          style={{
            transform: `translate3d(${-trackWidth + dragX}px, 0, 0)`,
            width: trackWidth ? trackWidth * 3 : undefined,
          }}
        >
          <Slide width={trackWidth}>
            {prevExercise && (
              <ExerciseCard
                key={`prev-${prevExercise.id}`}
                exercise={prevExercise}
                date={date}
                unit={unit}
              />
            )}
          </Slide>
          <Slide width={trackWidth}>
            {current && (
              <ExerciseCard
                key={`cur-${current.id}`}
                exercise={current}
                date={date}
                unit={unit}
              />
            )}
          </Slide>
          <Slide width={trackWidth}>
            {nextExercise && (
              <ExerciseCard
                key={`next-${nextExercise.id}`}
                exercise={nextExercise}
                date={date}
                unit={unit}
              />
            )}
          </Slide>
        </div>
      </div>

      {/* Prev / Next controls */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="lg"
          onClick={goPrev}
          aria-label="Previous exercise"
          className="min-w-[44%] justify-start"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="truncate text-left">
            {prevExercise?.name ?? "Previous"}
          </span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={goNext}
          aria-label="Next exercise"
          className="min-w-[44%] justify-end"
        >
          <span className="truncate text-right">
            {nextExercise?.name ?? "Next"}
          </span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Sticky action bar */}
      <WorkoutActionBar
        date={date}
        total={count}
        onNext={goNext}
        currentExercise={current}
      />
    </div>
  );
}

function Slide({
  children,
  width,
}: {
  children: React.ReactNode;
  width: number;
}) {
  return (
    <div
      className="shrink-0 px-0.5"
      style={{ width: width || "100%" }}
    >
      {children}
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
  // For long lists collapse into a windowed view of dots
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

function WorkoutActionBar({
  date,
  total,
  onNext,
  currentExercise,
}: {
  date: string;
  total: number;
  onNext: () => void;
  currentExercise: TemplateExercise | undefined;
}) {
  const { state, markRestComplete } = useStore();
  const { start: startRest, active: timerActive } = useRestTimer();
  const log = state.workoutLogs[date];
  const completedRest = !!log?.completedRest;
  const totalSetsLogged = useMemo(() => {
    if (!log?.entries) return 0;
    return Object.values(log.entries).reduce(
      (sum, sets) => sum + sets.length,
      0
    );
  }, [log]);

  // Default rest preset; doubles as a quick-start shortcut
  const quickRest = 90;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 mx-auto max-w-2xl px-3"
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 4.25rem)",
      }}
    >
      <div className="pointer-events-auto rounded-2xl border border-border/60 bg-card/95 px-2 py-2 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 flex-col px-1">
            <span className="truncate font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {totalSetsLogged} sets logged
            </span>
            <span className="truncate text-xs font-semibold">
              {currentExercise?.name ?? "—"}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => startRest(quickRest)}
            disabled={timerActive}
            aria-label="Start rest timer"
            className="shrink-0"
            title="Start 90s rest"
          >
            <ListTree className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rest</span>
          </Button>
          <Button
            size="sm"
            variant={completedRest ? "default" : "secondary"}
            onClick={() => markRestComplete(date, !completedRest)}
            aria-label="Mark workout saved"
            className="shrink-0"
            title="Mark workout finished"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {completedRest ? "Saved" : "Save"}
            </span>
          </Button>
          <Button
            size="sm"
            onClick={onNext}
            aria-label="Next exercise"
            disabled={total <= 1}
            className="shrink-0"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
