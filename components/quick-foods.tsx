"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChefHat,
  History as HistoryIcon,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Sliders,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { useStore } from "@/lib/store";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  FOOD_PRESETS,
  UNIT_LABEL,
  calcMacros,
  type FoodCategory,
  type FoodPreset,
  type FoodUnit,
} from "@/lib/foods";
import type {
  CustomFood,
  FoodEntry,
  FoodOverride,
  Recipe,
} from "@/lib/types";
import { EmojiPicker, suggestEmoji } from "@/components/emoji-picker";
import { RecipesPanel, computeRecipeTotals } from "@/components/recipes-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addDays, cn } from "@/lib/utils";

type AnyFood = (FoodPreset & { __preset: true }) | (CustomFood & { __preset?: false });

type FoodLike = {
  id: string;
  name: string;
  emoji: string;
  unit: FoodUnit;
  defaultAmount: number;
  caloriesPer: number;
  proteinPer: number;
  fiberPer?: number;
  carbsPer?: number;
  fatsPer?: number;
  category?: FoodCategory;
  __isCustom?: boolean;
};

function applyOverride(
  preset: FoodPreset,
  override?: FoodOverride
): FoodPreset {
  if (!override) return preset;
  return { ...preset, ...override };
}

function entrySource(food: FoodLike): "preset" | "custom" {
  return food.__isCustom ? "custom" : "preset";
}

function makeEntryFromFood(
  food: FoodLike,
  amount: number
): Omit<FoodEntry, "id" | "ts" | "date"> {
  const macros = calcMacros(food, amount);
  return {
    source: entrySource(food),
    sourceFoodId: food.id,
    name: food.name,
    emoji: food.emoji ?? "🍽",
    amount,
    unit: food.unit,
    calories: macros.calories,
    proteinG: macros.protein,
    fiberG: macros.fiber,
    carbsG: macros.carbs,
    fatsG: macros.fats,
  };
}

function makeEntryFromRecipe(
  recipe: Recipe
): Omit<FoodEntry, "id" | "ts" | "date"> {
  const totals = computeRecipeTotals(recipe);
  return {
    source: "recipe",
    sourceFoodId: recipe.id,
    name: recipe.name,
    emoji: recipe.emoji ?? "🍽",
    amount: 1,
    unit: "piece",
    calories: totals.calories,
    proteinG: totals.protein,
    fiberG: totals.fiber,
    carbsG: totals.carbs,
    fatsG: totals.fats,
  };
}

