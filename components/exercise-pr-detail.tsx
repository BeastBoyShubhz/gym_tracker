"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Flame, LineChart as LineIcon } from "lucide-react";
import { getExerciseTutorialUrl } from "@/lib/tutorial";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import {
  allTimeBests,
  exerciseHistory,
  type SessionSummary,
} from "@/lib/pr";
import { cn, shortDate } from "@/lib/utils";
import type { TemplateExercise, Unit } from "@/lib/types";

type MetricKey =
  | "maxWeight"
  | "bestReps"
  | "best1RM"
  | "totalVolume"
  | "totalReps"
  | "completedSets";

type Metric = {
  key: MetricKey;
  label: string;
  value: (s: SessionSummary) => number;
  format: (n: number, unit: Unit) => string;
};

const METRICS: Metric[] = [
  {
    key: "maxWeight",
    label: "Best Weight",
    value: (s) => s.maxWeight,
    format: (n, unit) => `${round1(n)} ${unit}`,
  },
  {
    key: "bestReps",
    label: "Best Reps",
    value: (s) => s.bestRepsAtMaxWeight,
    format: (n) => `${n}`,
  },
  {
    key: "best1RM",
    label: "Est. 1RM",
    value: (s) => s.best1RM,
    format: (n, unit) => `${round1(n)} ${unit}`,
  },
  {
    key: "totalVolume",
    label: "Total Volume",
    value: (s) => s.totalVolume,
    format: (n, unit) => `${Math.round(n)} ${unit}`,
  },
  {
    key: "totalReps",
    label: "Total Reps",
    value: (s) => s.totalReps,
    format: (n) => `${n}`,
  },
  {
    key: "completedSets",
    label: "Set Completion",
    value: (s) => s.completedSets,
    format: (n) => `${n} sets`,
  },
];

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type PRType = "weight" | "rep" | "e1rm" | "volume";

function computePREvents(sessions: SessionSummary[]): Map<string, PRType[]> {
  const out = new Map<string, PRType[]>();
  let maxWeight = 0;
  let best1RM = 0;
  let bestVolume = 0;
  const repsAtWeight = new Map<number, number>();
  for (const s of sessions) {
    const events: PRType[] = [];
    let nextMaxWeight = maxWeight;
    let nextBest1RM = best1RM;
    let nextBestVolume = bestVolume;
    let repPR = false;
    if (s.maxWeight > maxWeight + 1e-6) {
      events.push("weight");
      nextMaxWeight = s.maxWeight;
    }
    if (s.best1RM > best1RM + 1e-6) {
      events.push("e1rm");
      nextBest1RM = s.best1RM;
    }
    if (s.totalVolume > bestVolume + 1e-6) {
      events.push("volume");
      nextBestVolume = s.totalVolume;
    }
    for (const set of s.sets) {
      const prev = repsAtWeight.get(set.weight) ?? 0;
      if (prev > 0 && set.reps > prev) repPR = true;
    }
    if (repPR) events.push("rep");
    if (events.length > 0) out.set(s.date, events);
    // Update running bests AFTER recording the event so the first session
    // never counts as a PR against itself.
    maxWeight = nextMaxWeight;
    best1RM = nextBest1RM;
    bestVolume = nextBestVolume;
    for (const set of s.sets) {
      const prev = repsAtWeight.get(set.weight) ?? 0;
      if (set.reps > prev) repsAtWeight.set(set.weight, set.reps);
    }
  }
  return out;
}

