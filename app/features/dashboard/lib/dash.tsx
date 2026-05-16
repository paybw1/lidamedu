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

export const T = {
  ink: "rgba(0,0,0,0.84)",
  ink2: "rgba(0,0,0,0.74)",
  inkSoft: "rgba(0,0,0,0.56)",
  inkMute: "rgba(0,0,0,0.40)",
  line: "rgba(0,0,0,0.12)",
  lineSoft: "rgba(0,0,0,0.06)",

  blue: "#2D5BA8",
  blueStrong: "#1E4789",
  blueDeep: "#3B6FC4",
  blueSoft: "rgba(45, 91, 168, 0.10)",
  blueTint: "rgba(45, 91, 168, 0.04)",

  page: "#ffffff",
  paper: "#ffffff",
  subtle: "#FAFAFA",
  muted: "#F2F2F0",

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

// 히트맵·도넛·막대용 블루 5단계 명도.
export const BLUE_SCALE = [
  "rgba(0,0,0,0.04)",
  "rgba(45,91,168,0.15)",
  "rgba(45,91,168,0.35)",
  "rgba(45,91,168,0.6)",
  "#2D5BA8",
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
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: T.paper,
        borderRadius: 16,
        boxShadow: hovered && hover ? T.elev8 : T.elev4,
        padding,
        transition: `box-shadow 200ms ${T.ease}, transform 200ms ${T.ease}`,
        transform: hovered && hover ? "translateY(-2px)" : "translateY(0)",
        minWidth: 0,
        height: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  color = T.blue,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        font: `700 11px/1 Pretendard, sans-serif`,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color,
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
        marginTop: 24,
        marginBottom: 4,
      }}
    >
      <Eyebrow color={T.inkMute}>{eyebrow}</Eyebrow>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

export type ChipTone = "neutral" | "blue" | "emerald" | "coral" | "amber" | "solid";

const CHIP_TONES: Record<ChipTone, { bg: string; color: string; border: string }> = {
  neutral: { bg: T.subtle, color: T.ink, border: T.lineSoft },
  blue: { bg: T.blueSoft, color: T.blue, border: "transparent" },
  emerald: { bg: T.emeraldSoft, color: T.emerald, border: "transparent" },
  coral: { bg: T.coralSoft, color: T.coral, border: "transparent" },
  amber: { bg: T.amberSoft, color: T.amberInk, border: "transparent" },
  solid: { bg: T.blue, color: "#fff", border: "transparent" },
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
  const t = CHIP_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 22,
        padding: "0 8px",
        borderRadius: 9999,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        font: "600 11px/1 Pretendard, sans-serif",
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        ...style,
      }}
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
  const bg = tone === "emerald" ? T.emerald : tone === "coral" ? T.coral : T.blue;
  return (
    <div
      ref={ref}
      style={{
        height,
        borderRadius: 9999,
        background: T.muted,
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
  weight = 800,
  color = T.ink,
}: {
  value: string | number;
  unit?: string;
  size?: number;
  weight?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        font: `${weight} ${size}px/1 Pretendard, sans-serif`,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "tabular-nums",
        color,
      }}
    >
      {value}
      {unit ? (
        <span
          style={{
            fontSize: Math.round(size * 0.55),
            color: T.inkSoft,
            marginLeft: 2,
            fontWeight: 600,
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
        font: "400 12px/1.5 Pretendard, sans-serif",
        color: T.inkSoft,
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
  return (
    <div
      style={{
        font: `700 ${size}px/1.3 Pretendard, sans-serif`,
        color: T.ink,
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
