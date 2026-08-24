// 원심 판결문 인쇄용 화면 (/admin/cases/lower-court/:caseId/print). **운영자 전용**.
//
// 시트에서 읽으면 PDF 추출본의 줄바꿈 때문에 문장이 조각나 보인다는 보고(원장 2026-08-24).
// 여기서는 문단을 복원해 A4 인쇄에 맞춰 그린다 — 브라우저 인쇄로 **PDF 저장**까지 된다.
// ★원본 PDF 는 서버에 보관하지 않는다(업로드 경로가 원본을 남기지 않음). 그래서 파일을
//   내려주는 대신 본문을 인쇄 가능한 형태로 다시 그린다.
import type { Route } from "./+types/lower-court-print";

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { reflowJudgmentText } from "~/features/cases/lib/lower-court-text";
import { getLowerCourtByCaseId } from "~/features/cases/queries-lower-court.server";
import { getCaseById } from "~/features/cases/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

export const meta: Route.MetaFunction = ({ data: d }) => [
  { title: d ? `${d.label} | 원심 판결문` : "원심 판결문" },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  // ★RLS(case_lower_courts staff SELECT)가 1차 방어지만, 화면 진입도 명시적으로 막는다.
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  if (!params.caseId) throw data("Not found", { status: 404 });

  const [lower, kase] = await Promise.all([
    getLowerCourtByCaseId(client, params.caseId),
    getCaseById(client, params.caseId),
  ]);
  if (!lower || lower.status !== "loaded")
    throw data("Not found", { status: 404 });

  const label =
    lower.sourceRef ??
    [lower.lowerCourt, lower.lowerCaseNumber].filter(Boolean).join(" ") ??
    "원심 판결문";

  return {
    label,
    caseNumber: kase?.caseNumber ?? "",
    caseTitle: kase?.caseTitle ?? "",
    charCount: lower.charCount,
    paragraphs: reflowJudgmentText(lower.bodyText),
  };
}

export default function LowerCourtPrint({ loaderData }: Route.ComponentProps) {
  const { label, caseNumber, caseTitle, charCount, paragraphs } = loaderData;
  return (
    <div className="mx-auto max-w-[820px] px-6 py-8 print:max-w-none print:px-0 print:py-0">
      {/* 인쇄에는 안 나가는 조작 줄 */}
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="bg-primary text-primary-foreground inline-flex h-8 items-center rounded-full px-4 text-xs font-semibold"
        >
          인쇄 · PDF로 저장
        </button>
        <span className="text-muted-foreground text-[11px]">
          인쇄 대화상자에서 대상을 「PDF로 저장」으로 고르세요 · 운영자 전용
        </span>
      </div>

      <header className="border-border mb-5 border-b pb-3">
        <h1 className="text-lg font-bold">원심 판결문</h1>
        <p className="text-muted-foreground mt-1 text-[13px]">
          {label}
          {caseNumber ? ` · 상고심 ${caseNumber}` : ""}
        </p>
        {caseTitle ? (
          <p className="text-muted-foreground mt-0.5 text-[12px]">
            {caseTitle}
          </p>
        ) : null}
        <p className="text-muted-foreground mt-1 text-[11px]">
          {charCount.toLocaleString("ko-KR")}자 · 문단 {paragraphs.length}개 —
          PDF 추출본을 문단 단위로 복원했습니다(원본 줄바꿈 아님)
        </p>
      </header>

      <article className="space-y-2.5">
        {paragraphs.map((p, i) => (
          <p
            key={i}
            className="text-[13.5px] leading-[1.85] [overflow-wrap:break-word] break-keep"
          >
            {p}
          </p>
        ))}
      </article>
    </div>
  );
}
