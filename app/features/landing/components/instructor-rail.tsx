// 랜딩 강사진 가로 레일 — 좌우 화살표 버튼으로 넘긴다(단순 스크롤 대체).
//   버튼은 레일 양 끝에 겹쳐 배치, 스크롤 끝에 닿으면 자동 비활성(투명).
//   *.server 값 import 금지(빌드 함정) — 필요한 필드만 로컬 타입으로 선언.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

export type RailInstructor = {
  instructorId: string;
  slug: string;
  name: string;
  subjectLabel: string;
  photoPath: string | null;
  monogram: string | null;
};

export function InstructorRail({ items }: { items: RailInstructor[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const nudge = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(el.clientWidth * 0.8, 220),
      behavior: "smooth",
    });
  };

  return (
    <div className="irailwrap">
      <button
        type="button"
        className="irail-nav prev"
        aria-label="이전 강사"
        onClick={() => nudge(-1)}
        disabled={!canPrev}
      >
        ‹
      </button>
      <div className="igrid" ref={ref}>
        {items.map((it) => (
          <Link
            className="ic"
            to={`/about/instructors/${it.slug}`}
            key={it.instructorId}
          >
            <span className="por">
              {it.photoPath ? (
                <img src={it.photoPath} alt={it.name} loading="lazy" />
              ) : (
                <b>{it.monogram ?? it.name.slice(0, 1)}</b>
              )}
            </span>
            <span className="icb">
              <span className="nm">{it.name}</span>
              <span className="role">{it.subjectLabel}</span>
            </span>
          </Link>
        ))}
      </div>
      <button
        type="button"
        className="irail-nav next"
        aria-label="다음 강사"
        onClick={() => nudge(1)}
        disabled={!canNext}
      >
        ›
      </button>
    </div>
  );
}
