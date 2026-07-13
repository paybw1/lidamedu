// 랜딩 강사진 가로 레일 — 한 명씩 넘기는 캐러셀(스크롤바 없음, 카드 잘림 없음).
//   뷰 폭을 '완전히 보이는 카드 수'에 딱 맞춰 고정 → 옆 카드가 잘려 보이지 않음.
//   좌우 화살표는 항상 노출(끝에서는 흐려짐), 클릭 시 한 카드(STRIDE)씩 이동.
//   *.server 값 import 금지(빌드 함정).
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(1);
  const [index, setIndex] = useState(0); // 왼쪽 첫 카드의 인덱스

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const gutter = el.clientWidth < 520 ? 44 : 56; // 화살표 여백
    const avail = el.clientWidth - gutter * 2;
    const fit = Math.max(1, Math.floor((avail + GAP) / STRIDE));
    setPerPage(Math.min(fit, items.length));
  }, [items.length]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const maxIndex = Math.max(0, items.length - perPage);
  // perPage 변화로 범위를 벗어나면 보정
  useEffect(() => {
    setIndex((i) => Math.min(i, maxIndex));
  }, [maxIndex]);

  const go = (dir: 1 | -1) =>
    setIndex((i) => Math.min(maxIndex, Math.max(0, i + dir)));

  const viewW = perPage * CARD_W + (perPage - 1) * GAP; // 정확히 perPage장
  const offset = index * STRIDE;

  return (
    <div className="irailwrap" ref={wrapRef}>
      <button
        type="button"
        className="irail-nav prev"
        aria-label="이전 강사"
        onClick={() => go(-1)}
        disabled={index <= 0}
      >
        ‹
      </button>
      <div className="irailview" style={{ width: viewW }}>
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
        disabled={index >= maxIndex}
      >
        ›
      </button>
    </div>
  );
}
