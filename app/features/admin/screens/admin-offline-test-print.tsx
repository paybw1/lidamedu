// feat-7-042 — 오프라인 테스트 인쇄 화면 (문제지 / ?answers=1 정답·해설지).
// 브라우저 인쇄 대화상자에서 "PDF로 저장" — study-print-shell 과 같은 @media print 패턴.

import { PrinterIcon, XIcon } from "lucide-react";
import { type CSSProperties, useEffect } from "react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { roleAtLeast } from "~/core/lib/roles";
import { getCohortById } from "~/features/cohorts/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { offlineTestSubjectName } from "~/features/offline-tests/labels";
import {
  getOfflineTestPrintData,
  type OfflineTestPrintQuestion,
} from "~/features/offline-tests/queries.server";

import type { Route } from "./+types/admin-offline-test-print";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d) return [{ title: "시험지 인쇄 | 리담변리사학원" }];
  return [
    { title: `${d.test.title}${d.answers ? " (정답)" : ""} | 리담변리사학원` },
  ];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.cohortId || !params.assignmentId || !params.testId) {
    throw data("Missing params", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const cohort = await getCohortById(client, params.cohortId);
  if (!cohort) throw data("Cohort not found", { status: 404 });
  if (!roleAtLeast(role, "manager") && cohort.ownerId !== user.id) {
    throw data("본인 소유 반만 접근 가능", { status: 403 });
  }

  const test = await getOfflineTestPrintData(client, params.testId);
  if (!test) throw data("Test not found", { status: 404 });

  const answers = new URL(request.url).searchParams.get("answers") === "1";
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const dateStr = `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
  return { cohortName: cohort.name, test, answers, dateStr };
}

// 원형 숫자 ①~⑳ — 범위 밖은 "n)" 표기.
function circled(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  return `${n})`;
}

// 빈칸 본문 — [[BLANK:N]] 토큰을 밑줄 공란(문제지) / 정답(정답지)으로 치환해 렌더.
function BlankBody({
  bodyText,
  blanks,
  showAnswers,
}: {
  bodyText: string;
  blanks: Array<{ idx: number; answer: string; length: number }>;
  showAnswers: boolean;
}) {
  const answerByIdx = new Map(blanks.map((b) => [b.idx, b] as const));
  const parts = bodyText.split(/(\[\[BLANK:\d+\]\])/g);
  return (
    <p className="text-[13px] leading-[1.9] whitespace-pre-wrap text-neutral-800">
      {parts.map((part, i) => {
        const m = /^\[\[BLANK:(\d+)\]\]$/.exec(part);
        if (!m) return <span key={i}>{part}</span>;
        const idx = Number(m[1]);
        const b = answerByIdx.get(idx);
        if (showAnswers) {
          return (
            <span
              key={i}
              className="mx-0.5 border-b-2 border-neutral-700 px-1 font-bold text-neutral-900"
            >
              ({idx}) {b?.answer ?? ""}
            </span>
          );
        }
        // 공란 폭 = 정답 길이 기반 (최소 4자).
        const width = Math.max(4, b?.length ?? b?.answer.length ?? 4);
        return (
          <span
            key={i}
            className="mx-0.5 inline-flex items-end border-b-2 border-neutral-700 align-baseline"
            style={{ minWidth: `${width * 0.9 + 1.5}em` }}
          >
            <span className="text-[11px] text-neutral-500">({idx})</span>
            <span aria-hidden>&nbsp;</span>
          </span>
        );
      })}
    </p>
  );
}

// 빈칸 본문 — 본문 세그먼트 + "함께 공부할 조문"(시행령 등) 박스 세그먼트를 순서대로.
function BlankSegments({
  blank,
  showAnswers,
}: {
  blank: NonNullable<OfflineTestPrintQuestion["blank"]>;
  showAnswers: boolean;
}) {
  return (
    <div className="space-y-2 rounded border border-neutral-300 px-3 py-2.5">
      {blank.segments.map((seg, i) =>
        seg.kind === "sub" ? (
          <div
            key={i}
            className="rounded border border-neutral-400 bg-neutral-50 px-3 py-2"
          >
            <p className="mb-1 text-[11px] font-bold text-neutral-600">
              {seg.title}
            </p>
            <BlankBody
              bodyText={seg.text}
              blanks={blank.blanks}
              showAnswers={showAnswers}
            />
          </div>
        ) : (
          <BlankBody
            key={i}
            bodyText={seg.text}
            blanks={blank.blanks}
            showAnswers={showAnswers}
          />
        ),
      )}
    </div>
  );
}

function QuestionBlock({
  q,
  answers,
}: {
  q: OfflineTestPrintQuestion;
  answers: boolean;
}) {
  return (
    <div className="pb-avoid mb-5 border-b border-dashed border-neutral-200 pb-5 last:border-b-0">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[15px] font-extrabold text-neutral-900 tabular-nums">
          {q.ord + 1}.
        </span>
        <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-[10px] text-neutral-500 tabular-nums">
          {q.points}점
        </span>
        {q.questionType === "ox" ? (
          <span className="text-[12px] text-neutral-600">
            다음 진술이 옳으면 O, 틀리면 X 를 고르시오.
          </span>
        ) : null}
        {q.questionType === "blank" && q.blank ? (
          <span className="text-[12px] text-neutral-600">
            다음 조문({q.blank.articleLabel})의 빈칸을 채우시오.
          </span>
        ) : null}
      </div>

      {q.questionType === "mcq" && q.mcq ? (
        <div>
          <div className="text-[13px] leading-relaxed text-neutral-800">
            <MarkdownView text={q.mcq.bodyMd} className="text-[13px] leading-relaxed" />
          </div>
          {q.mcq.boxItems.length > 0 ? (
            <ul className="mt-2 space-y-1 rounded border border-neutral-300 px-3 py-2">
              {q.mcq.boxItems.map((b, i) => (
                <li
                  key={i}
                  className="flex gap-1.5 text-[13px] leading-relaxed text-neutral-800"
                >
                  {b.marker ? (
                    <span className="shrink-0 font-bold">{b.marker}.</span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <MarkdownView
                      text={b.bodyMd}
                      className="text-[13px] leading-relaxed"
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <ol className="mt-2 space-y-1">
            {q.mcq.choices.map((c) => {
              const highlight = answers && c.isCorrect;
              return (
                <li
                  key={c.index}
                  className={
                    highlight
                      ? "flex gap-1.5 rounded bg-neutral-100 px-1.5 py-0.5 font-bold text-neutral-900"
                      : "flex gap-1.5 text-neutral-800"
                  }
                >
                  <span className="shrink-0 text-[13px]">{circled(c.index)}</span>
                  <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                    <MarkdownView text={c.bodyMd} className="text-[13px] leading-relaxed" />
                  </div>
                  {highlight ? <span className="shrink-0 text-[13px]">✓ 정답</span> : null}
                </li>
              );
            })}
          </ol>
          {answers && q.mcq.explanationMd ? (
            <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[12px] leading-relaxed text-neutral-700">
              <span className="mr-1 font-bold">해설</span>
              <MarkdownView
                text={q.mcq.explanationMd}
                className="text-[12px] leading-relaxed"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {q.questionType === "ox" && q.ox ? (
        <div>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-neutral-800">
              <MarkdownView
                text={q.ox.statementMd}
                className="text-[13px] leading-relaxed"
              />
            </div>
            <span className="shrink-0 text-[14px] font-bold text-neutral-800 tabular-nums">
              {answers ? (
                <span className="rounded bg-neutral-100 px-2 py-0.5">
                  정답 {q.ox.truth}
                </span>
              ) : (
                "( O / X )"
              )}
            </span>
          </div>
          {answers && q.ox.explanationMd ? (
            <div className="mt-2 rounded border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[12px] leading-relaxed text-neutral-700">
              <span className="mr-1 font-bold">해설</span>
              <MarkdownView
                text={q.ox.explanationMd}
                className="text-[12px] leading-relaxed"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {q.questionType === "blank" && q.blank ? (
        <BlankSegments blank={q.blank} showAnswers={answers} />
      ) : null}
    </div>
  );
}

// 빠른 채점표 — 정답지 상단. 객관식=①~⑤, OX=O/X, 빈칸=답 나열.
function AnswerKeyTable({ questions }: { questions: OfflineTestPrintQuestion[] }) {
  return (
    <div className="pb-avoid mb-6 rounded border border-neutral-300">
      <p className="border-b border-neutral-300 bg-neutral-50 px-3 py-1.5 text-[12px] font-bold text-neutral-700">
        빠른 채점표
      </p>
      <div className="grid grid-cols-2 gap-x-6 px-3 py-2 sm:grid-cols-3">
        {questions.map((q) => {
          const answer =
            q.questionType === "mcq"
              ? (q.mcq?.choices.find((c) => c.isCorrect)
                  ? circled(q.mcq.choices.find((c) => c.isCorrect)!.index)
                  : "—")
              : q.questionType === "ox"
                ? (q.ox?.truth ?? "—")
                : (q.blank?.blanks.map((b) => b.answer).join(", ") ?? "—");
          return (
            <p key={q.ord} className="flex gap-1.5 py-0.5 text-[12px] text-neutral-800">
              <span className="w-6 shrink-0 text-right font-bold tabular-nums">
                {q.ord + 1}.
              </span>
              <span className="min-w-0 flex-1 break-words">{answer}</span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminOfflineTestPrint({
  loaderData,
}: Route.ComponentProps) {
  const { cohortName, test, answers, dateStr } = loaderData;

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-screen bg-white text-neutral-800"
      // 인쇄는 테마와 무관하게 항상 라이트(어두운 글씨). 다크 모드 사용자도 흰 종이에
      // MarkdownView(text-foreground 토큰) 본문이 진하게 나오도록 토큰을 라이트 값으로 고정.
      style={
        {
          "--background": "#ffffff",
          "--foreground": "#1f1f1f",
          "--muted": "#eef2f7",
          "--muted-foreground": "#475569",
          "--border": "#d4d4d8",
          "--link": "#1e3a8a",
          colorScheme: "light",
        } as CSSProperties
      }
    >
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 14mm; }
          .pb-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* 화면 전용 툴바 */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <p className="text-sm font-semibold text-neutral-700">
          {test.title} {answers ? "— 정답·해설지" : "— 문제지"} · 인쇄
          대화상자에서 "PDF로 저장"을 선택하세요.
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

      <div className="mx-auto max-w-3xl px-8 py-8">
        {/* 시험 머리표 */}
        <header className="pb-avoid mb-6 border-2 border-neutral-800">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
            <p className="text-[12px] font-bold tracking-widest text-neutral-600">
              리담변리사학원 · {cohortName}
            </p>
            <p className="text-[12px] text-neutral-500">{dateStr}</p>
          </div>
          <div className="px-4 py-3 text-center">
            <h1 className="text-xl font-extrabold tracking-tight text-neutral-900">
              {test.title}
              {answers ? (
                <span className="ml-2 rounded bg-neutral-800 px-2 py-0.5 align-middle text-[13px] font-bold text-white">
                  정답 및 해설
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-[13px] text-neutral-600 tabular-nums">
              과목: {offlineTestSubjectName(test)} · {test.questions.length}
              문항 · {test.totalPoints}점
              {test.durationMin ? ` · 시험시간 ${test.durationMin}분` : ""}
            </p>
          </div>
          {!answers ? (
            <div className="flex border-t border-neutral-800 text-[13px]">
              <div className="flex flex-1 items-center gap-2 border-r border-neutral-400 px-4 py-2.5">
                <span className="shrink-0 font-bold text-neutral-700">성명</span>
                <span className="min-w-0 flex-1 border-b border-neutral-400" />
              </div>
              <div className="flex flex-1 items-center gap-2 px-4 py-2.5">
                <span className="shrink-0 font-bold text-neutral-700">수험번호</span>
                <span className="min-w-0 flex-1 border-b border-neutral-400" />
              </div>
            </div>
          ) : null}
        </header>

        {/* 응시 안내 */}
        {!answers && test.instructionsMd ? (
          <div className="pb-avoid mb-6 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap text-neutral-700">
            {test.instructionsMd}
          </div>
        ) : null}

        {answers ? <AnswerKeyTable questions={test.questions} /> : null}

        {test.questions.length === 0 ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            문항이 없습니다. 빌더에서 문항을 추가하세요.
          </p>
        ) : (
          test.questions.map((q) => (
            <QuestionBlock key={q.ord} q={q} answers={answers} />
          ))
        )}
      </div>
    </div>
  );
}
