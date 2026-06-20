// 대시보드 리디자인 공용 — Wantedly 디자인 시스템 토큰 + 모션 훅 + primitives.
// design system: lidam-design-system (Wantedly blue + Pretendard).

import {
  type CSSProperties,
  type ReactNode,
  createElement,
  useEffect,
  useRef,
  useState,
} from "react";

// CSS 변수 매핑 — light/dark 양쪽에 자동 적응(Tailwind theme 토큰).
// 변수 정의: app/app.css 의 :root / .dark.
export const T = {
  ink: "var(--foreground)",
  ink2: "color-mix(in oklch, var(--foreground) 88%, transparent)",
  inkSoft: "color-mix(in oklch, var(--foreground) 70%, transparent)",
  inkMute: "color-mix(in oklch, var(--foreground) 50%, transparent)",
  line: "var(--border)",
  lineSoft: "color-mix(in oklch, var(--border) 50%, transparent)",

  blue: "var(--primary)", // 다크 자동 적응(#3B6FC4) — 아이콘·CTA 배경
  link: "var(--link)", // 링크 텍스트 — 다크에서 밝은 파랑(blue-400)으로 가독성 확보
  blueStrong: "#1E4789",
  blueDeep: "#3B6FC4",
  blueSoft: "rgba(45, 91, 168, 0.12)",
  blueTint: "rgba(45, 91, 168, 0.06)",

  page: "var(--background)",
  paper: "var(--card)",
  subtle: "var(--muted)",
  muted: "var(--muted)",

  emerald: "#10A37F",
  emeraldSoft: "rgba(16,163,127,0.10)",
  coral: "#F65948",
  coralSoft: "rgba(246,89,72,0.10)",
  amber: "#F7B500",
  amberSoft: "rgba(247,181,0,0.12)",
  amberInk: "#A77B3F",

  font: "Pretendard, system-ui, -apple-system, sans-serif",

  elev2: "0 1px 2px rgba(0,0,0,0.04)",
  elev4: "0 0 0 1px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.08)",
  elev8: "0 0 0 1px rgba(0,0,0,0.02), 0 8px 24px rgba(0,0,0,0.10)",

  ease: "cubic-bezier(0.22, 1, 0.36, 1)",
} as const;

// 히트맵·도넛·막대용 블루 5단계 명도 — primary(파랑) 기반 color-mix 로 light/dark 자동 적응.
// 활동·볼륨 차트 공통 hue(docs/survey/색정합성-점검.md ③ A안: 활동=primary 단색).
export const BLUE_SCALE = [
  "color-mix(in oklch, var(--foreground) 6%, transparent)", // empty — 옅은 회색/다크 옅은 흰
  "color-mix(in oklch, var(--primary) 25%, transparent)",
  "color-mix(in oklch, var(--primary) 45%, transparent)",
  "color-mix(in oklch, var(--primary) 70%, transparent)",
  "var(--primary)",
] as const;

