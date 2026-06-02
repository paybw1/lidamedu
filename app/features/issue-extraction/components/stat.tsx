import { cn } from "~/core/lib/utils";

type StatTone = "emerald" | "coral" | "rose";

const TONE_CLS: Record<StatTone, string> = {
  emerald: "text-emerald-600 dark:text-emerald-300",
  coral: "text-amber-700 dark:text-amber-300",
  rose: "text-rose-600 dark:text-rose-300",
};

export function Stat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: StatTone;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-3 shadow-sm">
      <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "text-foreground mt-1 text-2xl font-extrabold tabular-nums",
          TONE_CLS[tone],
        )}
      >
        {value}
        <span className="text-muted-foreground ml-1 text-xs font-medium">
          / {total}
        </span>
      </p>
    </div>
  );
}
