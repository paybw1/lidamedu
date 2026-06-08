// 오답노트 "복습 정리본" — 인쇄 → PDF 저장 전용 화면.
// 화면 스크린샷이 아니라, 오답 문제의 전문·선택지·정답·해설을 정리해 문서로 렌더한다.
// 진입 시 자동으로 인쇄 대화상자를 띄운다(사용자가 "PDF로 저장" 선택).
// 라우트는 study-aids.layout(접근 게이트) 아래 → 인증·구독 검증 유지. 글로벌 네비 크롬 없음.

import { useEffect } from "react";

import { PrinterIcon, XIcon } from "lucide-react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { getWrongNotePrintData } from "~/features/study/queries-print.server";
import type {
  WrongMcqPrintItem,
  WrongOxPrintItem,
} from "~/features/study/queries-print.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  SECOND_EXAM_LAW_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/wrong-note-print";

export const meta: Route.MetaFunction = () => [
  { title: "오답노트 복습 정리본 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const url = new URL(request.url);
  const sub = url.searchParams.get("subject");
  const lawCode =
    sub && Object.prototype.hasOwnProperty.call(LAW_SUBJECTS, sub)
      ? (sub as LawSubjectSlug)
      : undefined;

  const { mcq, ox } = await getWrongNotePrintData(client, user.id, lawCode);
  return data(
    { mcq, ox, subjectName: lawCode ? LAW_SUBJECTS[lawCode].name : null },
    { headers },
  );
}

const SUBJECT_ORDER: LawSubjectSlug[] = [
  ...FIRST_EXAM_LAW_SLUGS,
  ...SECOND_EXAM_LAW_SLUGS,
];

function groupBySubject<T extends { lawCode: LawSubjectSlug }>(
  items: T[],
): Array<{ slug: LawSubjectSlug; name: string; items: T[] }> {
  const m = new Map<LawSubjectSlug, T[]>();
  for (const it of items) {
    const arr = m.get(it.lawCode) ?? [];
    arr.push(it);
    m.set(it.lawCode, arr);
  }
  return SUBJECT_ORDER.filter((s) => m.has(s)).map((s) => ({
    slug: s,
    name: LAW_SUBJECTS[s].name,
    items: m.get(s)!,
  }));
}

// 원형 숫자(①②…⑳), 범위 밖이면 "n." 표기.
function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `${n}.`;
}

// 선택지·지문 앞 중복 마커 제거 — 우리가 위치 기반 번호를 다시 매기므로.
const LEADING_MARKER =
  /^(?:[([（［][가-힣ㄱ-ㅎ\d]+[)\]）］]|[가-힣ㄱ-ㅎ]\.|[①-⑳]|\d+[.)])\s*/;
function stripMarker(text: string): string {
  let s = text.trimStart();
  while (LEADING_MARKER.test(s)) s = s.replace(LEADING_MARKER, "").trimStart();
  return s;
}

function metaLine(
  articleLabel: string | null,
  year: number | null,
  num: number | null,
  attempts: number,
): string {
  const parts: string[] = [];
  if (articleLabel) parts.push(articleLabel);
  if (year) parts.push(`${year}년${num ? ` ${num}번` : ""}`);
  parts.push(`시도 ${attempts}회`);
  return parts.join(" · ");
}

const MD_TEXT = "text-neutral-800";

