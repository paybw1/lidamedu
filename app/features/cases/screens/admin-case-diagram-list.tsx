// feat-2-035 — 판례 도식 목록(staff). 대상 판례를 나열하고 도식 유무·상태·사실관계 출처를 붙인다.
// 도식이 없는 판례도 보여야 해서 case_diagrams 가 아니라 cases 기준으로 나열한다.

import { CircleDashedIcon, FileTextIcon, SearchIcon } from "lucide-react";
import { Form, Link, data } from "react-router";

import { cn } from "~/core/lib/utils";
import { Input } from "~/core/components/ui/input";
import { AdminShell } from "~/features/admin/components/admin-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import { Chip } from "~/features/community/components/community-ui";
import {
  FACTS_SOURCE_LABEL,
  isLowerCourtSource,
} from "~/features/cases/lib/case-diagram";
import { listCaseDiagramTargets } from "~/features/cases/queries-case-diagram.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-case-diagram-list";

// 생성·노출 범위(설계 §1) — 스키마 제약이 아니라 운영 범위라 화면 상수로 둔다.
const TARGET_LAW = "patent";
const TARGET_FROM = "2005-01-01";

export const meta: Route.MetaFunction = () => [
  { title: "판례 도식 — 출제 관리 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const yearRaw = url.searchParams.get("year");
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  const statusRaw = url.searchParams.get("status");
  const status =
    statusRaw === "draft" ||
    statusRaw === "approved" ||
    statusRaw === "rejected" ||
    statusRaw === "none"
      ? statusRaw
      : null;
  const q = (url.searchParams.get("q") ?? "").trim();

  // 상태 필터는 목록에만 걸고, 헤더 카운트는 항상 전체 기준으로 낸다
  // (필터를 걸 때마다 "총 N건"이 바뀌면 진척도를 읽을 수 없다).
  const all = await listCaseDiagramTargets(client, {
    lawCode: TARGET_LAW,
    decidedFrom: TARGET_FROM,
    year,
  });
  const counts = {
    total: all.length,
    done: all.filter((r) => r.diagram?.reviewStatus === "approved").length,
    draft: all.filter((r) => r.diagram?.reviewStatus === "draft").length,
    none: all.filter((r) => r.diagram === null).length,
  };

  const rows = all
    .filter((r) =>
      !status
        ? true
        : status === "none"
          ? r.diagram === null
          : r.diagram?.reviewStatus === status,
    )
    .filter((r) => !q || r.caseNumber.includes(q) || r.caseTitle.includes(q));
  return { rows, counts, year, status, q, role };
}

export default function AdminCaseDiagramList({
  loaderData,
}: Route.ComponentProps) {
  const { rows, counts, year, status, q, role } = loaderData;
  return (
    <AdminShell
      cluster="cases"
      role={role}
      title="판례 도식"
      desc="2차 답안 작성 순서(사실관계 → 쟁점 → 법조문 → 법리 → 포섭 → 결론)로 판례를 도식화합니다. 승인한 도식만 학생에게 보입니다."
    >
      {/* 상태별 카운트를 그대로 필터 링크로 — "저장했는데 검수 대기를 어디서 보나"가
          바로 답이 되도록(원장 문의 2026-08-20). 연도 필터는 유지한 채 상태만 바꾼다. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">특허법 2005년 이후</span>
        {(
          [
            [null, "전체", counts.total],
            ["draft", "검수 대기", counts.draft],
            ["approved", "승인", counts.done],
            ["none", "미생성", counts.none],
          ] as [string | null, string, number][]
        ).map(([val, label, n]) => {
          const sp = new URLSearchParams();
          if (year) sp.set("year", String(year));
          if (q) sp.set("q", q);
          if (val) sp.set("status", val);
          const active = (status ?? null) === val;
          return (
            <Link
              key={label}
              to={`/admin/case-diagrams${sp.size ? `?${sp}` : ""}`}
              preventScrollReset
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
              <span className={active ? "" : "text-foreground"}>{n}</span>
            </Link>
          );
        })}
      </div>

      <Form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="사건번호·사건명"
            className="h-8 w-52 rounded-lg pl-8 text-xs"
          />
        </div>
        <select
          name="year"
          defaultValue={year ? String(year) : ""}
          className="border-border bg-background h-8 rounded-lg border px-2 text-xs"
        >
          <option value="">연도 전체</option>
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status ?? ""}
          className="border-border bg-background h-8 rounded-lg border px-2 text-xs"
        >
          <option value="">상태 전체</option>
          <option value="none">미생성</option>
          <option value="draft">검수 대기</option>
          <option value="approved">승인</option>
          <option value="rejected">반려</option>
        </select>
        <button
          type="submit"
          className="border-border hover:bg-muted h-8 rounded-lg border px-3 text-xs font-semibold"
        >
          적용
        </button>
      </Form>

      {rows.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          조건에 맞는 판례가 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.caseId}
              className="border-border bg-card rounded-xl border p-3 shadow-sm"
            >
              <Link
                to={`/admin/case-diagrams/${r.caseId}`}
                className="block"
                viewTransition
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {r.diagram ? (
                    <StatusChip status={r.diagram.reviewStatus} />
                  ) : (
                    <Chip tone="outline">
                      <CircleDashedIcon className="size-3" /> 미생성
                    </Chip>
                  )}
                  <Chip tone="outline">{r.caseNumber}</Chip>
                  <Chip tone="outline">{r.decidedAt}</Chip>
                  {r.diagram ? (
                    <>
                      <Chip tone="outline">쟁점 {r.diagram.blockCount}</Chip>
                      <Chip
                        tone={
                          isLowerCourtSource(r.diagram.factsSourceKind)
                            ? "primary"
                            : "outline"
                        }
                      >
                        <FileTextIcon className="size-3" />
                        {FACTS_SOURCE_LABEL[r.diagram.factsSourceKind]}
                      </Chip>
                      {!isLowerCourtSource(r.diagram.factsSourceKind) ? (
                        <Chip tone="amber">하급심 보강 필요</Chip>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <p className="text-foreground mt-1.5 line-clamp-2 text-sm">
                  {r.caseTitle}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

const YEAR_OPTIONS = Array.from({ length: 22 }, (_, i) => 2026 - i);

function StatusChip({ status }: { status: "draft" | "approved" | "rejected" }) {
  if (status === "approved") return <Chip tone="emerald">승인</Chip>;
  if (status === "rejected") return <Chip tone="coral">반려</Chip>;
  return <Chip tone="amber">검수 대기</Chip>;
}
