"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { CATEGORY_ACCENT, CATEGORY_LABEL } from "@/lib/defaults";
import { cn, formatDate } from "@/lib/utils";
import { ArrowUpRight, Beef, Droplet, Flame, Scale } from "lucide-react";
import { WeightChart } from "@/components/weight-chart";
import { LEGACY_EXERCISE_NAMES } from "@/lib/exercise-aliases";
import { getExerciseTutorialUrl } from "@/lib/tutorial";

export default function HistoryPage() {
  const { hydrated, state } = useStore();

  const workoutDates = useMemo(
    () =>
      Object.keys(state.workoutLogs)
        .filter((d) => {
          const log = state.workoutLogs[d];
          if (!log) return false;
          return (
            Object.keys(log.entries).length > 0 ||
            log.completedRest ||
            log.didOptional !== undefined ||
            log.recovery !== undefined
          );
        })
        .sort()
        .reverse(),
    [state.workoutLogs]
  );

  const foodDates = useMemo(
    () =>
      Object.keys(state.foodLogs)
        .filter((d) => {
          const f = state.foodLogs[d];
          return f && (f.waterMl > 0 || f.proteinG > 0 || f.calories > 0);
        })
        .sort()
        .reverse(),
    [state.foodLogs]
  );

  const weightDates = useMemo(
    () => Object.keys(state.weightLogs).sort().reverse(),
    [state.weightLogs]
  );

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const templateById = Object.fromEntries(
    state.settings.templates.map((t) => [t.id, t])
  );
  const exerciseNameById: Record<string, string> = {
    // Legacy ids that no longer appear in any current template — still
    // surface a readable label for historical logs.
    ...LEGACY_EXERCISE_NAMES,
  };
  for (const t of state.settings.templates) {
    for (const e of t.exercises) exerciseNameById[e.id] = e.name;
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Log
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          History
        </h1>
      </header>

      <Tabs defaultValue="workout">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="workout">Workout</TabsTrigger>
          <TabsTrigger value="food">Food</TabsTrigger>
          <TabsTrigger value="weight">Weight</TabsTrigger>
        </TabsList>

        <TabsContent value="workout" className="space-y-3">
          {workoutDates.length === 0 ? (
            <Empty hint="Log your first set on Today." />
          ) : (
            workoutDates.map((date) => {
              const log = state.workoutLogs[date];
              const t = templateById[log.templateId];
              return (
                <Card key={date} className="border-border/70">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-start justify-between gap-3 text-base">
                      <span className="flex flex-col">
                        <span>{formatDate(date)}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {t?.name ?? log.templateId}
                        </span>
                      </span>
                      {t && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[10px] uppercase tracking-widest",
                            CATEGORY_ACCENT[t.category]
                          )}
                        >
                          {CATEGORY_LABEL[t.category]}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {log.recovery && (
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Recovery: <span className="text-foreground">{log.recovery}</span>
                      </p>
                    )}
                    {log.completedRest && (
                      <p className="text-xs text-muted-foreground">
                        Rest day completed.
                      </p>
                    )}
                    {Object.entries(log.entries).map(([exId, sets]) => {
                      const exName = exerciseNameById[exId] ?? exId;
                      return (
                      <div key={exId} className="space-y-1.5">
                        <a
                          href={getExerciseTutorialUrl(exName)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:underline"
                          aria-label={`Open tutorial for ${exName}`}
                        >
                          <span>{exName}</span>
                          <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" />
                        </a>
                        <div className="flex flex-wrap gap-1.5">
                          {sets.map((s, i) => (
                            <span
                              key={i}
                              className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-xs"
                            >
                              {s.weight}
                              <span className="text-muted-foreground">
                                {state.settings.unit}
                              </span>{" "}
                              × {s.reps}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                    })}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="food" className="space-y-3">
          {foodDates.length === 0 ? (
            <Empty hint="Log water, protein, or calories on Today." />
          ) : (
            foodDates.map((date) => {
              const f = state.foodLogs[date];
              const targets = state.settings.targets;
              return (
                <Card key={date} className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      {formatDate(date)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-3 text-sm">
                    <Stat
                      icon={<Droplet className="h-3.5 w-3.5 text-sky-400" />}
                      label="Water"
                      value={`${(f.waterMl / 1000).toFixed(2)} L`}
                      hit={f.waterMl >= targets.waterMl}
                    />
                    <Stat
                      icon={<Beef className="h-3.5 w-3.5 text-orange-400" />}
                      label="Protein"
                      value={`${f.proteinG} g`}
                      hit={f.proteinG >= targets.proteinG}
                    />
                    <Stat
                      icon={<Flame className="h-3.5 w-3.5 text-rose-400" />}
                      label="Calories"
                      value={`${f.calories}`}
                      hit={f.calories > 0}
                    />
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="weight" className="space-y-3">
          {weightDates.length === 0 ? (
            <Empty hint="Tap the bodyweight pill on Today to log." />
          ) : (
            <>
              {weightDates.length >= 2 && (
                <Card className="border-border/70">
                  <CardContent className="py-4">
                    <WeightChart
                      logs={weightDates.map((d) => state.weightLogs[d])}
                      unit={state.settings.unit}
                    />
                  </CardContent>
                </Card>
              )}
              {weightDates.map((date) => {
                const w = state.weightLogs[date];
                return (
                  <Card key={date} className="border-border/70">
                    <CardContent className="flex items-center justify-between gap-3 py-3">
                      <span className="flex items-center gap-2">
                        <Scale className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{formatDate(date)}</span>
                      </span>
                      <span className="flex items-baseline gap-2 font-mono">
                        <span className="text-base font-semibold">
                          {w.weight} {state.settings.unit}
                        </span>
                        {w.bodyFatPct != null && (
                          <span className="text-xs text-muted-foreground">
                            · {w.bodyFatPct}% BF
                          </span>
                        )}
                      </span>
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Empty({ hint }: { hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <p className="text-base font-medium">Nothing here yet.</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hit: boolean;
}) {
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={cn("block font-mono text-sm", hit && "text-emerald-400")}
      >
        {value}
      </span>
    </div>
  );
}
