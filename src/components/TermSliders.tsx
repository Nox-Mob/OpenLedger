import { Slider } from "@/components/ui/slider";
import {
  LEVELS,
  TERM_ITEMS,
  termOptions,
  type OrgType,
  type TermOverrides,
  type Terminology,
} from "@/lib/terminology";

/** One 3-stop slider per term. `base` is the level used when a term has no override. */
export function TermSliders({
  orgType,
  base,
  value,
  onChange,
  disabled,
  resetLabel,
}: {
  orgType: OrgType;
  base: (key: string) => Terminology;
  value: TermOverrides;
  onChange: (next: TermOverrides) => void;
  disabled?: boolean;
  resetLabel?: string;
}) {
  return (
    <div className="divide-y rounded-md border">
      {TERM_ITEMS.map((item) => {
        const opts = termOptions(item, orgType);
        const current = value[item.key] ?? base(item.key);
        const idx = LEVELS.indexOf(current);
        const overridden = value[item.key] !== undefined;
        return (
          <div key={item.key} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</span>
              <span className="text-sm font-medium">{opts[idx]}</span>
            </div>
            <Slider
              className="mt-3"
              min={0}
              max={2}
              step={1}
              value={[idx]}
              disabled={!!disabled}
              aria-label={item.label}
              onValueChange={([v]) => onChange({ ...value, [item.key]: LEVELS[v ?? 0]! })}
            />
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
              {opts.map((o, i) => (
                <span key={i} className={i === idx ? "text-foreground" : ""}>{o}</span>
              ))}
            </div>
            {overridden && resetLabel && !disabled && (
              <button
                type="button"
                className="mt-1 text-xs text-primary underline underline-offset-2"
                onClick={() => {
                  const next = { ...value };
                  delete next[item.key];
                  onChange(next);
                }}
              >
                {resetLabel}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
