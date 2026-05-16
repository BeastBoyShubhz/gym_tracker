"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useStore } from "@/lib/store";
import { todayISO, formatDate, cn } from "@/lib/utils";
import { CATEGORY_ACCENT, CATEGORY_LABEL, DAY_NAMES } from "@/lib/defaults";
import { ExerciseCarousel } from "@/components/exercise-carousel";
import { LEGS_TEMPLATE } from "@/lib/legs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { WeightPill } from "@/components/weight-pill";
import { HeightPill } from "@/components/height-pill";
import { StreakBar } from "@/components/streak-bar";
import { RecoveryCard } from "@/components/recovery-card";
import { FoodTracker } from "@/components/food-tracker";
import { BmiBar } from "@/components/bmi-bar";
import { SaveIndicator } from "@/components/save-indicator";
import { DateNav } from "@/components/date-nav";
import { DashboardPills } from "@/components/dashboard-pills";
import {
  foodStreak,
  lastNDayFlags,
  weightDelta,
  workoutStreak,
} from "@/lib/progress";
import { plannedTemplate, shiftCycleTo } from "@/lib/cycle";
import type { WorkoutTemplate } from "@/lib/types";

export default function HomePage() {
  const { hydrated, state, updateSettings, ensureWorkoutLog } = useStore();
  const [date, setDate] = useState<string>(() => todayISO());

  useEffect(() => {
    setDate(todayISO());
  }, []);

  const dayOfWeek = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [date]);

  const scheduledTemplateId = plannedTemplate(date, state.settings);
  const log = state.workoutLogs[date];
  // A log only "commits" the templateId if the user actually did something —
  // empty logs are phantoms from earlier auto-create behavior and should
  // defer to the cycle plan so future-shifting works.
  const isCommitted = !!(
    log &&
    (Object.keys(log.entries).length > 0 ||
      log.completedRest ||
      log.didOptional !== undefined ||
      log.recovery !== undefined)
  );
  const activeTemplateId = isCommitted ? log!.templateId : scheduledTemplateId;

  const template: WorkoutTemplate | undefined = state.settings.templates.find(
    (t) => t.id === activeTemplateId
  );

  const pickTemplate = (id: string) => {
    const shift = shiftCycleTo(date, id, state.settings);
    if (shift) {
      updateSettings(shift);
    } else {
      // Off-cycle template — commit it explicitly to today's log so it
      // overrides the plan (no future shift possible).
      ensureWorkoutLog(date, id);
    }
  };

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const ws = workoutStreak(state, date);
  const fs = foodStreak(state, date);
  const wFlags = lastNDayFlags(state, date, 7, "workout");
  const fFlags = lastNDayFlags(state, date, 7, "food");
  const { current: currentWeight } = weightDelta(state, date, 7);

  const isOptionalDay = template?.optional ?? false;
  const isRestDay = template?.category === "rest";
  const declinedOptional = isOptionalDay && log?.didOptional === false;
  const showWorkout = !isRestDay && !declinedOptional;

  return (
    <div className="space-y-5">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {DAY_NAMES[dayOfWeek]}
            </p>
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
              {template?.name ?? "Rest"}
            </h1>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(date)}
              <SaveIndicator />
            </p>
          </div>
          {template && (
            <div
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider",
                CATEGORY_ACCENT[template.category]
              )}
            >
              {CATEGORY_LABEL[template.category]}
            </div>
          )}
        </div>

        <DateNav date={date} onChange={(d) => setDate(d)} />

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <WeightPill date={date} />
            <HeightPill />
          </div>
          <BmiBar
            weightKg={
              state.settings.unit === "lb" && currentWeight != null
                ? currentWeight / 2.2046
                : currentWeight
            }
            heightCm={state.settings.heightCm}
          />
        </div>
        <StreakBar
          workoutStreak={ws}
          foodStreak={fs}
          workoutFlags={wFlags}
          foodFlags={fFlags}
        />
        <DashboardPills date={date} />
      </header>

      <Tabs defaultValue="workout">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="workout">Workout</TabsTrigger>
          <TabsTrigger value="food">Food</TabsTrigger>
          <TabsTrigger value="legs">Legs</TabsTrigger>
        </TabsList>
        <TabsContent value="workout" className="space-y-4">
          {template?.focus && (
            <p className="rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm text-muted-foreground">
              {template.focus}
            </p>
          )}

          <TemplateSwitcher
            current={activeTemplateId}
            onSelect={pickTemplate}
            templates={state.settings.templates}
          />

          {(isOptionalDay || isRestDay) && (
            <RecoveryCard date={date} optional={isOptionalDay} />
          )}

          {showWorkout && template && template.exercises.length > 0 ? (
            <ExerciseCarousel
              exercises={template.exercises}
              date={date}
              unit={state.settings.unit}
            />
          ) : isRestDay ? (
            <RestState />
          ) : null}
        </TabsContent>

        <TabsContent value="food" className="space-y-4">
          <FoodTracker date={date} />
        </TabsContent>

        <TabsContent value="legs" className="space-y-4">
          <p className="rounded-lg border border-border/40 bg-card/40 px-3 py-2 text-sm text-muted-foreground">
            {LEGS_TEMPLATE.focus}
          </p>
          <ExerciseCarousel
            exercises={LEGS_TEMPLATE.exercises}
            date={date}
            unit={state.settings.unit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateSwitcher({
  current,
  onSelect,
  templates,
}: {
  current: string;
  onSelect: (id: string) => void;
  templates: WorkoutTemplate[];
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {templates.map((t) => (
        <Button
          key={t.id}
          variant={t.id === current ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(t.id)}
          className="shrink-0"
        >
          {t.name}
        </Button>
      ))}
    </div>
  );
}

function RestState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        Recovery
      </p>
      <p className="mt-2 text-lg font-medium">Rest day. Eat. Sleep. Repeat.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick another template above if you want to lift today.
      </p>
    </div>
  );
}
