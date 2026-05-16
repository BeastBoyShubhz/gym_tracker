"use client";

import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DAY_NAMES } from "@/lib/defaults";
import type { Sex, TemplateExercise, Unit, WorkoutTemplate } from "@/lib/types";
import { cn, todayISO } from "@/lib/utils";
import { DataIO } from "@/components/data-io";
import { HardcoreToggle } from "@/components/hardcore-toggle";
import {
  LIFESTYLE_OPTIONS,
  computeAge,
  computeBmr,
  computeMaintenance,
} from "@/lib/profile";

export default function SettingsPage() {
  const {
    hydrated,
    state,
    updateSettings,
    upsertTemplate,
    removeTemplate,
    resetAll,
  } = useStore();

  if (!hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const setUnit = (unit: Unit) => updateSettings({ unit });
  const setHeight = (cm: number) => updateSettings({ heightCm: cm });
  const setGoalWeight = (kg: number | undefined) =>
    updateSettings({ goalWeightKg: kg });
  const setMaintenance = (kcal: number) =>
    updateSettings({ maintenanceCalories: kcal });
  const setTarget = (
    key: "waterMl" | "proteinG" | "calories",
    value: number
  ) =>
    updateSettings({
      targets: { ...state.settings.targets, [key]: value },
    });
  const setDay = (day: number, templateId: string) =>
    updateSettings({
      schedule: { ...state.settings.schedule, [day]: templateId },
    });

  return (
    <div className="space-y-3">
      <header className="pb-1">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Configure
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Settings
        </h1>
      </header>

      <SettingsSection
        title="Profile"
        description="Used for BMI and to auto-compute maintenance calories."
        summary={`${state.settings.heightCm} cm · ${
          state.settings.sex ?? "—"
        }`}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="height">Height (cm)</Label>
            <Input
              id="height"
              inputMode="numeric"
              type="number"
              value={state.settings.heightCm}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n > 0) setHeight(n);
              }}
              className="font-mono text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dob">Date of birth</Label>
            <Input
              id="dob"
              type="date"
              value={state.settings.dob ?? ""}
              onChange={(e) => updateSettings({ dob: e.target.value || undefined })}
              className="font-mono text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sex</Label>
            <div className="flex gap-2">
              {(["male", "female"] as const).map((s) => (
                <Button
                  key={s}
                  variant={state.settings.sex === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateSettings({ sex: s })}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
          <LifestyleSelector
            current={state.settings.lifestyleFactor}
            onChange={(f) => updateSettings({ lifestyleFactor: f })}
          />
          <MaintenancePreview
            heightCm={state.settings.heightCm}
            dob={state.settings.dob}
            sex={state.settings.sex}
            lifestyleFactor={state.settings.lifestyleFactor}
            currentWeight={
              Object.values(state.weightLogs).sort(
                (a, b) => a.date.localeCompare(b.date)
              ).pop()?.weight ?? null
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Goals"
        summary={
          state.settings.goalWeightKg
            ? `Goal ${state.settings.goalWeightKg} ${state.settings.unit}`
            : "No goal set"
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-weight">
              Goal weight ({state.settings.unit}, optional)
            </Label>
            <Input
              id="goal-weight"
              inputMode="decimal"
              type="number"
              step="0.1"
              value={state.settings.goalWeightKg ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") {
                  setGoalWeight(undefined);
                  return;
                }
                const n = parseFloat(v);
                if (Number.isFinite(n) && n > 0) setGoalWeight(n);
              }}
              placeholder="e.g. 90"
              className="font-mono text-base"
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Display"
        summary={`Units · ${state.settings.unit.toUpperCase()}`}
      >
        <div className="space-y-1.5">
          <Label>Units</Label>
          <div className="flex gap-2">
            {(["kg", "lb"] as const).map((u) => (
              <Button
                key={u}
                variant={state.settings.unit === u ? "default" : "outline"}
                size="sm"
                onClick={() => setUnit(u)}
                className="uppercase"
              >
                {u}
              </Button>
            ))}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Daily targets"
        description="Hydration, protein, calorie goals for the food tracker."
        summary={`${state.settings.targets.calories} kcal · ${state.settings.targets.proteinG} g protein`}
      >
        <div className="space-y-3">
          <TargetRow
            label="Water (ml)"
            value={state.settings.targets.waterMl}
            onChange={(v) => setTarget("waterMl", v)}
          />
          <TargetRow
            label="Protein (g)"
            value={state.settings.targets.proteinG}
            onChange={(v) => setTarget("proteinG", v)}
          />
          <TargetRow
            label="Calories (kcal)"
            value={state.settings.targets.calories}
            onChange={(v) => setTarget("calories", v)}
          />
          <div className="space-y-1.5 border-t border-border/40 pt-3">
            <Label className="text-sm">
              Maintenance override (kcal)
              <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                optional
              </span>
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              value={state.settings.maintenanceCalories ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") {
                  updateSettings({ maintenanceCalories: undefined });
                  return;
                }
                const n = parseInt(v, 10);
                if (Number.isFinite(n) && n > 0) setMaintenance(n);
              }}
              placeholder="auto from profile"
              className="font-mono"
            />
            <p className="font-mono text-[10px] text-muted-foreground">
              Leave blank to auto-compute from profile (Mifflin-St Jeor ×
              lifestyle factor).
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Weekly schedule"
        description="Map each weekday to a workout template."
        summary={`${
          Object.values(state.settings.schedule).filter(Boolean).length
        }/7 days mapped`}
      >
        <div className="space-y-2">
          {DAY_NAMES.map((name, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-border/60 px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{name}</span>
                <span className="text-xs text-muted-foreground">
                  {state.settings.templates.find(
                    (t) => t.id === state.settings.schedule[i]
                  )?.name ?? "—"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {state.settings.templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDay(i, t.id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      state.settings.schedule[i] === t.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Workout templates"
        description="Edit names, exercises, target sets and rep ranges."
        summary={`${state.settings.templates.length} templates`}
      >
        <div className="space-y-3">
          {state.settings.templates.map((t) => (
            <TemplateEditor
              key={t.id}
              template={t}
              onChange={upsertTemplate}
              onRemove={() => removeTemplate(t.id)}
            />
          ))}
          <AddTemplate onAdd={upsertTemplate} />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Hardcore notifications"
        description="Push notifications that don't coddle you. Save the app to your home screen first."
      >
        <HardcoreToggle />
      </SettingsSection>

      <SettingsSection
        title="Backup & access"
        description="Export your data as JSON, import a backup, or lock the app."
      >
        <div className="space-y-3">
          <DataIO />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="Wipe all logs and restore defaults."
        tone="danger"
      >
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" size="sm">
                Reset everything
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all data?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes your workouts, food, weight history, and restores
                defaults. Cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={resetAll}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  summary,
  tone,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  summary?: string;
  tone?: "danger";
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card
      className={cn(
        "border-border/70 transition-colors",
        tone === "danger" && "border-destructive/30"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className={cn(
              "font-heading text-base font-medium leading-snug",
              tone === "danger" && "text-destructive"
            )}
          >
            {title}
          </span>
          {(description || summary) && (
            <span className="truncate text-xs text-muted-foreground">
              {summary || description}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/40 px-4 pb-4 pt-4">
          {description && summary && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          {children}
        </div>
      )}
    </Card>
  );
}

function TargetRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm">{label}</Label>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className="w-32 font-mono"
      />
    </div>
  );
}

function TemplateEditor({
  template,
  onChange,
  onRemove,
}: {
  template: WorkoutTemplate;
  onChange: (t: WorkoutTemplate) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const updateExercise = (
    idx: number,
    patch: Partial<TemplateExercise>
  ) => {
    const next = template.exercises.map((e, i) =>
      i === idx ? { ...e, ...patch } : e
    );
    onChange({ ...template, exercises: next });
  };

  const removeExercise = (idx: number) => {
    onChange({
      ...template,
      exercises: template.exercises.filter((_, i) => i !== idx),
    });
  };

  const addExercise = () => {
    const id = `${template.id}-ex-${Date.now()}`;
    onChange({
      ...template,
      exercises: [
        ...template.exercises,
        { id, name: "New exercise", sets: 3, repsLow: 8, repsHigh: 12 },
      ],
    });
  };

  return (
    <div className="rounded-lg border border-border/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
      >
        <span className="flex flex-col">
          <span className="font-medium">{template.name}</span>
          <span className="text-xs text-muted-foreground">
            {template.exercises.length} exercise
            {template.exercises.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Hide" : "Edit"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={template.name}
              onChange={(e) => onChange({ ...template, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Focus / notes</Label>
            <Input
              value={template.focus ?? ""}
              onChange={(e) => onChange({ ...template, focus: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            {template.exercises.map((ex, i) => (
              <div
                key={ex.id}
                className="space-y-2 rounded-md border border-border/60 p-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={ex.name}
                    onChange={(e) =>
                      updateExercise(i, { name: e.target.value })
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeExercise(i)}
                    className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove exercise"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumField
                    label="Sets"
                    value={ex.sets}
                    onChange={(v) => updateExercise(i, { sets: v })}
                  />
                  <NumField
                    label="Reps min"
                    value={ex.repsLow}
                    onChange={(v) => updateExercise(i, { repsLow: v })}
                  />
                  <NumField
                    label="Reps max"
                    value={ex.repsHigh}
                    onChange={(v) => updateExercise(i, { repsHigh: v })}
                  />
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addExercise}
              className="w-full"
            >
              <Plus className="h-4 w-4" /> Add exercise
            </Button>
          </div>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Delete template
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete &ldquo;{template.name}&rdquo;?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Removes this template and {template.exercises.length}{" "}
                  exercise
                  {template.exercises.length === 1 ? "" : "s"} from your
                  library. Workout history that referenced it stays intact.
                  Cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove}>
                  Delete template
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }}
        className="font-mono"
      />
    </label>
  );
}

function AddTemplate({
  onAdd,
}: {
  onAdd: (t: WorkoutTemplate) => void;
}) {
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id =
      trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now();
    onAdd({
      id,
      name: trimmed,
      category: "push",
      exercises: [],
    });
    setName("");
  };
  return (
    <div className="flex gap-2">
      <Input
        placeholder="New template name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <Button variant="outline" size="icon" onClick={submit} aria-label="Add">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function LifestyleSelector({
  current,
  onChange,
}: {
  current: number | undefined;
  onChange: (factor: number) => void;
}) {
  const isPreset = LIFESTYLE_OPTIONS.some((o) => o.factor === current);
  const [customMode, setCustomMode] = useState(
    current != null && !isPreset
  );
  const [customValue, setCustomValue] = useState(
    current != null && !isPreset ? String(current) : "1.31"
  );
  return (
    <div className="space-y-1.5">
      <Label>Lifestyle factor</Label>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {LIFESTYLE_OPTIONS.map((o) => (
          <button
            key={o.factor}
            type="button"
            onClick={() => {
              setCustomMode(false);
              onChange(o.factor);
            }}
            className={cn(
              "flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
              !customMode && current === o.factor
                ? "border-primary bg-primary/10"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="font-medium">{o.label}</span>
            <span className="font-mono text-[9px] text-muted-foreground">
              ×{o.factor} · {o.hint}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setCustomMode(true);
            const n = parseFloat(customValue);
            if (Number.isFinite(n) && n > 0) onChange(n);
          }}
          className={cn(
            "flex flex-col items-start rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
            customMode
              ? "border-primary bg-primary/10"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="font-medium">Custom</span>
          <span className="font-mono text-[9px] text-muted-foreground">
            type a multiplier
          </span>
        </button>
      </div>
      {customMode && (
        <Input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={customValue}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, "");
            setCustomValue(v);
            const n = parseFloat(v);
            if (Number.isFinite(n) && n > 0 && n < 5) onChange(n);
          }}
          className="font-mono"
        />
      )}
    </div>
  );
}

function MaintenancePreview({
  heightCm,
  dob,
  sex,
  lifestyleFactor,
  currentWeight,
}: {
  heightCm: number;
  dob?: string;
  sex?: Sex;
  lifestyleFactor?: number;
  currentWeight: number | null;
}) {
  const today = todayISO();
  const age = computeAge(dob, today);
  const incomplete =
    age == null || !sex || !lifestyleFactor || currentWeight == null;
  if (incomplete) {
    return (
      <div className="rounded-md border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
        Fill in DOB, sex, lifestyle factor, and log a bodyweight to see
        auto-computed maintenance.
      </div>
    );
  }
  const bmr = Math.round(computeBmr(currentWeight, heightCm, age, sex));
  const maint = computeMaintenance(
    currentWeight,
    heightCm,
    age,
    sex,
    lifestyleFactor
  );
  return (
    <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-300">
        Auto maintenance
      </p>
      <p className="font-mono text-2xl font-semibold text-emerald-300">
        {maint.toLocaleString()} kcal/d
      </p>
      <p className="font-mono text-[10px] text-muted-foreground">
        BMR {bmr} × {lifestyleFactor} · age {age}
      </p>
    </div>
  );
}
