"use client";

import { useState } from "react";
import {
  Beef,
  Droplet,
  Flame,
  Leaf,
  Minus,
  Pencil,
  Plus,
  Trash2,
  Wheat,
  Droplets,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { QuickFoods } from "@/components/quick-foods";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FoodEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UNIT_LABEL } from "@/lib/foods";

const GLASS_ML = 250;

type ManualKind = "calories" | "protein" | "fiber" | "carbs" | "fats";

export function FoodTracker({ date }: { date: string }) {
  const { state, setFood, addFoodEntry } = useStore();
  const log = state.foodLogs[date] ?? {
    date,
    waterMl: 0,
    proteinG: 0,
    calories: 0,
    fiberG: 0,
    carbsG: 0,
    fatsG: 0,
  };
  const targets = state.settings.targets;
  const fiberG = log.fiberG ?? 0;
  const carbsG = log.carbsG ?? 0;
  const fatsG = log.fatsG ?? 0;
  const glasses = Math.floor(log.waterMl / GLASS_ML);
  const targetGlasses = Math.ceil(targets.waterMl / GLASS_ML);

  const addWater = (deltaMl: number) =>
    setFood(date, { waterMl: Math.max(0, log.waterMl + deltaMl) });

  return (
    <div className="space-y-4">
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <Droplet className="h-4 w-4 text-sky-400" />
              Water
            </span>
            <span className="font-mono text-sm">
              {(log.waterMl / 1000).toFixed(2)}
              <span className="text-muted-foreground">
                {" "}
                / {(targets.waterMl / 1000).toFixed(1)} L
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProgressBar
            value={log.waterMl}
            target={targets.waterMl}
            color="bg-sky-500"
          />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: targetGlasses }).map((_, i) => (
              <button
                key={i}
                onClick={() => addWater((i < glasses ? -1 : 1) * GLASS_ML)}
                aria-label={i < glasses ? "Remove glass" : "Add glass"}
                className={cn(
                  "h-9 w-7 rounded-md border transition-colors",
                  i < glasses
                    ? "border-sky-500/60 bg-sky-500/30"
                    : "border-border/60 bg-muted/30 hover:border-sky-500/40"
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => addWater(250)}>
              <Plus className="h-3.5 w-3.5" /> 250 ml
            </Button>
            <Button size="sm" variant="outline" onClick={() => addWater(500)}>
              <Plus className="h-3.5 w-3.5" /> 500 ml
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => addWater(-250)}
              className="ml-auto text-muted-foreground"
            >
              <Minus className="h-3.5 w-3.5" /> 250
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span>Today&apos;s totals</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {Math.round(log.calories)}/{targets.calories} kcal
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TotalRow
            icon={<Flame className="h-4 w-4 text-rose-400" />}
            label="Calories"
            unit="kcal"
            value={log.calories}
            target={targets.calories}
            color="bg-rose-500"
          />
          <TotalRow
            icon={<Beef className="h-4 w-4 text-orange-400" />}
            label="Protein"
            unit="g"
            value={log.proteinG}
            target={targets.proteinG}
            color="bg-orange-500"
          />
          <TotalRow
            icon={<Wheat className="h-4 w-4 text-amber-400" />}
            label="Carbs"
            unit="g"
            value={carbsG}
            target={targets.carbsG ?? 280}
            color="bg-amber-500"
          />
          <TotalRow
            icon={<Droplets className="h-4 w-4 text-yellow-300" />}
            label="Fats"
            unit="g"
            value={fatsG}
            target={targets.fatsG ?? 70}
            color="bg-yellow-400"
          />
          <TotalRow
            icon={<Leaf className="h-4 w-4 text-emerald-400" />}
            label="Fibre"
            unit="g"
            value={fiberG}
            target={targets.fiberG ?? 30}
            color="bg-emerald-500"
          />
          <ManualAdd
            onAdd={(kind, amount) => {
              const isCal = kind === "calories";
              const name = `Manual ${
                kind === "calories" ? "calories" : kind
              }`;
              addFoodEntry(date, {
                source: "manual",
                name,
                amount,
                unit: isCal ? "kcal" : "g",
                calories: isCal ? amount : 0,
                proteinG: kind === "protein" ? amount : 0,
                fiberG: kind === "fiber" ? amount : 0,
                carbsG: kind === "carbs" ? amount : 0,
                fatsG: kind === "fats" ? amount : 0,
              });
            }}
          />
        </CardContent>
      </Card>

      <TodayLog date={date} />

      <QuickFoods date={date} />
    </div>
  );
}

