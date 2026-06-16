// 오답노트 "복습 정리본" — 인쇄 → PDF 저장 전용. 공용 StudyPrintShell 사용.
// 오답 문제의 전문·선택지·정답·해설을 정리해 문서로 렌더한다.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  StudyPrintShell,
  SubjectGroupHeading,
  groupBySubject,
} from "~/features/study/components/study-print-shell";
import {
  getPrintWatermark,
  getWrongNotePrintData,
  type WrongMcqPrintItem,
  type WrongOxPrintItem,
} from "~/features/study/queries-print.server";
import {
  LAW_SUBJECTS,
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

  const [{ mcq, ox }, watermark] = await Promise.all([
    getWrongNotePrintData(client, user.id, lawCode),
    getPrintWatermark(client, user.id),
  ]);
  return data(
    {
      mcq,
      ox,
      watermark,
      subjectName: lawCode ? LAW_SUBJECTS[lawCode].name : null,
    },
    { headers },
  );
}

// 원형 숫자(①②…⑳), 범위 밖이면 "n." 표기.
function circled(n: number): string {
  return n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `${n}.`;
}

// 선택지·지문 앞 중복 마커 제거 — 위치 기반 번호를 다시 매기므로.
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
  const { mcq, ox, watermark, subjectName } = loaderData;
  const mcqGroups = groupBySubject(mcq);
  const oxGroups = groupBySubject(ox);

  return (
    <StudyPrintShell
      docTitle="오답노트 복습 정리본"
      subtitle={`${subjectName ? `${subjectName} · ` : "전체 과목 · "}객관식 오답 ${mcq.length}개 · 정오문제 오답 ${ox.length}개`}
      watermark={watermark}
      empty={mcq.length === 0 && ox.length === 0}
      emptyText="오답이 없습니다. 🎉"
    >
      {mcq.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-neutral-700">객관식 오답</h2>
          {mcqGroups.map((g) => (
            <div key={g.key} className="mb-5">
              <SubjectGroupHeading name={g.name} count={g.items.length} />
              <div className="space-y-4">
                {g.items.map((p, i) => (
                  <McqBlock key={p.problemId} item={p} ordinal={i + 1} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {ox.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-bold text-neutral-700">
            정오문제 오답
          </h2>
          {oxGroups.map((g) => (
            <div key={g.key} className="mb-5">
              <SubjectGroupHeading name={g.name} count={g.items.length} />
              <div className="space-y-4">
                {g.items.map((o, i) => (
                  <OxBlock key={`${o.refType}:${o.refId}`} item={o} ordinal={i + 1} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </StudyPrintShell>
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
        <span className="text-sm font-bold text-neutral-700">문제 {ordinal}</span>
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
              <span className="shrink-0 font-semibold text-neutral-600">
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