export default function WrongNotePrint({ loaderData }: Route.ComponentProps) {
  const { mcq, ox, subjectName } = loaderData;

  // 마운트 후 마크다운·폰트 렌더가 끝날 시간을 주고 인쇄 대화상자 자동 호출.
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  const mcqGroups = groupBySubject(mcq);
  const oxGroups = groupBySubject(ox);
  const empty = mcq.length === 0 && ox.length === 0;

  return (
    <div className="min-h-screen bg-white text-neutral-800">
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
        <span className="rotate-[-30deg] text-[64px] font-extrabold tracking-[0.2em] text-neutral-300/60 select-none">
          리담변리사학원
        </span>
      </div>

      {/* 화면에서만 보이는 툴바 (인쇄 제외) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <p className="text-sm font-semibold text-neutral-700">
          오답노트 복습 정리본 — 인쇄 대화상자에서 “PDF로 저장”을 선택하세요.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-neutral-700"
          >
            <PrinterIcon className="size-3.5" /> PDF로 저장 / 인쇄
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            <XIcon className="size-3.5" /> 닫기
          </button>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-8 py-8">
        {/* 표지 헤더 */}
        <header className="mb-6 border-b border-neutral-300 pb-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-neutral-700">
            오답노트 복습 정리본
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {subjectName ? `${subjectName} · ` : "전체 과목 · "}
            객관식 오답 {mcq.length}개 · 정오문제(OX) 오답 {ox.length}개
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            가장 최근 시도가 오답인 항목만 모았습니다. 다시 풀어 정답이면 노트에서
            자동으로 빠집니다.
          </p>
        </header>

        {empty ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            오답이 없습니다. 🎉
          </p>
        ) : null}

        {/* 객관식 */}
        {mcq.length > 0 ? (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-bold text-neutral-700">
              객관식 오답
            </h2>
            {mcqGroups.map((g) => (
              <div key={g.slug} className="mb-5">
                <h3 className="mb-2 border-l-2 border-neutral-400 pl-2 text-base font-bold text-neutral-700">
                  {g.name}{" "}
                  <span className="text-sm font-normal text-neutral-500">
                    ({g.items.length})
                  </span>
                </h3>
                <div className="space-y-4">
                  {g.items.map((p, i) => (
                    <McqBlock key={p.problemId} item={p} ordinal={i + 1} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {/* OX */}
        {ox.length > 0 ? (
          <section>
            <h2 className="mb-3 text-lg font-bold text-neutral-700">
              정오문제(OX) 오답
            </h2>
            {oxGroups.map((g) => (
              <div key={g.slug} className="mb-5">
                <h3 className="mb-2 border-l-2 border-neutral-400 pl-2 text-base font-bold text-neutral-700">
                  {g.name}{" "}
                  <span className="text-sm font-normal text-neutral-500">
                    ({g.items.length})
                  </span>
                </h3>
                <div className="space-y-4">
                  {g.items.map((o, i) => (
                    <OxBlock key={`${o.refType}:${o.refId}`} item={o} ordinal={i + 1} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function McqBlock({
  item,
  ordinal,
}: {
  item: WrongMcqPrintItem;
  ordinal: number;
}) {
  return (
    <article className="pb-avoid rounded-md border border-neutral-200 p-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-neutral-700">
          문제 {ordinal}
        </span>
        <span className="text-xs text-neutral-500">
          {metaLine(item.articleLabel, item.year, item.problemNumber, item.attempts)}
        </span>
      </div>
      <MarkdownView text={item.bodyMd} className={MD_TEXT} />

      {item.choices.length > 0 ? (
        <ol className="mt-2 space-y-1">
          {item.choices.map((c, i) => (
            <li
              key={c.index}
              className={
                c.isCorrect
                  ? "flex gap-1.5 border-l-2 border-emerald-500 px-2 py-1"
                  : "flex gap-1.5 px-2 py-1"
              }
            >
              <span className="shrink-0 font-semibold text-neutral-700">
                {circled(i + 1)}
              </span>
              <div className="min-w-0 flex-1">
                <MarkdownView text={stripMarker(c.bodyMd)} className={MD_TEXT} />
              </div>
              {c.isCorrect ? (
                <span className="shrink-0 self-start rounded border border-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                  정답
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {item.explanationMd ? (
        <div className="mt-2 border-l-2 border-neutral-200 py-1 pl-3">
          <p className="mb-0.5 text-[11px] font-bold text-neutral-500">해설</p>
          <MarkdownView text={item.explanationMd} className={MD_TEXT} />
        </div>
      ) : null}
    </article>
  );
}

function OxBlock({
  item,
  ordinal,
}: {
  item: WrongOxPrintItem;
  ordinal: number;
}) {
  return (
    <article className="pb-avoid rounded-md border border-neutral-200 p-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-neutral-700">지문 {ordinal}</span>
        <span className="text-xs text-neutral-500">
          {metaLine(item.articleLabel, item.year, item.problemNumber, item.attempts)}
        </span>
      </div>
      <MarkdownView text={stripMarker(item.statementMd)} className={MD_TEXT} />

      <div className="mt-2 flex items-center gap-3 text-sm">
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-neutral-500">내 답</span>
          <span className="inline-flex size-6 items-center justify-center rounded border border-rose-400 font-extrabold text-rose-700">
            {item.myAnswer}
          </span>
        </span>
        <span className="text-xs text-neutral-400">vs</span>
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-neutral-500">정답</span>
          <span className="inline-flex size-6 items-center justify-center rounded border border-emerald-500 font-extrabold text-emerald-700">
            {item.oxTruth}
          </span>
        </span>
      </div>

      {item.explanationMd ? (
        <div className="mt-2 border-l-2 border-neutral-200 py-1 pl-3">
          <p className="mb-0.5 text-[11px] font-bold text-neutral-500">해설</p>
          <MarkdownView text={item.explanationMd} className={MD_TEXT} />
        </div>
      ) : null}
    </article>
  );
}
