import { LayoutListIcon, NetworkIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { cn } from "~/core/lib/utils";

export const SORT_AXIS_VALUES = ["systematic", "statutory"] as const;

export type SortAxis = (typeof SORT_AXIS_VALUES)[number];

const STORAGE_KEY = "lidamedu:sort-axis";
const DEFAULT_AXIS: SortAxis = "systematic";

function isSortAxis(value: unknown): value is SortAxis {
  return (
    typeof value === "string" &&
    (SORT_AXIS_VALUES as readonly string[]).includes(value)
  );
}

interface SortAxisContextValue {
  axis: SortAxis;
  setAxis: (axis: SortAxis) => void;
}

const SortAxisContext = createContext<SortAxisContextValue | null>(null);

export function SortAxisProvider({ children }: { children: ReactNode }) {
  const [axis, setAxisState] = useState<SortAxis>(DEFAULT_AXIS);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSortAxis(stored)) setAxisState(stored);
  }, []);

  const setAxis = useCallback((next: SortAxis) => {
    setAxisState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  return (
    <SortAxisContext.Provider value={{ axis, setAxis }}>
      {children}
    </SortAxisContext.Provider>
  );
}

export function useSortAxis(): SortAxisContextValue {
  const ctx = useContext(SortAxisContext);
  if (!ctx) {
    throw new Error("useSortAxis must be used within SortAxisProvider");
  }
  return ctx;
}

const AXIS_OPTIONS: { value: SortAxis; label: string; icon: typeof NetworkIcon }[] =
  [
    { value: "systematic", label: "체계도", icon: NetworkIcon },
    { value: "statutory", label: "조문 순서", icon: LayoutListIcon },
  ];

export function SortAxisToggle({ className }: { className?: string }) {
  const { axis, setAxis } = useSortAxis();

  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground inline-flex h-9 items-center rounded-lg p-[3px]",
        className,
      )}
      role="group"
      aria-label="정렬 기준"
    >
      {AXIS_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = axis === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setAxis(value)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
