// 랜딩 페이지 공용 — Wantedly UI Components 기반 디자인 토큰 + 모션 훅 + 공용 Button.
// design system: lidam-design-system (Wantedly blue + Pretendard).
import {
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
  createElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";

// 랜딩 색 SSOT — 인앱 app.css 토큰(:root/.dark)을 var()로 참조해 다크 대응.
// 인라인 스타일이 var()를 그대로 받으므로, 이 객체만 바꾸면 전 섹션에 전파된다.
// accent(#7B61FF 보라)만 C1-4 하드코딩 단계에서 브랜드/토큰으로 교체 예정.
export const PALETTE = {
  primary: "var(--primary)",
  primaryStrong: "var(--lp-grad-to)",
  primaryDeep: "var(--primary)",
  accent: "#7B61FF",
  ink: "var(--foreground)",
  inkSoft: "var(--ink-soft)",
  inkMute: "var(--ink-faint)",
  line: "var(--border)",
  soft: "var(--secondary)",
  tint: "var(--secondary)",
  base: "var(--card)",
  subtle: "var(--surface-2)",
  muted: "var(--surface-3)",
  gradientPeople:
    "linear-gradient(180deg, var(--primary) 0%, var(--lp-grad-to) 100%)",
  gradientVisit:
    "linear-gradient(180deg, var(--primary) 0%, var(--lp-grad-to) 100%)",
} as const;

export const EASE_REVEAL = "cubic-bezier(0.22, 1, 0.36, 1)";

export function useInView<T extends Element>(threshold = 0.15) {
  const ref = useRef<T | null>(null);
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
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
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

type RevealAs =
  | "div"
  | "article"
  | "section"
  | "header"
  | "p"
  | "li"
  | "ul"
  | "span"
  | "a";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  as?: RevealAs;
  className?: string;
  style?: CSSProperties;
  href?: string;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
}

export function Reveal({
  children,
  delay = 0,
  as = "div",
  className,
  style,
  href,
  onMouseEnter,
  onMouseLeave,
}: RevealProps) {
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
  const merged: CSSProperties = reduce
    ? (style ?? {})
    : {
        ...style,
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(12px)",
        transition: `opacity 600ms ${EASE_REVEAL} ${delay}ms, transform 600ms ${EASE_REVEAL} ${delay}ms`,
      };
  return createElement(
    as,
    {
      ref,
      className,
      style: merged,
      href,
      onMouseEnter,
      onMouseLeave,
    },
    children,
  );
}

// ============================================================================
// LandingButton — Wantedly pill 버튼 (R100, two-layer shadow).
// ============================================================================

export type ButtonVariant =
  | "primary"
  | "outline"
  | "ghost"
  | "onDark"
  | "onDarkGhost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: PALETTE.primary,
    color: "#fff",
    border: 0,
    boxShadow: "0 8px 24px rgba(45, 91, 168, 0.18)",
  },
  outline: {
    background: "transparent",
    color: PALETTE.primary,
    boxShadow: `inset 0 0 0 1px ${PALETTE.primary}`,
  },
  ghost: {
    background: "transparent",
    color: PALETTE.inkSoft,
    boxShadow: "none",
  },
  onDark: {
    background: "#fff",
    color: PALETTE.primary,
    border: 0,
  },
  onDarkGhost: {
    background: "transparent",
    color: "#fff",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.32)",
  },
};
const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 44, lg: 52 };
const PXS: Record<ButtonSize, number> = { sm: 16, md: 22, lg: 28 };
const FS: Record<ButtonSize, number> = { sm: 13, md: 14, lg: 15 };

interface LandingButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  to?: string;
  href?: string;
  onClick?: () => void;
  style?: CSSProperties;
  fullWidth?: boolean;
  ariaLabel?: string;
}

export function LandingButton({
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  to,
  href,
  onClick,
  style,
  fullWidth,
  ariaLabel,
}: LandingButtonProps) {
  const h = HEIGHTS[size];
  const px = PXS[size];
  const fs = FS[size];
  const baseStyle: CSSProperties = {
    display: fullWidth ? "flex" : "inline-flex",
    width: fullWidth ? "100%" : undefined,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: h,
    padding: `0 ${px}px`,
    borderRadius: 9999,
    font: `600 ${fs}px/1 Pretendard, sans-serif`,
    letterSpacing: "-0.01em",
    cursor: "pointer",
    whiteSpace: "nowrap",
    textDecoration: "none",
    transition:
      "transform 160ms cubic-bezier(0.22,1,0.36,1), box-shadow 160ms cubic-bezier(0.22,1,0.36,1), background 160ms ease",
    ...VARIANT_STYLE[variant],
    ...style,
  };
  const onEnter: MouseEventHandler<HTMLElement> = (e) => {
    e.currentTarget.style.transform = "translateY(-1px)";
  };
  const onLeave: MouseEventHandler<HTMLElement> = (e) => {
    e.currentTarget.style.transform = "translateY(0)";
  };
  const inner = (
    <>
      {iconLeft}
      <span>{children}</span>
      {iconRight}
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        style={baseStyle}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        aria-label={ariaLabel}
      >
        {inner}
      </Link>
    );
  }
  if (href) {
    return (
      <a
        href={href}
        style={baseStyle}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        aria-label={ariaLabel}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      aria-label={ariaLabel}
    >
      {inner}
    </button>
  );
}
