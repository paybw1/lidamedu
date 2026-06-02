// 판례 공식 전문 PDF 미적재 목록 — staff 가 어떤 사건번호가 적재 안 됐는지 확인.
//
// 분류:
//   - 텍스트도 PDF도 없음 (완전 미적재) — API 인덱싱 누락·미매칭 등
//   - 텍스트만 있고 PDF 없음 — 폰트 미커버(한자·특수문자) 또는 upload 에러
// 액션: 학습 화면(/subjects/:subject/cases/:caseId) link 만 제공.

import { ExternalLinkIcon, FileTextIcon } from "lucide-react";
import { Form, Link, data, redirect, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Chip } from "~/features/admin/components/admin-ui";
import { COURT_LABELS, type CaseCourt } from "~/features/cases/labels";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-case-pdf-missing";

export const meta: Route.MetaFunction = () => [
  { title: "전문 PDF 미적재 판례 | Lidam Patent Attorney Academy" },
];

const FILTER_OPTIONS = ["all", "no_text", "text_only"] as const;
type Filter = (typeof FILTER_OPTIONS)[number];
const FILTER_LABEL: Record<Filter, string> = {
  all: "전체",
  no_text: "완전 미적재 (텍스트도 없음)",
  text_only: "텍스트만 있음 (PDF 미커버·에러)",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/auth/login?next=/admin/cases/pdf-missing");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const subjectRaw = url.searchParams.get("subject") ?? "all";
  const subject: LawSubjectSlug | "all" =
    subjectRaw === "all" ||
    !LAW_SUBJECT_SLUGS.includes(subjectRaw as LawSubjectSlug)
      ? "all"
      : (subjectRaw as LawSubjectSlug);
  const filterRaw = (url.searchParams.get("filter") ?? "all") as Filter;
  const filter: Filter = FILTER_OPTIONS.includes(filterRaw) ? filterRaw : "all";

  let q = client
    .from("cases")
    .select(
      "case_id, case_number, case_title, court, decided_at, subject_laws, official_text_md, official_text_pdf_path",
    )
    .is("official_text_pdf_path", null)
    .is("deleted_at", null);
  if (subject !== "all") q = q.contains("subject_laws", [subject]);
  if (filter === "no_text") q = q.is("official_text_md", null);
  else if (filter === "text_only") q = q.not("official_text_md", "is", null);
  const { data: rows, error } = await q.order("decided_at", { ascending: false });
  if (error) throw error;

  // 통계 — 필터 무시한 총량.
  const { data: statsRows } = await client
    .from("cases")
    .select("official_text_md, official_text_pdf_path")
    .is("deleted_at", null);
  const statTotal = statsRows?.length ?? 0;
  const statWithPdf =
    statsRows?.filter((r) => r.official_text_pdf_path != null).length ?? 0;
  const statTextOnly =
    statsRows?.filter(
      (r) =>
        r.official_text_pdf_path == null &&
        r.official_text_md != null &&
        r.official_text_md !== "",
    ).length ?? 0;
  const statMissing = statTotal - statWithPdf;
  const statNoText = statMissing - statTextOnly;

  return {
    rows: rows ?? [],
    subject,
    filter,
    stats: {
      total: statTotal,
      withPdf: statWithPdf,
      missing: statMissing,
      textOnly: statTextOnly,
      noText: statNoText,
    },
  };
}

