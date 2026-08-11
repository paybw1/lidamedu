// 주관식 강의자료 인쇄본 — 운영자(staff) 전용. 문제(발문)·자기점검 체크리스트·채점기준·
// 모범답안을 강의 배포용 문서로 조판해 브라우저 인쇄(→ PDF 저장)로 내려받는다.
// - 섹션(문제/체크리스트/채점기준/모범답안)마다 새 페이지에서 시작.
// - 페이지별 워터마크(발급자·날짜) + 푸터 고지 — 강의자료 유출 방지 정책과 동일 기조.
// - subjects.layout 밖 등록(과목 접근 게이트 무관) — loader 에서 staff 게이트.

import { useEffect } from "react";

import { PrinterIcon, XIcon } from "lucide-react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import { getPrintWatermark } from "~/features/study/queries-print.server";
import {
  LAW_SUBJECTS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/problem-handout-print";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: d ? `${d.docTitle} 강의자료 | 리담변리사학원` : "강의자료" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const staffRole = await getStaffRole(client, user.id);
  if (!staffRole) throw data("Forbidden", { status: 403 });
  if (!params.problemId) throw data("Not Found", { status: 404 });

  const { data: p, error } = await client
    .from("problems")
    .select(
      "problem_id, format, year, exam_round, exam_round_no, problem_number, total_points, display_no, body_md, model_answer_md, grading_rubric_md, rubric_items, laws!inner(law_code)",
    )
    .eq("problem_id", params.problemId)
    .is("deleted_at", null)
    .single();
  if (error || !p) throw data("Not Found", { status: 404 });
  if (p.format !== "subjective") throw data("주관식 문제가 아닙니다", { status: 400 });

  const lawCode =
    (p.laws as { law_code: string } | null)?.law_code ?? params.subject ?? "";
  const subjectName =
    Object.prototype.hasOwnProperty.call(LAW_SUBJECTS, lawCode)
      ? LAW_SUBJECTS[lawCode as LawSubjectSlug].name
      : lawCode;
  const roundLabel =
    p.exam_round === "second" ? "제2차 시험" : p.exam_round === "first" ? "제1차 시험" : "";
  const docTitle = [
    p.year ? `${p.year}년` : null,
    p.exam_round_no ? `제${p.exam_round_no}회` : null,
    `변리사 ${roundLabel}`,
    subjectName,
    p.problem_number ? `문제 ${p.problem_number}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const watermark = await getPrintWatermark(client, user.id);
  const rubricItems = Array.isArray(p.rubric_items)
    ? (p.rubric_items as Array<{ label: string; points: number }>)
    : [];

  return data(
    {
      docTitle,
      subjectName,
      totalPoints: p.total_points,
      displayNo: p.display_no,
      bodyMd: p.body_md ?? "",
      modelAnswerMd: p.model_answer_md ?? "",
      gradingRubricMd: p.grading_rubric_md ?? "",
      rubricItems,
      watermark,
    },
    { headers },
  );
}

const MD = "text-[13px] leading-[1.75] text-neutral-800";

function SectionTitle({
  no,
  title,
  sub,
}: {
  no: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-4 border-b-2 border-neutral-700 pb-2">
      <h2 className="text-lg font-extrabold tracking-tight text-neutral-800">
        <span className="mr-2 text-neutral-500">{no}.</span>
        {title}
      </h2>
      {sub ? <p className="mt-0.5 text-xs text-neutral-500">{sub}</p> : null}
    </div>
  );
}

export default function ProblemHandoutPrint({
  loaderData,
}: Route.ComponentProps) {
  const {
    docTitle,
    totalPoints,
    displayNo,
    bodyMd,
    modelAnswerMd,
    gradingRubricMd,
    rubricItems,
    watermark,
  } = loaderData;

  useEffect(() => {
    const t = setTimeout(() => window.print(), 700);
    return () => clearTimeout(t);
  }, []);

  const itemSum = rubricItems.reduce((s, it) => s + (it.points ?? 0), 0);

  return (
    <div className="paper-light min-h-screen bg-white text-neutral-800">
      <style>{`
        .print-watermark, .print-footer { display: none; }
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 16mm 15mm 18mm; }
          .page-break { break-before: page; }
          .pb-avoid { break-inside: avoid; }
          .print-watermark { display: flex !important; }
          .print-footer { display: block !important; }
          /* 표는 페이지에 걸쳐도 헤더 반복 */
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>

      {/* 페이지별 워터마크 (인쇄 전용) */}
      <div
        aria-hidden
        className="print-watermark pointer-events-none fixed inset-0 z-0 items-center justify-center overflow-hidden"
        style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
      >
        <div className="rotate-[-30deg] text-center select-none">
          <div className="text-[46px] font-extrabold tracking-[0.15em] text-neutral-300/50">
            리담변리사학원
          </div>
          <div className="mt-2 text-[16px] font-bold tracking-[0.25em] text-neutral-300/45">
            {watermark.name} · {watermark.date}
          </div>
        </div>
      </div>

      {/* 페이지별 푸터 고지 (인쇄 전용) */}
      <div
        aria-hidden
        className="print-footer fixed inset-x-0 bottom-0 z-0 text-center text-[9px] tracking-wide text-neutral-400"
      >
        ⓒ 리담변리사학원 — 내부 강의자료 · 무단 복제·배포 금지
      </div>

      {/* 화면 전용 툴바 */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-5 py-3 backdrop-blur">
        <p className="text-sm font-semibold text-neutral-700">
          강의자료 — 인쇄 대화상자에서 “PDF로 저장”을 선택하세요.
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
        {/* 표지 헤더 */}
        <header className="mb-8 border-b-4 border-double border-neutral-700 pb-4">
          <p className="text-[11px] font-bold tracking-[0.3em] text-neutral-500">
            리담변리사학원 · 강의자료
          </p>
          <h1 className="mt-1.5 text-[22px] leading-snug font-extrabold tracking-tight text-neutral-800">
            {docTitle}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500">
            {totalPoints != null ? `배점 ${totalPoints}점` : null}
            {displayNo != null ? ` · P-${displayNo}` : null}
            {" · 발급 "}
            {watermark.name} · {watermark.date}
          </p>
        </header>

        {/* Ⅰ. 문제 */}
        <section>
          <SectionTitle
            no="Ⅰ"
            title="문제"
            sub={totalPoints != null ? `배점 ${totalPoints}점` : undefined}
          />
          <MarkdownView text={bodyMd} className={MD} />
        </section>

        {/* Ⅱ. 자기점검 체크리스트 */}
        {rubricItems.length > 0 ? (
          <section className="page-break mt-10">
            <SectionTitle
              no="Ⅱ"
              title="자기점검 체크리스트"
              sub={`${rubricItems.length}개 항목 · 배점 합 ${itemSum}점 — 답안 작성 후 항목별로 스스로 점검`}
            />
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-y-2 border-neutral-600 text-left">
                  <th className="w-8 py-1.5 text-center font-bold">✓</th>
                  <th className="py-1.5 font-bold">점검 항목</th>
                  <th className="w-14 py-1.5 text-right font-bold">배점</th>
                </tr>
              </thead>
              <tbody>
                {rubricItems.map((it, i) => (
                  <tr key={i} className="border-b border-neutral-300 align-top">
                    <td className="py-2 text-center">
                      <span className="inline-block size-3.5 rounded-[3px] border border-neutral-500 align-middle" />
                    </td>
                    <td className="py-2 pr-3 leading-relaxed">{it.label}</td>
                    <td className="py-2 text-right tabular-nums">
                      {it.points}점
                    </td>
                  </tr>
                ))}
                <tr className="border-b-2 border-neutral-600">
                  <td />
                  <td className="py-1.5 text-right text-xs font-bold text-neutral-500">
                    합계
                  </td>
                  <td className="py-1.5 text-right font-bold tabular-nums">
                    {itemSum}점
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : null}

        {/* Ⅲ. 채점기준 */}
        {gradingRubricMd.trim() ? (
          <section className="page-break mt-10">
            <SectionTitle
              no="Ⅲ"
              title="채점기준"
              sub="핵심 쟁점·배점, 축별 채점 기준(논점 추출 40% · 목차/구성 25% · 답안 작성/논증 35%), 감점 주의"
            />
            <MarkdownView text={gradingRubricMd} className={MD} />
          </section>
        ) : null}

        {/* Ⅳ. 모범답안 */}
        {modelAnswerMd.trim() ? (
          <section className="page-break mt-10">
            <SectionTitle no="Ⅳ" title="모범답안" />
            <MarkdownView text={modelAnswerMd} className={MD} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