export function QuickFoods({ date }: { date: string }) {
  const {
    state,
    addFoodEntry,
    addFoodEntries,
    copyFoodEntriesFrom,
    upsertCustomFood,
    removeCustomFood,
    setFoodOverride,
    upsertRecipe,
    removeRecipe,
  } = useStore();
  const customFoods = state.settings.customFoods ?? [];
  const overrides = state.settings.foodOverrides ?? {};
  const recipes = state.settings.recipes ?? [];

  const [pickedFood, setPickedFood] = useState<AnyFood | null>(null);
  const [editingPreset, setEditingPreset] = useState<FoodPreset | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCustoms, setShowCustoms] = useState(false);
  const [showRepeatConfirm, setShowRepeatConfirm] = useState(false);
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [search, setSearch] = useState("");

  const yesterday = state.foodLogs[addDays(date, -1)];
  const yesterdayEntries = yesterday?.entries ?? [];

  const allFoods = useMemo<FoodLike[]>(() => {
    const list: FoodLike[] = [];
    for (const p of FOOD_PRESETS) {
      list.push(applyOverride(p, overrides[p.id]));
    }
    for (const c of customFoods) {
      list.push({
        id: c.id,
        name: c.name,
        emoji: c.emoji ?? suggestEmoji(c.name, c.category),
        unit: c.unit,
        defaultAmount: c.defaultAmount,
        caloriesPer: c.caloriesPer,
        proteinPer: c.proteinPer,
        fiberPer: c.fiberPer,
        carbsPer: c.carbsPer,
        fatsPer: c.fatsPer,
        category: c.category,
        __isCustom: true,
      });
    }
    return list;
  }, [overrides, customFoods]);

  const foodById = useMemo(() => {
    const map = new Map<string, FoodLike>();
    for (const f of allFoods) map.set(f.id, f);
    return map;
  }, [allFoods]);

  const recents = useMemo<FoodLike[]>(() => {
    const score = new Map<string, { count: number; lastTs: number }>();
    for (let i = 0; i < 14; i++) {
      const d = addDays(date, -i);
      const log = state.foodLogs[d];
      if (!log?.entries) continue;
      for (const e of log.entries) {
        if (!e.sourceFoodId) continue;
        if (e.source === "recipe") continue;
        const cur = score.get(e.sourceFoodId);
        if (cur) {
          cur.count += 1;
          if (e.ts > cur.lastTs) cur.lastTs = e.ts;
        } else {
          score.set(e.sourceFoodId, { count: 1, lastTs: e.ts });
        }
      }
    }
    const ranked = [...score.entries()]
      .sort((a, b) => {
        const sa = a[1].count * 1000 + a[1].lastTs / 1e10;
        const sb = b[1].count * 1000 + b[1].lastTs / 1e10;
        return sb - sa;
      })
      .map(([id]) => foodById.get(id))
      .filter((x): x is FoodLike => !!x);
    return ranked.slice(0, 6);
  }, [state.foodLogs, foodById, date]);

  const grouped = useMemo(() => {
    const map = new Map<FoodCategory, FoodLike[]>();
    for (const c of CATEGORY_ORDER) map.set(c, []);
    for (const f of allFoods) {
      if (f.category) {
        const arr = map.get(f.category);
        if (arr) arr.push(f);
      }
    }
    return map;
  }, [allFoods]);

  const uncategorizedCustoms = useMemo(
    () => customFoods.filter((c) => !c.category),
    [customFoods]
  );

  const searchResults = useMemo<FoodLike[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allFoods
      .filter((f) => f.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allFoods, search]);

  const searchedRecipes = useMemo<Recipe[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return recipes.filter((r) => r.name.toLowerCase().includes(q));
  }, [recipes, search]);

  const quickAdd = (food: FoodLike) => {
    addFoodEntry(date, makeEntryFromFood(food, food.defaultAmount));
  };

  const quickAddRecipe = (recipe: Recipe) => {
    addFoodEntry(date, makeEntryFromRecipe(recipe));
  };

  const editPresetFor = (food: FoodLike) => {
    const original = FOOD_PRESETS.find((p) => p.id === food.id);
    if (!original) return;
    setEditingPreset(applyOverride(original, overrides[original.id]));
  };

  const customAmount = (food: FoodLike) => {
    if (food.__isCustom) {
      const cf = customFoods.find((x) => x.id === food.id);
      if (cf) {
        setPickedFood({ ...cf });
        return;
      }
    }
    setPickedFood({ ...(food as FoodPreset), __preset: true });
  };

  const handleRepeatYesterday = () => {
    if (!yesterdayEntries.length) return;
    copyFoodEntriesFrom(addDays(date, -1), date);
    setShowRepeatConfirm(false);
  };

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-emerald-400" />
            Foods
          </span>
          {yesterdayEntries.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowRepeatConfirm(true)}
              title={`Copy ${yesterdayEntries.length} item${
                yesterdayEntries.length === 1 ? "" : "s"
              } from yesterday`}
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Repeat yesterday
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search foods…"
            className="pl-8"
          />
        </div>

        {search.trim() ? (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Results
            </p>
            {searchResults.length === 0 && searchedRecipes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                No foods match &ldquo;{search.trim()}&rdquo;.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {searchedRecipes.map((r) => (
                  <RecipeChip
                    key={`r-${r.id}`}
                    recipe={r}
                    onTap={() => quickAddRecipe(r)}
                    onView={() => setViewingRecipe(r)}
                  />
                ))}
                {searchResults.map((f) => (
                  <FoodChip
                    key={f.id}
                    food={f}
                    mine={!!f.__isCustom}
                    edited={!f.__isCustom && !!overrides[f.id]}
                    onTap={() => quickAdd(f)}
                    onCustomAmount={() => customAmount(f)}
                    onEdit={
                      f.__isCustom ? undefined : () => editPresetFor(f)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {recipes.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <ChefHat className="h-3 w-3 text-violet-400" />
                  Recipes · meal templates
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {recipes.map((r) => (
                    <RecipeChip
                      key={`recipe-${r.id}`}
                      recipe={r}
                      onTap={() => quickAddRecipe(r)}
                      onView={() => setViewingRecipe(r)}
                    />
                  ))}
                </div>
              </div>
            )}

            {recents.length > 0 && (
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Recent · frequent
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {recents.map((f) => (
                    <FoodChip
                      key={`recent-${f.id}`}
                      food={f}
                      mine={!!f.__isCustom}
                      edited={!f.__isCustom && !!overrides[f.id]}
                      onTap={() => quickAdd(f)}
                      onCustomAmount={() => customAmount(f)}
                      onEdit={
                        f.__isCustom ? undefined : () => editPresetFor(f)
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            <Tabs defaultValue="protein">
              <TabsList className="w-full overflow-x-auto">
                {CATEGORY_ORDER.map((c) => (
                  <TabsTrigger key={c} value={c} className="text-xs">
                    {CATEGORY_LABEL[c]}
                  </TabsTrigger>
                ))}
              </TabsList>
              {CATEGORY_ORDER.map((c) => (
                <TabsContent key={c} value={c} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {grouped.get(c)?.map((f) => (
                      <FoodChip
                        key={f.id}
                        food={f}
                        mine={!!f.__isCustom}
                        edited={!f.__isCustom && !!overrides[f.id]}
                        onTap={() => quickAdd(f)}
                        onCustomAmount={() => customAmount(f)}
                        onEdit={
                          f.__isCustom ? undefined : () => editPresetFor(f)
                        }
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCustoms(true)}
            className="flex-1"
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            My foods ({uncategorizedCustoms.length})
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreate(true)}
            className="flex-1"
          >
            <Plus className="h-3.5 w-3.5" /> New custom
          </Button>
        </div>

        <RecipesPanel
          recipes={recipes}
          foodResolver={(id) => foodById.get(id)}
          onSave={upsertRecipe}
          onRemove={removeRecipe}
          onAddRecipeToLog={(r) =>
            addFoodEntry(date, makeEntryFromRecipe(r))
          }
          onAddIngredientsToLog={(r) => {
            const totals = computeRecipeTotals(r);
            // Add each ingredient as its own entry so the user gets a
            // per-item view. Skip the totals/recipe-as-entry approach here.
            const entries = r.ingredients
              .filter((ing) => ing.amount > 0)
              .map((ing) => ({
                source: "recipe" as const,
                sourceFoodId: ing.foodId,
                name: `${r.name} · ${ing.name}`,
                emoji: ing.emoji ?? r.emoji,
                amount: ing.amount,
                unit: ing.unit,
                calories: Math.round(ing.caloriesPer * ing.amount),
                proteinG:
                  Math.round(ing.proteinPer * ing.amount * 10) / 10,
                fiberG:
                  Math.round((ing.fiberPer ?? 0) * ing.amount * 10) / 10,
                carbsG:
                  Math.round((ing.carbsPer ?? 0) * ing.amount * 10) / 10,
                fatsG:
                  Math.round((ing.fatsPer ?? 0) * ing.amount * 10) / 10,
              }));
            void totals;
            addFoodEntries(date, entries);
          }}
        />
      </CardContent>

      {pickedFood && (
        <AmountDialog
          food={pickedFood}
          onClose={() => setPickedFood(null)}
          onConfirm={(amount) => {
            const fl: FoodLike = {
              id: pickedFood.id,
              name: pickedFood.name,
              emoji: pickedFood.emoji ?? "🍽",
              unit: pickedFood.unit,
              defaultAmount: pickedFood.defaultAmount,
              caloriesPer: pickedFood.caloriesPer,
              proteinPer: pickedFood.proteinPer,
              fiberPer: pickedFood.fiberPer,
              carbsPer: pickedFood.carbsPer,
              fatsPer: pickedFood.fatsPer,
              __isCustom: !("__preset" in pickedFood && pickedFood.__preset),
            };
            addFoodEntry(date, makeEntryFromFood(fl, amount));
            setPickedFood(null);
          }}
          onEdit={
            "__preset" in pickedFood && pickedFood.__preset
              ? () => {
                  const p = FOOD_PRESETS.find((x) => x.id === pickedFood.id);
                  setPickedFood(null);
                  if (p) setEditingPreset(applyOverride(p, overrides[p.id]));
                }
              : undefined
          }
        />
      )}

      {editingPreset && (
        <EditPresetDialog
          preset={editingPreset}
          original={FOOD_PRESETS.find((p) => p.id === editingPreset.id)!}
          isOverridden={!!overrides[editingPreset.id]}
          onClose={() => setEditingPreset(null)}
          onSave={(override) => {
            setFoodOverride(editingPreset.id, override);
            setEditingPreset(null);
          }}
          onReset={() => {
            setFoodOverride(editingPreset.id, null);
            setEditingPreset(null);
          }}
        />
      )}

      {showCreate && (
        <CreateCustomDialog
          onClose={() => setShowCreate(false)}
          onSave={(food) => {
            upsertCustomFood(food);
            setShowCreate(false);
          }}
        />
      )}

      {showCustoms && (
        <CustomsListDialog
          customs={uncategorizedCustoms}
          onClose={() => setShowCustoms(false)}
          onPick={(f) => {
            setShowCustoms(false);
            setPickedFood({ ...f });
          }}
          onRemove={(id) => removeCustomFood(id)}
          onUpdate={(f) => upsertCustomFood(f)}
        />
      )}

      {viewingRecipe && (
        <RecipeDetailDialog
          recipe={viewingRecipe}
          onClose={() => setViewingRecipe(null)}
          onAdd={() => {
            addFoodEntry(date, makeEntryFromRecipe(viewingRecipe));
            setViewingRecipe(null);
          }}
        />
      )}

      {showRepeatConfirm && (
        <Dialog open onOpenChange={(o) => !o && setShowRepeatConfirm(false)}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>Repeat yesterday?</DialogTitle>
              <DialogDescription>
                Adds yesterday&apos;s {yesterdayEntries.length} food item
                {yesterdayEntries.length === 1 ? "" : "s"} to today. Water is
                not copied.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowRepeatConfirm(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleRepeatYesterday}>
                <RefreshCcw className="h-3.5 w-3.5" /> Add items
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function FoodChip({
  food,
  onTap,
  onCustomAmount,
  onEdit,
  edited,
  mine,
}: {
  food: FoodLike;
  onTap: () => void;
  onCustomAmount: () => void;
  onEdit?: () => void;
  edited?: boolean;
  mine?: boolean;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const startLongPress = () => {
    longPressTriggered.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onCustomAmount();
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const cal = Math.round(food.caloriesPer * food.defaultAmount);
  const pro = Math.round(food.proteinPer * food.defaultAmount * 10) / 10;
  const car =
    Math.round((food.carbsPer ?? 0) * food.defaultAmount * 10) / 10;
  const fat =
    Math.round((food.fatsPer ?? 0) * food.defaultAmount * 10) / 10;
  const fib =
    Math.round((food.fiberPer ?? 0) * food.defaultAmount * 10) / 10;
  const amountLabel = `${food.defaultAmount}${UNIT_LABEL[food.unit]}`;

  return (
    <div className="group relative flex items-stretch gap-1 overflow-hidden rounded-lg border border-border/60 bg-card/40 transition-colors hover:border-foreground hover:bg-muted/30">
      <button
        onClick={(e) => {
          if (longPressTriggered.current) {
            e.preventDefault();
            longPressTriggered.current = false;
            return;
          }
          onTap();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onCustomAmount();
        }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2 text-left text-sm select-none [-webkit-touch-callout:none]"
        aria-label={`Add ${amountLabel} ${food.name}. Long press for custom amount.`}
      >
        <span className="flex min-w-0 items-center gap-1.5 leading-tight">
          <span className="shrink-0 text-lg">{food.emoji ?? "🍽"}</span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {food.name}
          </span>
          {mine && (
            <span className="shrink-0 font-mono text-[9px] text-emerald-400">
              yours
            </span>
          )}
          {edited && (
            <span className="shrink-0 font-mono text-[9px] text-amber-400">
              edited
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          <span className="text-foreground/85">{cal} kcal</span>
          <span>· P{pro}</span>
          {car > 0 && <span>· C{car}</span>}
          {fat > 0 && <span>· F{fat}</span>}
          {fib > 0 && <span>· Fib{fib}</span>}
          <span className="ml-auto rounded-sm border border-border/50 bg-muted/30 px-1 text-[9px] uppercase tracking-wider">
            {amountLabel}
          </span>
        </span>
      </button>
      <div className="flex w-7 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border/40 py-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCustomAmount();
          }}
          aria-label="Custom amount"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Sliders className="h-3.5 w-3.5" />
        </button>
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Edit defaults"
            className="rounded-md p-1 text-muted-foreground opacity-60 transition-opacity hover:bg-muted/50 hover:text-foreground hover:opacity-100"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function RecipeChip({
  recipe,
  onTap,
  onView,
}: {
  recipe: Recipe;
  onTap: () => void;
  onView: () => void;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const startLongPress = () => {
    longPressTriggered.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      onView();
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const totals = computeRecipeTotals(recipe);
  const itemCount = recipe.ingredients.length;

  return (
    <div className="group relative flex items-stretch gap-1 overflow-hidden rounded-lg border border-violet-500/60 bg-violet-500/10 ring-1 ring-violet-500/20 transition-colors hover:border-violet-400 hover:bg-violet-500/15">
      <button
        onClick={(e) => {
          if (longPressTriggered.current) {
            e.preventDefault();
            longPressTriggered.current = false;
            return;
          }
          onTap();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onView();
        }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2 text-left text-sm select-none [-webkit-touch-callout:none]"
        aria-label={`Add recipe ${recipe.name}. Long press to view ingredients.`}
      >
        <span className="flex min-w-0 items-center gap-1.5 leading-tight">
          <span className="shrink-0 text-lg">{recipe.emoji ?? "🍽"}</span>
          <span className="min-w-0 flex-1 truncate font-medium">
            {recipe.name}
          </span>
          <span className="shrink-0 rounded-md border border-violet-500/40 bg-violet-500/15 px-1 font-mono text-[8px] uppercase tracking-wider text-violet-300">
            recipe
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          <span className="text-foreground/85">{totals.calories} kcal</span>
          <span>· P{totals.protein}</span>
          {totals.carbs > 0 && <span>· C{totals.carbs}</span>}
          {totals.fats > 0 && <span>· F{totals.fats}</span>}
          {totals.fiber > 0 && <span>· Fib{totals.fiber}</span>}
          <span className="ml-auto rounded-sm border border-violet-500/30 bg-violet-500/10 px-1 text-[9px] uppercase tracking-wider text-violet-200">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
        </span>
      </button>
      <div className="flex w-7 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-violet-500/30 py-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          aria-label="View ingredients"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Sliders className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AmountDialog({
  food,
  onClose,
  onConfirm,
  onEdit,
}: {
  food: AnyFood;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  onEdit?: () => void;
}) {
  const [amount, setAmount] = useState(String(food.defaultAmount));
  const n = parseFloat(amount);
  const valid = Number.isFinite(n) && n > 0;
  const macros = valid
    ? calcMacros(food, n)
    : { calories: 0, protein: 0, fiber: 0, carbs: 0, fats: 0 };
  const perLabel =
    food.unit === "piece"
      ? "per 1 piece"
      : `per 1 ${food.unit}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0">{food.emoji ?? "🍽"}</span>
              <span className="truncate">{food.name}</span>
            </span>
            {onEdit && (
              <button
                onClick={onEdit}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Edit defaults"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {perLabel}: {food.caloriesPer} kcal · {food.proteinPer}g protein
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount ({UNIT_LABEL[food.unit]})</Label>
            <Input
              id="amount"
              inputMode="decimal"
              type="number"
              step={food.unit === "piece" ? "1" : "5"}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              autoFocus
              className="font-mono text-lg"
            />
          </div>
          <div className="grid grid-cols-5 gap-1.5 rounded-lg border border-border/60 bg-card/40 p-2 text-center">
            <MacroStat label="kcal" value={macros.calories} />
            <MacroStat label="P" value={macros.protein} />
            <MacroStat label="C" value={macros.carbs} />
            <MacroStat label="F" value={macros.fats} />
            <MacroStat label="Fib" value={macros.fiber} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => valid && onConfirm(n)} disabled={!valid}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MacroStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function EditPresetDialog({
  preset,
  original,
  isOverridden,
  onClose,
  onSave,
  onReset,
}: {
  preset: FoodPreset;
  original: FoodPreset;
  isOverridden: boolean;
  onClose: () => void;
  onSave: (override: FoodOverride) => void;
  onReset: () => void;
}) {
  const [name, setName] = useState(preset.name);
  const [emoji, setEmoji] = useState(preset.emoji ?? original.emoji);
  const [unit, setUnit] = useState<FoodUnit>(preset.unit);
  const [refAmount, setRefAmount] = useState(String(preset.defaultAmount));
  const [calories, setCalories] = useState(
    String(Math.round(preset.caloriesPer * preset.defaultAmount * 100) / 100)
  );
  const [protein, setProtein] = useState(
    String(Math.round(preset.proteinPer * preset.defaultAmount * 100) / 100)
  );
  const [fiber, setFiber] = useState(
    String(
      Math.round((preset.fiberPer ?? 0) * preset.defaultAmount * 100) / 100
    )
  );
  const [carbs, setCarbs] = useState(
    String(
      Math.round((preset.carbsPer ?? 0) * preset.defaultAmount * 100) / 100
    )
  );
  const [fats, setFats] = useState(
    String(
      Math.round((preset.fatsPer ?? 0) * preset.defaultAmount * 100) / 100
    )
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return setError("Name required");
    const ref = unit === "piece" ? 1 : parseFloat(refAmount);
    const cal = parseFloat(calories);
    const pro = parseFloat(protein);
    const fib = parseFloat(fiber) || 0;
    const car = parseFloat(carbs) || 0;
    const fat = parseFloat(fats) || 0;
    if (!Number.isFinite(ref) || ref <= 0)
      return setError("Reference amount > 0");
    if (!Number.isFinite(cal) || cal < 0) return setError("Calories invalid");
    if (!Number.isFinite(pro) || pro < 0) return setError("Protein invalid");
    const override: FoodOverride = {};
    if (trimmed !== original.name) override.name = trimmed;
    if (emoji && emoji !== original.emoji) override.emoji = emoji;
    if (unit !== original.unit) override.unit = unit;
    const newDefault = unit === "piece" ? 1 : ref;
    if (newDefault !== original.defaultAmount) {
      override.defaultAmount = newDefault;
    }
    const newCalPer = cal / ref;
    if (Math.abs(newCalPer - original.caloriesPer) > 1e-6) {
      override.caloriesPer = newCalPer;
    }
    const newProPer = pro / ref;
    if (Math.abs(newProPer - original.proteinPer) > 1e-6) {
      override.proteinPer = newProPer;
    }
    const newFibPer = fib / ref;
    if (Math.abs(newFibPer - (original.fiberPer ?? 0)) > 1e-6) {
      override.fiberPer = newFibPer;
    }
    const newCarPer = car / ref;
    if (Math.abs(newCarPer - (original.carbsPer ?? 0)) > 1e-6) {
      override.carbsPer = newCarPer;
    }
    const newFatPer = fat / ref;
    if (Math.abs(newFatPer - (original.fatsPer ?? 0)) > 1e-6) {
      override.fatsPer = newFatPer;
    }
    if (Object.keys(override).length === 0) {
      onClose();
      return;
    }
    onSave(override);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Pencil className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="truncate">Edit {original.name}</span>
          </DialogTitle>
          <DialogDescription>
            Adjust per-amount values. Saved per profile.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ep-name">Name</Label>
            <Input
              id="ep-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <EmojiPicker
              value={emoji}
              onChange={setEmoji}
              category={original.category}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <div className="flex gap-2">
              {(["g", "ml", "piece"] as FoodUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    unit === u
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {u === "piece" ? "Piece" : u}
                </button>
              ))}
            </div>
          </div>
          {unit !== "piece" && (
            <div className="space-y-1.5">
              <Label htmlFor="ep-ref">Per amount ({UNIT_LABEL[unit]})</Label>
              <Input
                id="ep-ref"
                type="number"
                inputMode="decimal"
                value={refAmount}
                onChange={(e) =>
                  setRefAmount(e.target.value.replace(/[^0-9.]/g, ""))
                }
                className="font-mono"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <NumField id="ep-cal" label="Calories" value={calories} setValue={setCalories} />
            <NumField id="ep-pro" label="Protein (g)" value={protein} setValue={setProtein} />
            <NumField id="ep-car" label="Carbs (g)" value={carbs} setValue={setCarbs} />
            <NumField id="ep-fat" label="Fats (g)" value={fats} setValue={setFats} />
            <NumField id="ep-fib" label="Fibre (g)" value={fiber} setValue={setFiber} />
          </div>
          {error && (
            <p className="font-mono text-xs text-rose-400">{error}</p>
          )}
        </div>
        <DialogFooter className="gap-2">
          {isOverridden && (
            <Button
              variant="ghost"
              onClick={onReset}
              className="text-muted-foreground"
            >
              Reset to default
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumField({
  id,
  label,
  value,
  setValue,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  setValue: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
        placeholder={placeholder}
        className="font-mono"
      />
    </div>
  );
}

function CreateCustomDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (food: CustomFood) => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<FoodUnit>("g");
  const [refAmount, setRefAmount] = useState("100");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fiber, setFiber] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [category, setCategory] = useState<FoodCategory | "">("");
  const [emoji, setEmoji] = useState("");
  const [emojiTouched, setEmojiTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveEmoji =
    emojiTouched && emoji
      ? emoji
      : name.trim()
      ? suggestEmoji(name, category || undefined)
      : "🍽";

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Name required");
    const ref = unit === "piece" ? 1 : parseFloat(refAmount);
    const cal = parseFloat(calories);
    const pro = parseFloat(protein);
    const fib = parseFloat(fiber) || 0;
    const car = parseFloat(carbs) || 0;
    const fat = parseFloat(fats) || 0;
    if (!Number.isFinite(ref) || ref <= 0)
      return setError("Reference amount > 0");
    if (!Number.isFinite(cal) || cal < 0) return setError("Calories invalid");
    if (!Number.isFinite(pro) || pro < 0) return setError("Protein invalid");
    const id =
      "custom-" +
      trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-") +
      "-" +
      Date.now().toString(36);
    onSave({
      id,
      name: trimmed,
      emoji: effectiveEmoji,
      unit,
      defaultAmount: unit === "piece" ? 1 : ref,
      caloriesPer: cal / ref,
      proteinPer: pro / ref,
      fiberPer: fib / ref,
      carbsPer: car / ref,
      fatsPer: fat / ref,
      category: category || undefined,
    });
  };

  const refLabel =
    unit === "piece"
      ? "per 1 piece"
      : `per ${refAmount || "100"} ${UNIT_LABEL[unit]}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New custom food</DialogTitle>
          <DialogDescription>
            Save it once, log it forever.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-name">Name</Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Protein bar"
              autoFocus
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <EmojiPicker
              value={effectiveEmoji}
              onChange={(e) => {
                setEmoji(e);
                setEmojiTouched(true);
              }}
              category={category || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <div className="flex gap-2">
              {(["g", "ml", "piece"] as FoodUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    unit === u
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {u === "piece" ? "Piece" : u}
                </button>
              ))}
            </div>
          </div>
          {unit !== "piece" && (
            <div className="space-y-1.5">
              <Label htmlFor="cf-ref">Per amount ({UNIT_LABEL[unit]})</Label>
              <Input
                id="cf-ref"
                type="number"
                inputMode="decimal"
                value={refAmount}
                onChange={(e) =>
                  setRefAmount(e.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="100"
                className="font-mono"
              />
            </div>
          )}
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {refLabel}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumField id="cf-cal" label="Calories" value={calories} setValue={setCalories} placeholder="0" />
            <NumField id="cf-pro" label="Protein (g)" value={protein} setValue={setProtein} placeholder="0" />
            <NumField id="cf-car" label="Carbs (g)" value={carbs} setValue={setCarbs} placeholder="0" />
            <NumField id="cf-fat" label="Fats (g)" value={fats} setValue={setFats} placeholder="0" />
            <NumField id="cf-fib" label="Fibre (g)" value={fiber} setValue={setFiber} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <Label>Show under section (optional)</Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  category === ""
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                )}
              >
                My foods only
              </button>
              {CATEGORY_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium",
                    category === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              Picking a section also shows this food on that tab. Otherwise
              it stays under My foods.
            </p>
          </div>
          {error && (
            <p className="font-mono text-xs text-rose-400">{error}</p>
          )}
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

function CustomsListDialog({
  customs,
  onClose,
  onPick,
  onRemove,
  onUpdate,
}: {
  customs: CustomFood[];
  onClose: () => void;
  onPick: (f: CustomFood) => void;
  onRemove: (id: string) => void;
  onUpdate: (f: CustomFood) => void;
}) {
  const [editing, setEditing] = useState<CustomFood | null>(null);

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>My foods</DialogTitle>
            <DialogDescription>
              Tap to log. Pencil to edit. Trash to remove.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {customs.length === 0 && (
              <p className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                No custom foods yet.
              </p>
            )}
            {customs.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-1 overflow-hidden rounded-lg border border-border/60 bg-card/40 p-2"
              >
                <button
                  onClick={() => onPick(f)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="shrink-0 text-lg">
                    {f.emoji ?? suggestEmoji(f.name, f.category)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {f.name}
                    </span>
                    <span className="truncate font-mono text-[10px] text-muted-foreground">
                      {Math.round(f.caloriesPer * f.defaultAmount)} kcal ·{" "}
                      {Math.round(f.proteinPer * f.defaultAmount * 10) / 10}g ·{" "}
                      {f.defaultAmount}
                      {UNIT_LABEL[f.unit]}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(f)}
                  aria-label="Edit"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <span
                  className="h-5 w-px shrink-0 bg-border/60"
                  aria-hidden
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onRemove(f.id)}
                  aria-label="Remove"
                  className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {editing && (
        <EditCustomDialog
          food={editing}
          onClose={() => setEditing(null)}
          onSave={(f) => {
            onUpdate(f);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function EditCustomDialog({
  food,
  onClose,
  onSave,
}: {
  food: CustomFood;
  onClose: () => void;
  onSave: (f: CustomFood) => void;
}) {
  const [name, setName] = useState(food.name);
  const [unit, setUnit] = useState<FoodUnit>(food.unit);
  const [refAmount, setRefAmount] = useState(String(food.defaultAmount));
  const [calories, setCalories] = useState(
    String(Math.round(food.caloriesPer * food.defaultAmount * 100) / 100)
  );
  const [protein, setProtein] = useState(
    String(Math.round(food.proteinPer * food.defaultAmount * 100) / 100)
  );
  const [fiber, setFiber] = useState(
    String(Math.round((food.fiberPer ?? 0) * food.defaultAmount * 100) / 100)
  );
  const [carbs, setCarbs] = useState(
    String(Math.round((food.carbsPer ?? 0) * food.defaultAmount * 100) / 100)
  );
  const [fats, setFats] = useState(
    String(Math.round((food.fatsPer ?? 0) * food.defaultAmount * 100) / 100)
  );
  const [category, setCategory] = useState<FoodCategory | "">(
    food.category ?? ""
  );
  const [emoji, setEmoji] = useState(
    food.emoji ?? suggestEmoji(food.name, food.category)
  );
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Name required");
    const ref = unit === "piece" ? 1 : parseFloat(refAmount);
    const cal = parseFloat(calories);
    const pro = parseFloat(protein);
    const fib = parseFloat(fiber) || 0;
    const car = parseFloat(carbs) || 0;
    const fat = parseFloat(fats) || 0;
    if (!Number.isFinite(ref) || ref <= 0) return setError("Reference > 0");
    if (!Number.isFinite(cal) || cal < 0) return setError("Calories invalid");
    if (!Number.isFinite(pro) || pro < 0) return setError("Protein invalid");
    onSave({
      ...food,
      name: trimmed,
      emoji: emoji || food.emoji,
      unit,
      defaultAmount: unit === "piece" ? 1 : ref,
      caloriesPer: cal / ref,
      proteinPer: pro / ref,
      fiberPer: fib / ref,
      carbsPer: car / ref,
      fatsPer: fat / ref,
      category: category || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="truncate">Edit {food.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">Name</Label>
            <Input
              id="ec-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <EmojiPicker
              value={emoji}
              onChange={setEmoji}
              category={category || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <div className="flex gap-2">
              {(["g", "ml", "piece"] as FoodUnit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-1.5 text-sm font-medium",
                    unit === u
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 text-muted-foreground"
                  )}
                >
                  {u === "piece" ? "Piece" : u}
                </button>
              ))}
            </div>
          </div>
          {unit !== "piece" && (
            <div className="space-y-1.5">
              <Label htmlFor="ec-ref">Per amount ({UNIT_LABEL[unit]})</Label>
              <Input
                id="ec-ref"
                type="number"
                inputMode="decimal"
                value={refAmount}
                onChange={(e) =>
                  setRefAmount(e.target.value.replace(/[^0-9.]/g, ""))
                }
                className="font-mono"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <NumField id="ec-cal" label="Calories" value={calories} setValue={setCalories} />
            <NumField id="ec-pro" label="Protein (g)" value={protein} setValue={setProtein} />
            <NumField id="ec-car" label="Carbs (g)" value={carbs} setValue={setCarbs} />
            <NumField id="ec-fat" label="Fats (g)" value={fats} setValue={setFats} />
            <NumField id="ec-fib" label="Fibre (g)" value={fiber} setValue={setFiber} />
          </div>
          <div className="space-y-1.5">
            <Label>Show under section (optional)</Label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setCategory("")}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  category === ""
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                )}
              >
                My foods only
              </button>
              {CATEGORY_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium",
                    category === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="font-mono text-xs text-rose-400">{error}</p>}
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

function RecipeDetailDialog({
  recipe,
  onClose,
  onAdd,
}: {
  recipe: Recipe;
  onClose: () => void;
  onAdd: () => void;
}) {
  const totals = computeRecipeTotals(recipe);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-xl">{recipe.emoji ?? "🍽"}</span>
            <span className="truncate">{recipe.name}</span>
            <span className="shrink-0 rounded-md border border-violet-500/40 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-violet-300">
              recipe
            </span>
          </DialogTitle>
          <DialogDescription>
            {recipe.ingredients.length}{" "}
            {recipe.ingredients.length === 1 ? "ingredient" : "ingredients"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-1.5 rounded-lg border border-border/60 bg-card/40 p-2 text-center">
            <MacroStat label="kcal" value={totals.calories} />
            <MacroStat label="P" value={totals.protein} />
            <MacroStat label="C" value={totals.carbs} />
            <MacroStat label="F" value={totals.fats} />
            <MacroStat label="Fib" value={totals.fiber} />
          </div>
          <div className="space-y-1">
            {recipe.ingredients.map((ing) => (
              <div
                key={ing.id}
                className="flex items-center gap-2 rounded-md border border-border/60 bg-card/30 px-2 py-1.5"
              >
                <span className="text-base">{ing.emoji ?? "🍽"}</span>
                <span className="flex-1 truncate text-sm">{ing.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {ing.amount}
                  {UNIT_LABEL[ing.unit]} ·{" "}
                  {Math.round(ing.caloriesPer * ing.amount)} kcal
                </span>
              </div>
            ))}
            {recipe.ingredients.length === 0 && (
              <p className="rounded-md border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
                No ingredients yet.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onAdd} disabled={recipe.ingredients.length === 0}>
            <Plus className="h-3.5 w-3.5" /> Add to today
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
