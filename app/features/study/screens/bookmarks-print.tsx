// 즐겨찾기 "복습 정리본" — 인쇄 → PDF 저장. 공용 StudyPrintShell 사용.
//
// 두 가지 용도로 뽑을 수 있다(학생 요청, bug_reports cba3e267):
//  · 학습용 — 지문 O/X 와 메모를 함께 찍어 오답 반복 학습에 쓴다.
//  · 채점용 — O/X·메모를 감추고 정답을 맨 뒤에 모아 찍어 재풀이 후 채점에 쓴다.
// 항목마다 번호를 매겨 두 모드가 같은 번호를 공유한다(맨 뒤 정답표가 그 번호를 가리킨다).

import { useState } from "react";

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listAllBookmarks } from "~/features/annotations/queries.server";
import {
  StudyPrintShell,
  SubjectGroupHeading,
  groupBySubject,
} from "~/features/study/components/study-print-shell";
import { getPrintWatermark } from "~/features/study/queries-print.server";

import type { Route } from "./+types/bookmarks-print";

type BookmarkItem = Awaited<ReturnType<typeof listAllBookmarks>>[number];
type PrintMode = "study" | "grade";

export const meta: Route.MetaFunction = () => [
  { title: "즐겨찾기 복습 정리본 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, watermark] = await Promise.all([
    listAllBookmarks(client, user.id, { fullText: true }),
    getPrintWatermark(client, user.id),
  ]);
  return data({ items, watermark }, { headers });
}

export default function BookmarksPrint({ loaderData }: Route.ComponentProps) {
  const { items, watermark } = loaderData;
  const [mode, setMode] = useState<PrintMode>("study");
  const groups = groupBySubject(items);

  // 렌더 순서대로 1부터 번호를 매긴다 — 맨 뒤 정답표가 이 번호를 가리킨다.
  const numberOf = new Map<string, number>();
  let seq = 0;
  for (const g of groups)
    for (const b of g.items) numberOf.set(`${b.targetType}:${b.targetId}`, ++seq);

  const answerKey = groups
    .flatMap((g) => g.items)
    .filter((b) => b.oxTruth != null)
    .map((b) => ({
      no: numberOf.get(`${b.targetType}:${b.targetId}`)!,
      truth: b.oxTruth!,
    }));

  return (
    <StudyPrintShell
      docTitle="즐겨찾기 복습 정리본"
      subtitle={`전체 과목 · 즐겨찾기 ${items.length}개 (별점 높은 순)${
        mode === "grade" ? " · 채점용(정답 별지)" : ""
      }`}
      watermark={watermark}
      empty={items.length === 0}
      emptyText="즐겨찾기가 없습니다."
      controls={<ModeSwitch mode={mode} onChange={setMode} />}
    >
      {groups.map((g) => (
        <div key={g.key} className="mb-4">
          <SubjectGroupHeading name={g.name} count={g.items.length} />
          <div className="space-y-2">
            {g.items.map((b) => (
              <BookmarkBlock
                key={`${b.targetType}:${b.targetId}`}
                item={b}
                no={numberOf.get(`${b.targetType}:${b.targetId}`)!}
                mode={mode}
              />
            ))}
          </div>
        </div>
      ))}
      {mode === "grade" && answerKey.length > 0 ? (
        <AnswerKey entries={answerKey} />
      ) : null}
    </StudyPrintShell>
  );
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: PrintMode;
  onChange: (m: PrintMode) => void;
}) {
  const btn = (m: PrintMode, label: string, hint: string) => (
    <button
      key={m}
      type="button"
      onClick={() => onChange(m)}
      aria-pressed={mode === m}
      title={hint}
      className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
        mode === m
          ? "border-neutral-700 bg-neutral-700 text-white"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1.5">
      {btn("study", "학습용", "O/X 와 메모를 함께 인쇄합니다.")}
      {btn("grade", "채점용", "O/X·메모를 감추고 정답을 맨 뒤에 모아 인쇄합니다.")}
    </div>
  );
}

// 문제·지문 항목의 "정오문제 지문" 같은 유형명은 인쇄물에서 지면만 차지한다
// (학생 요청). 출처(2004년 · 6번)만 작게 남기고, 조문·판례는 라벨 자체가
// 내용 식별자이므로 유지한다.
function isProblemTarget(t: BookmarkItem["targetType"]): boolean {
  return t === "problem" || t === "problem_choice" || t === "problem_box_item";
}

function BookmarkBlock({
  item,
  no,
  mode,
}: {
  item: BookmarkItem;
  no: number;
  mode: PrintMode;
}) {
  const problemLike = isProblemTarget(item.targetType);
  const source = problemLike
    ? (item.secondaryLabel ?? item.primaryLabel)
    : item.secondaryLabel;
  const heading = problemLike ? null : item.primaryLabel;
  const showOx = mode === "study" && item.oxTruth != null;

  return (
    <article className="pb-avoid rounded border border-neutral-200 px-3 py-2">
      <div className="flex items-baseline gap-2 text-[11px] text-neutral-500">
        <span className="font-bold text-neutral-700 tabular-nums">{no}.</span>
        {source ? <span>{source}</span> : null}
        {showOx ? (
          <span className="rounded border border-neutral-400 px-1 font-bold text-neutral-700">
            {item.oxTruth}
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-amber-500">
          {"★".repeat(Math.max(1, item.starLevel))}
        </span>
      </div>
      {heading ? (
        <p className="mt-0.5 text-[14px] font-semibold tracking-tight text-neutral-800">
          {heading}
        </p>
      ) : null}
      {item.bodySnippet ? (
        <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-700">
          {item.bodySnippet}
        </p>
      ) : null}
      {mode === "study" && item.notePreview ? (
        <div className="mt-1.5 border-l-2 border-neutral-300 py-0.5 pl-3 text-[12px] leading-relaxed text-neutral-600">
          <span className="mr-1 font-bold">메모</span>
          {item.notePreview}
        </div>
      ) : null}
    </article>
  );
}

// 채점용 별지 — 번호 ↔ O/X 만. 새 페이지에서 시작해 접어두고 풀 수 있게 한다.
function AnswerKey({ entries }: { entries: Array<{ no: number; truth: string }> }) {
  return (
    <section
      className="mt-6 border-t-2 border-neutral-400 pt-4"
      style={{ breakBefore: "page" }}
    >
      <h2 className="mb-2 text-[15px] font-bold tracking-tight text-neutral-800">
        정답 ({entries.length}문항)
      </h2>
      <div className="grid grid-cols-6 gap-x-3 gap-y-1 text-[12px] text-neutral-700">
        {entries.map((e) => (
          <span key={e.no} className="tabular-nums">
            <span className="text-neutral-500">{e.no}.</span>{" "}
            <span className="font-bold">{e.truth}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
