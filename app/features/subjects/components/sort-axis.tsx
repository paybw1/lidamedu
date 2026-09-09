import { LayoutListIcon, NetworkIcon } from "lucide-react";
import {
  type ReactNode,
  createContext,
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
  // 축이 고정(forced)된 경우 그 값 — 토글이 나머지 축을 자동 비활성화하는 데 사용.
  forced: SortAxis | null;
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
    <SortAxisContext.Provider value={{ axis, setAxis, forced: forced ?? null }}>
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

const AXIS_OPTIONS = [
  { value: "systematic", label: "체계도", icon: NetworkIcon },
  { value: "statutory", label: "조문", icon: LayoutListIcon },
] as const satisfies readonly SegmentedOption<SortAxis>[];

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon: typeof NetworkIcon;
}

// 표현부 — 컨텍스트 비의존 세그먼트 컨트롤. 좌패널 토글의 **단일 스타일 소스**다.
// ★값을 SortAxis 로 좁히지 않는다 — 조문 탭은 축(체계도/조문)에 화면 하나(정리)를
//   더 얹어 세 칸으로 쓴다. 축 자체를 늘리면 문제·판례 탭 토글에도 그 칸이 생긴다.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  size = "default",
  disabled,
  ariaLabel,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  size?: "sm" | "default";
  disabled?: readonly T[];
  ariaLabel: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground inline-flex items-center rounded-lg p-[3px]",
        size === "sm" ? "h-7" : "h-9",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map(({ value: v, label, icon: Icon }) => {
        const active = value === v;
        const off = disabled?.includes(v) ?? false;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={active}
            aria-disabled={off}
            disabled={off}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-md font-medium transition-colors",
              size === "sm" ? "px-2 text-[11px]" : "px-3 text-xs",
              active
                ? "bg-background text-link shadow-sm"
                : "hover:text-foreground",
              off
                ? "hover:text-muted-foreground cursor-not-allowed opacity-50"
                : "",
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

export function AxisSegmented({
  axis,
  onChange,
  className,
  size = "default",
  disabledAxes,
  ariaLabel = "정렬 기준",
}: {
  axis: SortAxis;
  onChange: (axis: SortAxis) => void;
  className?: string;
  size?: "sm" | "default";
  disabledAxes?: SortAxis[];
  ariaLabel?: string;
}) {
  return (
    <Segmented
      value={axis}
      options={AXIS_OPTIONS}
      onChange={onChange}
      className={className}
      size={size}
      disabled={disabledAxes}
      ariaLabel={ariaLabel}
    />
  );
}

export function SortAxisToggle({
  className,
  size = "default",
  disabledAxes,
}: {
  className?: string;
  size?: "sm" | "default";
  disabledAxes?: SortAxis[];
}) {
  const { axis, setAxis, forced } = useSortAxis();
  // 축이 고정되면 나머지 축을 비활성 표시(민법=조문 고정 → 체계도 비활성 등).
  const mergedDisabled = forced
    ? Array.from(
        new Set([
          ...(disabledAxes ?? []),
          ...SORT_AXIS_VALUES.filter((v) => v !== forced),
        ]),
      )
    : disabledAxes;
  return (
    <AxisSegmented
      axis={axis}
      onChange={setAxis}
      className={className}
      size={size}
      disabledAxes={mergedDisabled}
    />
  );
}
