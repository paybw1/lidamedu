// 학습보조 "복습 정리본" 공용 인쇄 셸 (오답노트·하이라이트·즐겨찾기·메모 공용).
// - 페이지별 워터마크(학생 이름 + 날짜 + 학원명) — position:fixed 라 인쇄 시 모든 페이지 반복.
// - 잉크 절약: 연한 회색 톤 기조. 진입 시 자동 인쇄 대화상자.
// - 화면 크롬 없음(study-aids.layout 게이트 하위) — 인쇄 격리 CSS 로 워터마크/툴바 토글.

import { useEffect, type ReactNode } from "react";

import { PrinterIcon, XIcon } from "lucide-react";

import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

// ★중복 제거 필수 — 특허·상표·디자인은 1차·2차 목록에 모두 있어서, 그냥 이어 붙이면
//   아래 groupBySubject 가 같은 과목 그룹을 두 번 내보낸다(특허 → 민법 → 특허 반복).
const SUBJECT_ORDER: LawSubjectSlug[] = [
  ...new Set<LawSubjectSlug>([
    ...FIRST_EXAM_LAW_SLUGS,
    ...SECOND_EXAM_LAW_SLUGS,
  ]),
];

// 과목 슬러그로 그룹핑 — 정해진 과목 순서 우선, 그 외(또는 null)는 "기타" 로.
export function groupBySubject<T extends { lawCode: string | null }>(
  items: T[],
): Array<{ key: string; name: string; items: T[] }> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const key = it.lawCode ?? "기타";
    const arr = m.get(key) ?? [];
    arr.push(it);
    m.set(key, arr);
  }
  const out: Array<{ key: string; name: string; items: T[] }> = [];
  for (const s of SUBJECT_ORDER)
    if (m.has(s)) out.push({ key: s, name: LAW_SUBJECTS[s].name, items: m.get(s)! });
  for (const [k, v] of m)
    if (!SUBJECT_ORDER.includes(k as LawSubjectSlug))
      out.push({ key: k, name: k === "기타" ? "기타" : k, items: v });
  return out;
}

export interface PrintWatermark {
  name: string;
  date: string;
}

export function StudyPrintShell({
  docTitle,
  subtitle,
  watermark,
  empty,
  emptyText,
  children,
}: {
  docTitle: string;
  subtitle: string;
  watermark: PrintWatermark;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  // 마운트 후 렌더가 끝날 시간을 주고 인쇄 대화상자 자동 호출.
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="paper-light min-h-screen bg-white text-neutral-800">
      <style>{`
        .print-watermark { display: none; }
        @media print {
          .no-print { display: none !important; }
          @page { margin: 14mm; }
          .pb-avoid { break-inside: avoid; }
          /* position:fixed 요소는 인쇄 시 모든 페이지에 반복 렌더된다 → 페이지별 워터마크. */
          .print-watermark { display: flex !important; }
        }
      `}</style>

      {/* 페이지별 워터마크 (인쇄 전용, 본문 뒤·연한 회색) */}
      <div
        aria-hidden
        className="print-watermark pointer-events-none fixed inset-0 z-0 items-center justify-center overflow-hidden"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        <div className="rotate-[-30deg] text-center select-none">
          <div className="text-[56px] font-extrabold tracking-[0.15em] text-neutral-300/60">
            {watermark.name}
          </div>
          <div className="mt-2 text-[20px] font-bold tracking-[0.3em] text-neutral-300/50">
            리담변리사학원 · {watermark.date}
          </div>
        </div>
      </div>

      {/* 화면 전용 툴바 (인쇄 제외) */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <p className="text-sm font-semibold text-neutral-700">
          {docTitle} — 인쇄 대화상자에서 “PDF로 저장”을 선택하세요.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-700 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-neutral-600"
          >
            <PrinterIcon className="size-3.5" /> PDF로 저장 / 인쇄
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-100"
          >
            <XIcon className="size-3.5" /> 닫기
          </button>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-8 py-8">
        <header className="mb-6 border-b border-neutral-300 pb-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-700">
            {docTitle}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {watermark.name} · {watermark.date} 기준
          </p>
        </header>

        {empty ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            {emptyText ?? "내용이 없습니다."}
          </p>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// 과목 그룹 섹션 헤더 — 4개 정리본 공용.
export function SubjectGroupHeading({
  name,
  count,
}: {
  name: string;
  count: number;
}) {
  return (
    <h3 className="mb-2 border-l-2 border-neutral-400 pl-2 text-base font-bold text-neutral-700">
      {name}{" "}
      <span className="text-sm font-normal text-neutral-500">({count})</span>
    </h3>
  );
}