export function ExercisePRDetail({
  exercise,
  date,
  unit,
}: {
  exercise: Pick<TemplateExercise, "id" | "name" | "sets" | "repsHigh">;
  date: string;
  unit: Unit;
}) {
  const { state } = useStore();
  const sessions = useMemo(
    () => exerciseHistory(state, exercise.id),
    [state, exercise.id]
  );
  const past = useMemo(
    () => sessions.filter((s) => s.date <= date),
    [sessions, date]
  );
  const bests = useMemo(() => allTimeBests(past), [past]);
  const prEvents = useMemo(() => computePREvents(past), [past]);
  const [metricKey, setMetricKey] = useState<MetricKey>("maxWeight");
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const lastSession = past[past.length - 1];

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="View progress chart"
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        <LineIcon className="h-3.5 w-3.5" />
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-base">
            <a
              href={getExerciseTutorialUrl(exercise.name)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 underline-offset-4 hover:underline focus-visible:underline"
              aria-label={`Open tutorial for ${exercise.name}`}
            >
              <span>{exercise.name}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </a>
          </SheetTitle>
          <SheetDescription>
            All-time PRs and progression history
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {/* All-time best chips */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Best weight" value={bests.maxWeight > 0 ? `${round1(bests.maxWeight)} ${unit}` : "—"} />
            <Stat
              label="Reps at best"
              value={bests.bestRepsAtMaxWeight > 0 ? `${bests.bestRepsAtMaxWeight}` : "—"}
            />
            <Stat
              label="Est. 1RM"
              value={bests.best1RM > 0 ? `${round1(bests.best1RM)} ${unit}` : "—"}
            />
            <Stat
              label="Best volume"
              value={bests.bestVolume > 0 ? `${Math.round(bests.bestVolume)} ${unit}` : "—"}
            />
          </div>

          {lastSession && (
            <div className="rounded-lg border border-border/60 bg-card/50 p-3 text-xs">
              <p className="font-mono uppercase tracking-wider text-muted-foreground">
                Last session · {shortDate(lastSession.date)}
              </p>
              <p className="mt-1 text-foreground">
                {lastSession.completedSets}/{exercise.sets} sets · top{" "}
                {lastSession.maxWeight} {unit} × {lastSession.bestRepsAtMaxWeight}
                {" "}reps · est 1RM {round1(lastSession.best1RM)} {unit} · volume{" "}
                {Math.round(lastSession.totalVolume)} {unit}
              </p>
            </div>
          )}

          {/* Metric tabs */}
          <div className="flex flex-wrap gap-1.5">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetricKey(m.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  m.key === metricKey
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMetricKey("maxWeight")}
              className={cn(
                "rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-300"
              )}
              aria-label="Reset metric"
            >
              <Flame className="mr-1 inline h-3 w-3" /> PR events
            </button>
          </div>

          <MetricGraph
            sessions={past}
            metric={metric}
            unit={unit}
            prEvents={prEvents}
          />

          {/* PR events list */}
          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              PR events
            </p>
            <PREventList prEvents={prEvents} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

function MetricGraph({
  sessions,
  metric,
  unit,
  prEvents,
}: {
  sessions: SessionSummary[];
  metric: Metric;
  unit: Unit;
  prEvents: Map<string, PRType[]>;
}) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        No history yet — log this exercise to build a graph.
      </div>
    );
  }
  const values = sessions.map((s) => metric.value(s));
  const max = Math.max(...values);
  const min = Math.min(...values.filter((v) => v > 0), 0);
  const W = 320;
  const H = 140;
  const xPad = 28;
  const yPad = 14;
  const xFor = (i: number) =>
    sessions.length === 1
      ? W / 2
      : xPad + (i / (sessions.length - 1)) * (W - xPad * 1.5);
  const yFor = (v: number) => {
    if (max === min) return H / 2;
    return H - yPad - ((v - min) / (max - min)) * (H - yPad * 2);
  };
  const path = sessions
    .map((s, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(values[i])}`)
    .join(" ");

  const lastIdx = sessions.length - 1;

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-3">
      <p className="mb-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{metric.label}</span>
        <span className="tabular-nums text-foreground">
          {metric.format(values[lastIdx], unit)}
        </span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        aria-label={`${metric.label} history`}
      >
        <path
          d={path}
          fill="none"
          className="stroke-foreground"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {sessions.map((s, i) => {
          const isPR = prEvents.has(s.date);
          return (
            <g key={s.date}>
              <circle
                cx={xFor(i)}
                cy={yFor(values[i])}
                r={isPR ? 3.5 : 2}
                className={cn(
                  isPR ? "fill-amber-400" : "fill-foreground"
                )}
              />
              {isPR && (
                <circle
                  cx={xFor(i)}
                  cy={yFor(values[i])}
                  r={6}
                  className="fill-amber-400/20"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{shortDate(sessions[0].date)}</span>
        {sessions.length > 2 && (
          <span>{shortDate(sessions[Math.floor(sessions.length / 2)].date)}</span>
        )}
        <span>{shortDate(sessions[lastIdx].date)}</span>
      </div>
    </div>
  );
}

const PR_LABEL: Record<PRType, string> = {
  weight: "Weight PR",
  rep: "Rep PR",
  e1rm: "Strength PR",
  volume: "Volume PR",
};

const PR_TONE: Record<PRType, string> = {
  weight: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  rep: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  e1rm: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  volume: "border-violet-500/40 bg-violet-500/10 text-violet-300",
};

function PREventList({ prEvents }: { prEvents: Map<string, PRType[]> }) {
  const items = Array.from(prEvents.entries())
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 8);
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No PRs logged yet for this exercise.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {items.map(([date, types]) => (
        <li
          key={date}
          className="flex items-center justify-between gap-2 rounded-md border border-border/40 bg-card/30 px-2.5 py-1.5"
        >
          <span className="font-mono text-xs text-muted-foreground">
            {shortDate(date)}
          </span>
          <span className="flex flex-wrap justify-end gap-1">
            {types.map((t) => (
              <Badge
                key={t}
                className={cn(
                  "border font-mono text-[10px] uppercase tracking-wider",
                  PR_TONE[t]
                )}
              >
                {PR_LABEL[t]}
              </Badge>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
