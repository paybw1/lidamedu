// 랜딩 강사진 가로 레일 — 페이지형 캐러셀(스크롤바 없음).
//   한 페이지에 '완전히 보이는 카드'만 배치(사진 잘림 방지) → 좌우 화살표로 페이지 이동.
//   화살표는 항상 노출(끝에서 랩어라운드). *.server 값 import 금지(빌드 함정).
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

const CARD_W = 186; // .ic 고정 폭
const GAP = 16; // 카드 간격
const STRIDE = CARD_W + GAP;

export function InstructorRail({ items }: { items: RailInstructor[] }) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(1);
  const [page, setPage] = useState(0);

  const measure = useCallback(() => {
    const el = viewRef.current;
    if (!el) return;
    // (뷰 폭 + GAP) / STRIDE 의 내림 = 잘리지 않고 들어가는 카드 수
    setPerPage(Math.max(1, Math.floor((el.clientWidth + GAP) / STRIDE)));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  // perPage 변화로 페이지 수가 줄면 현재 페이지 보정
  useEffect(() => {
    setPage((p) => Math.min(p, pageCount - 1));
  }, [pageCount]);

  const go = (dir: 1 | -1) =>
    setPage((p) => (p + dir + pageCount) % pageCount);

  // 페이지 p 의 첫 카드 왼쪽을 뷰 좌측에 정렬 → 카드 경계에서만 멈춰 잘림 없음
  const offset = page * perPage * STRIDE;

  return (
    <div className="irailwrap">
      <button
        type="button"
        className="irail-nav prev"
        aria-label="이전 강사"
        onClick={() => go(-1)}
      >
        ‹
      </button>
      <div className="irailview" ref={viewRef}>
        <div
          className="irailtrack"
          style={{ transform: `translateX(-${offset}px)` }}
        >
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
      </div>
      <button
        type="button"
        className="irail-nav next"
        aria-label="다음 강사"
        onClick={() => go(1)}
      >
        ›
      </button>
    </div>
  );
}