export default function AdminCasePdfMissing({
  loaderData,
}: Route.ComponentProps) {
  const { rows, subject, filter, stats } = loaderData;
  const nav = useNavigation();
  const loading = nav.state === "loading";

  return (
    <AdminShell cluster="cases" title="전문 PDF 미적재 판례">
      {/* 통계 카드 */}
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="전체 판례" value={stats.total} />
        <StatCard label="PDF 적재됨" value={stats.withPdf} tone="emerald" />
        <StatCard
          label="텍스트만 있음 (미커버·에러)"
          value={stats.textOnly}
          tone="amber"
        />
        <StatCard
          label="완전 미적재"
          value={stats.noText}
          tone="rose"
        />
      </section>

      {/* 필터 */}
      <Form
        method="get"
        className="border-border mb-3 flex flex-wrap items-end gap-2 rounded-xl border p-3"
      >
        <div>
          <label className="text-muted-foreground mb-1 block text-[11px] font-medium">
            과목
          </label>
          <AdminSelect name="subject" defaultValue={subject}>
            <option value="all">전체</option>
            {LAW_SUBJECT_SLUGS.map((s) => (
              <option key={s} value={s}>
                {LAW_SUBJECTS[s].name}
              </option>
            ))}
          </AdminSelect>
        </div>
        <div>
          <label className="text-muted-foreground mb-1 block text-[11px] font-medium">
            분류
          </label>
          <AdminSelect name="filter" defaultValue={filter}>
            {FILTER_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {FILTER_LABEL[f]}
              </option>
            ))}
          </AdminSelect>
        </div>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "조회 중..." : "조회"}
        </Button>
        <p className="text-muted-foreground ml-auto text-xs">
          결과 <b>{rows.length}</b>건
        </p>
      </Form>

      {/* 표 */}
      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2 text-left">사건번호</th>
              <th className="px-3 py-2 text-left">사건명</th>
              <th className="px-3 py-2 text-left">법원</th>
              <th className="px-3 py-2 text-left">선고일</th>
              <th className="px-3 py-2 text-left">과목</th>
              <th className="px-3 py-2 text-left">텍스트</th>
              <th className="px-3 py-2 text-left">학습 화면</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-muted-foreground p-6 text-center text-xs"
                >
                  조건에 해당하는 판례가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const hasText = !!r.official_text_md && r.official_text_md !== "";
                const subjectOfRow =
                  (r.subject_laws as string[])?.find((s) =>
                    LAW_SUBJECT_SLUGS.includes(s as LawSubjectSlug),
                  ) ?? null;
                return (
                  <tr
                    key={r.case_id}
                    className="border-border/60 border-t hover:bg-muted/20"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.case_number}
                    </td>
                    <td className="px-3 py-2">
                      <div
                        className="max-w-md truncate text-xs"
                        title={r.case_title ?? ""}
                      >
                        {r.case_title}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {COURT_LABELS[r.court as CaseCourt] ?? r.court}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.decided_at}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {subjectOfRow
                        ? LAW_SUBJECTS[subjectOfRow as LawSubjectSlug]?.name ?? subjectOfRow
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {hasText ? (
                        <Chip tone="amber">
                          <FileTextIcon className="size-3" />
                          있음 ({r.official_text_md!.length}자)
                        </Chip>
                      ) : (
                        <Chip tone="coral">없음</Chip>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {subjectOfRow ? (
                        <Link
                          to={`/subjects/${subjectOfRow}/cases/${r.case_id}`}
                          className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          열기 <ExternalLinkIcon className="size-3" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
        💡 <b>완전 미적재</b> = 국가법령정보 OPEN API 에서 본문 매칭 실패 (인덱싱 누락,
        사건번호 부분일치 등). 강사가 사건번호 정정 후 일괄 적재 스크립트 재실행으로
        해결.
        <br />💡 <b>텍스트만 있음</b> = 텍스트는 적재됐으나 폰트가 못 그리는 글자(옛 한자,
        단위 기호 등)가 있어 PDF 생성 skip. 향후 폰트 교체(Noto Serif CJK KR 등) 시
        재생성.
      </p>
    </AdminShell>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "emerald" | "amber" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/40 bg-emerald-50/40 dark:border-emerald-700/40 dark:bg-emerald-950/30"
      : tone === "amber"
        ? "border-amber-300/40 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/30"
        : tone === "rose"
          ? "border-rose-300/40 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/30"
          : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
