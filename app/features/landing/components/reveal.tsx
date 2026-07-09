// feat-12 랜딩 스크롤 등장 래퍼 — 뷰포트 진입 시 .in 부여. 감속 설정은 CSS 가 처리.
import {
  createElement,
  useEffect,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

export function Reveal({
  as = "div",
  className = "",
  style,
  children,
}: {
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!el || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, shown]);

  return createElement(
    as,
    {
      ref: setEl,
      className: `rv${shown ? " in" : ""}${className ? " " + className : ""}`,
      style,
    },
    children,
  );
}