export function useInView<E extends Element>(threshold = 0.15) {
  const ref = useRef<E | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.unobserve(el);
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

export function useCountUp(target: number, duration = 1200, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

type RevealAs = "div" | "li" | "article" | "section";

export function Reveal({
  children,
  delay = 0,
  as = "div",
  style,
}: {
  children: ReactNode;
  delay?: number;
  as?: RevealAs;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const anim: CSSProperties = reduce
    ? {}
    : {
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(8px)",
        transition: `opacity 500ms ${T.ease} ${delay}ms, transform 500ms ${T.ease} ${delay}ms`,
      };
  return createElement(as, { ref, style: { ...anim, ...style } }, children);
}

// ============================================================================
// Primitives
// ============================================================================

export function Card({
  children,
  padding = 20,
  style,
  hover = true,
}: {
  children: ReactNode;
  padding?: number;
  style?: CSSProperties;
  hover?: boolean;
}) {
  // 디자인 시스템 v1 (Notion·Linear 톤) — 그림자 0, 얇은 단색 경계, hover 시 경계만 강조.
  // 호출 시그니처 보존 (padding/hover/style props) — 6 섹션 카드 일괄 톤 통일.
  return (
    <div
      style={{
        background: "var(--card)",
        color: "var(--card-foreground)",
        borderRadius: 12,
        border: "1px solid var(--border)",
        padding,
        transition: "border-color 150ms ease",
        minWidth: 0,
        height: "100%",
        ...style,
      }}
      className={hover ? "hover:border-primary/40" : undefined}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  color,
  style,
}: {
  children: ReactNode;
  /** 색 override — 기본은 새 토큰 `--ink-faint` (회색 모노). */
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        font: `600 11px/1 Pretendard, sans-serif`,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: color ?? "var(--ink-faint)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function SectionBand({
  eyebrow,
  right,
}: {
  eyebrow: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginTop: 32, // 디자인 시스템 v1: 섹션 간 mt-8 = 32px
        marginBottom: 12,
      }}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

export type ChipTone = "neutral" | "blue" | "emerald" | "coral" | "amber" | "solid";

// 디자인 시스템 v1 — Chip 의 톤별 Tailwind class. dark mode 자동 매핑.
const CHIP_TONE_CLS: Record<ChipTone, string> = {
  neutral: "bg-muted text-ink-soft border-border",
  blue: "bg-secondary text-secondary-foreground border-secondary",
  emerald:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  coral:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  amber:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  solid: "bg-primary text-primary-foreground border-primary",
};

export function Chip({
  children,
  tone = "neutral",
  style,
}: {
  children: ReactNode;
  tone?: ChipTone;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`${CHIP_TONE_CLS[tone]} inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap`}
      style={style}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = "blue",
  height = 6,
  animateOnView = false,
  delay = 0,
}: {
  value: number;
  max?: number;
  tone?: "blue" | "emerald" | "coral";
  height?: number;
  animateOnView?: boolean;
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  // 의미 토큰 — primary(blue)/positive(emerald)/danger(coral) 매핑. dark mode 자동.
  const bg =
    tone === "emerald"
      ? "rgb(16 185 129)" // emerald-500
      : tone === "coral"
        ? "rgb(244 63 94)" // rose-500
        : "var(--primary)";
  return (
    <div
      ref={ref}
      style={{
        height,
        borderRadius: 9999,
        background: "var(--muted)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: animateOnView ? (inView ? `${pct}%` : 0) : `${pct}%`,
          height: "100%",
          background: bg,
          borderRadius: 9999,
          transition: `width 800ms ${T.ease} ${delay}ms`,
        }}
      />
    </div>
  );
}

export function Num({
  value,
  unit,
  size = 28,
  weight = 600,
  color,
}: {
  value: string | number;
  unit?: string;
  size?: number;
  /** 기본 weight 600 — Notion·Linear 톤. 강조 시 호출에서 800 가능. */
  weight?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        font: `${weight} ${size}px/1 Pretendard, sans-serif`,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        color: color ?? "var(--foreground)",
      }}
    >
      {value}
      {unit ? (
        <span
          style={{
            fontSize: Math.round(size * 0.55),
            color: "var(--ink-soft)",
            marginLeft: 2,
            fontWeight: 500,
          }}
        >
          {unit}
        </span>
      ) : null}
    </span>
  );
}

export function Sub({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        font: "400 13px/1.5 Pretendard, sans-serif",
        color: "var(--ink-soft)",
        letterSpacing: "-0.005em",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Title({
  children,
  size = 16,
  style,
}: {
  children: ReactNode;
  size?: number;
  style?: CSSProperties;
}) {
  // Notion·Linear 톤: weight 700 → 600 절제.
  return (
    <div
      style={{
        font: `600 ${size}px/1.3 Pretendard, sans-serif`,
        color: "var(--foreground)",
        letterSpacing: "-0.015em",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// 카드 그리드 — 데스크톱 6칸, 태블릿 3칸, 모바일 1칸.
export function DashGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="dash-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 16,
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}

export function SpanCol({
  span,
  children,
}: {
  span: number;
  children: ReactNode;
}) {
  return (
    <div
      data-span={span}
      style={{ gridColumn: `span ${span}`, minWidth: 0 }}
    >
      {children}
    </div>
  );
}