function TotalRow({
  icon,
  label,
  unit,
  value,
  target,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value: number;
  target: number;
  color: string;
}) {
  const display = unit === "g" ? Math.round(value * 10) / 10 : Math.round(value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          {icon}
          {label}
        </span>
        <span className="font-mono text-sm">
          {display}
          <span className="text-muted-foreground">
            {" "}
            / {target} {unit}
          </span>
        </span>
      </div>
      <ProgressBar value={value} target={target} color={color} />
    </div>
  );
}

const MANUAL_KINDS: Array<{ key: ManualKind; label: string; unit: string }> = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", unit: "g" },
  { key: "fats", label: "Fats", unit: "g" },
  { key: "fiber", label: "Fibre", unit: "g" },
];

function ManualAdd({
  onAdd,
}: {
  onAdd: (kind: ManualKind, amount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ManualKind>("calories");
  const [amt, setAmt] = useState("");

  const submit = () => {
    const n = parseFloat(amt);
    if (!Number.isFinite(n) || n <= 0) return;
    onAdd(kind, n);
    setAmt("");
    setOpen(false);
  };

  const currentUnit = MANUAL_KINDS.find((k) => k.key === kind)?.unit ?? "g";

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" /> Manual entry
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Manual entry</DialogTitle>
              <DialogDescription>
                Track a single macro without picking a food.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-1.5">
                {MANUAL_KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => setKind(k.key)}
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                      kind === k.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-amt">Amount ({currentUnit})</Label>
                <Input
                  id="manual-amt"
                  inputMode="decimal"
                  type="number"
                  value={amt}
                  onChange={(e) =>
                    setAmt(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                  autoFocus
                  className="font-mono text-base"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!amt}>
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function TodayLog({ date }: { date: string }) {
  const { state, removeFoodEntry, updateFoodEntry } = useStore();
  const log = state.foodLogs[date];
  const entries = log?.entries
    ? [...log.entries].sort((a, b) => a.ts - b.ts)
    : [];
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  // Pre-entry legacy data: totals exist but no entries array. Show a hint
  // that lets the user know totals came from the old system.
  const hasLegacy =
    !!log &&
    !log.entries &&
    (log.proteinG > 0 || log.calories > 0);

  if (!log || (entries.length === 0 && !hasLegacy)) {
    return (
      <Card className="border-border/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Logged today</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            Nothing logged yet. Tap a food below to start.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Logged today</span>
          <span className="font-mono text-xs text-muted-foreground">
            {entries.length} {entries.length === 1 ? "item" : "items"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasLegacy && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 font-mono text-[10px] text-amber-300">
            Totals from earlier app version. New logs will appear here as
            individual items.
          </p>
        )}
        {entries.map((e) => {
          const isRecipe = e.source === "recipe";
          return (
            <div
              key={e.id}
              className={cn(
                "flex items-center gap-2 overflow-hidden rounded-lg border p-2",
                isRecipe
                  ? "border-violet-500/50 bg-violet-500/5"
                  : "border-border/60 bg-card/40"
              )}
            >
              <span className="shrink-0 text-lg">{e.emoji ?? "🍽"}</span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
                  {e.name}
                  {isRecipe && (
                    <span className="shrink-0 rounded-md border border-violet-500/40 bg-violet-500/15 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-violet-300">
                      recipe
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {formatEntryAmount(e)} · {Math.round(e.calories)} kcal · P
                  {Math.round(e.proteinG * 10) / 10}
                  {(e.carbsG ?? 0) > 0 &&
                    ` · C${Math.round((e.carbsG ?? 0) * 10) / 10}`}
                  {(e.fatsG ?? 0) > 0 &&
                    ` · F${Math.round((e.fatsG ?? 0) * 10) / 10}`}
                  {(e.fiberG ?? 0) > 0 &&
                    ` · Fib${Math.round((e.fiberG ?? 0) * 10) / 10}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditing(e)}
                aria-label="Edit entry"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <span className="h-5 w-px shrink-0 bg-border/60" aria-hidden />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeFoodEntry(date, e.id)}
                aria-label="Remove entry"
                className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </CardContent>
      {editing && (
        <EditEntryDialog
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateFoodEntry(date, editing.id, patch);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function formatEntryAmount(e: FoodEntry): string {
  if (e.unit === "kcal") return `${e.amount} kcal`;
  if (e.unit === "piece") {
    return `${e.amount} ${e.amount === 1 ? "piece" : "pieces"}`;
  }
  return `${e.amount}${UNIT_LABEL[e.unit]}`;
}

function EditEntryDialog({
  entry,
  onClose,
  onSave,
}: {
  entry: FoodEntry;
  onClose: () => void;
  onSave: (patch: Partial<FoodEntry>) => void;
}) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [calories, setCalories] = useState(String(Math.round(entry.calories)));
  const [protein, setProtein] = useState(
    String(Math.round(entry.proteinG * 10) / 10)
  );
  const [fiber, setFiber] = useState(
    String(Math.round((entry.fiberG ?? 0) * 10) / 10)
  );
  const [carbs, setCarbs] = useState(
    String(Math.round((entry.carbsG ?? 0) * 10) / 10)
  );
  const [fats, setFats] = useState(
    String(Math.round((entry.fatsG ?? 0) * 10) / 10)
  );

  // For preset/custom/recipe entries we know macros per unit, so amount changes
  // scale macros proportionally. For manual we just edit directly.
  const isProportional = entry.source !== "manual" && entry.amount > 0;
  const calPer = isProportional ? entry.calories / entry.amount : 0;
  const proPer = isProportional ? entry.proteinG / entry.amount : 0;
  const fibPer = isProportional ? (entry.fiberG ?? 0) / entry.amount : 0;
  const carPer = isProportional ? (entry.carbsG ?? 0) / entry.amount : 0;
  const fatPer = isProportional ? (entry.fatsG ?? 0) / entry.amount : 0;

  const onAmountChange = (v: string) => {
    const cleaned = v.replace(/[^0-9.]/g, "");
    setAmount(cleaned);
    if (isProportional) {
      const n = parseFloat(cleaned);
      if (Number.isFinite(n) && n >= 0) {
        setCalories(String(Math.round(calPer * n)));
        setProtein(String(Math.round(proPer * n * 10) / 10));
        setFiber(String(Math.round(fibPer * n * 10) / 10));
        setCarbs(String(Math.round(carPer * n * 10) / 10));
        setFats(String(Math.round(fatPer * n * 10) / 10));
      }
    }
  };

  const submit = () => {
    const a = parseFloat(amount);
    const c = parseFloat(calories);
    const p = parseFloat(protein);
    const fi = parseFloat(fiber) || 0;
    const ca = parseFloat(carbs) || 0;
    const fa = parseFloat(fats) || 0;
    if (!Number.isFinite(a) || a < 0) return;
    if (!Number.isFinite(c) || c < 0) return;
    if (!Number.isFinite(p) || p < 0) return;
    if (fi < 0 || ca < 0 || fa < 0) return;
    onSave({
      amount: a,
      calories: c,
      proteinG: p,
      fiberG: fi,
      carbsG: ca,
      fatsG: fa,
    });
  };

  const showAmountInput = entry.unit !== "kcal";
  const disableMacros = isProportional && showAmountInput;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <span className="shrink-0">{entry.emoji ?? "🍽"}</span>
            <span className="truncate">{entry.name}</span>
          </DialogTitle>
          <DialogDescription>
            {isProportional
              ? "Macros scale automatically with amount."
              : "Edit each macro directly."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {showAmountInput && entry.unit !== "kcal" && (
            <div className="space-y-1.5">
              <Label htmlFor="ee-amt">
                Amount ({entry.unit === "piece" ? "pc" : UNIT_LABEL[entry.unit]})
              </Label>
              <Input
                id="ee-amt"
                inputMode="decimal"
                type="number"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                autoFocus
                className="font-mono text-base"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <MacroField
              id="ee-cal"
              label="Calories"
              value={calories}
              setValue={setCalories}
              disabled={disableMacros}
            />
            <MacroField
              id="ee-pro"
              label="Protein (g)"
              value={protein}
              setValue={setProtein}
              disabled={disableMacros}
            />
            <MacroField
              id="ee-car"
              label="Carbs (g)"
              value={carbs}
              setValue={setCarbs}
              disabled={disableMacros}
            />
            <MacroField
              id="ee-fat"
              label="Fats (g)"
              value={fats}
              setValue={setFats}
              disabled={disableMacros}
            />
            <MacroField
              id="ee-fib"
              label="Fibre (g)"
              value={fiber}
              setValue={setFiber}
              disabled={disableMacros}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MacroField({
  id,
  label,
  value,
  setValue,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  setValue: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
        disabled={disabled}
        className="font-mono"
      />
    </div>
  );
}

function ProgressBar({
  value,
  target,
  color,
}: {
  value: number;
  target: number;
  color: string;
}) {
  const pct = Math.min(100, Math.round((value / Math.max(target, 1)) * 100));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
