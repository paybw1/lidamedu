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

export function SortAxisProvider({
  children,
  forced,
}: {
  children: ReactNode;
  // 지정 시 축을 그 값으로 잠그고(toggle 무시) localStorage 에도 반영해
  // 다른 화면(조문 뷰어 등)도 그 축을 따라오게 한다. (문제 학습 흐름 = 체계도 고정용)
  forced?: SortAxis;
}) {
  const [axis, setAxisState] = useState<SortAxis>(forced ?? DEFAULT_AXIS);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (forced) {
      window.localStorage.setItem(STORAGE_KEY, forced);
      setAxisState(forced);
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isSortAxis(stored)) setAxisState(stored);
  }, [forced]);

  const setAxis = useCallback(
    (next: SortAxis) => {
      if (forced) return; // 잠금 상태에선 변경 무시.
      setAxisState(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    },
    [forced],
  );

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
    { value: "statutory", label: "조문", icon: LayoutListIcon },
  ];

export function SortAxisToggle({
  className,
  size = "default",
  disabledAxes,
}: {
  className?: string;
  size?: "sm" | "default";
  disabledAxes?: SortAxis[];
}) {
  const { axis, setAxis } = useSortAxis();

  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground inline-flex items-center rounded-lg p-[3px]",
        size === "sm" ? "h-7" : "h-9",
        className,
      )}
      role="group"
      aria-label="정렬 기준"
    >
      {AXIS_OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = axis === value;
        const disabled = disabledAxes?.includes(value) ?? false;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setAxis(value)}
            aria-pressed={active}
            aria-disabled={disabled}
            disabled={disabled}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md font-medium transition-colors",
              size === "sm" ? "px-2 text-[11px]" : "px-3 text-xs",
              active
                ? "bg-background text-[#2D5BA8] shadow-sm dark:text-[#8FB4E3]"
                : "hover:text-foreground",
              disabled ? "cursor-not-allowed opacity-50 hover:text-muted-foreground" : "",
            )}
          >
            <Icon className={size === "sm" ? "size-3" : "size-3.5"} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
