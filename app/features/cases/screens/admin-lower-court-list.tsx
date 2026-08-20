// feat-2-035 — 하급심 판결문 적재 현황(staff). 무엇이 적재됐고, 무엇을 수기로 구해와야 하는지.
//
// 도식의 사실관계 근거가 하급심이라, 미확보 목록이 곧 다음 작업 지시서다.
// ★두 종류의 작업이 섞여 있어 상태를 구분해 보여준다 —
//   판결문만 구하면 되는 건(원심 사건번호 확정)과, 원심이 무엇인지부터 찾아야 하는 건.

import { CheckCircle2Icon, FileTextIcon, SearchIcon } from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  LOWER_STATUS_LABEL,
  type LowerCourtStatus,
} from "~/features/cases/lib/lower-court";
import { listLowerCourtTargets } from "~/features/cases/queries-lower-court.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-lower-court-list";

export const meta: Route.MetaFunction = () => [
  { title: "하급심 판결문 적재 | 리담변리사학원" },
];

const STATUS_VALUES = [
  "loaded",
  "not_in_api",
  "summary_only",
  "no_ref",
] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/auth/login?next=/admin/cases/lower-court");
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("status");
  const status =
    raw === "manual" || (STATUS_VALUES as readonly string[]).includes(raw ?? "")
      ? (raw as LowerCourtStatus | "manual")
      : "manual"; // 기본 = 수기 대상(이 화면의 목적)
  const q = (url.searchParams.get("q") ?? "").trim();

  const { rows, counts } = await listLowerCourtTargets(client, { status, q });
  return { rows, counts, status, q, role };
}

export default function AdminLowerCourtList({
  loaderData,
}: Route.ComponentProps) {
  const { rows, counts, status, q, role } = loaderData;
  const manualTotal =
    counts.not_in_api + counts.summary_only + counts.no_ref;

  return (
    <AdminShell
      cluster="cases"
      role={role}
      title="하급심 판결문 적재"
      desc="판례 도식의 사실관계는 하급심 판결문에서 정리합니다. 자동 수집분은 적재돼 있고, 나머지는 판결문을 구해 폴더에 넣어야 합니다."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">특허법 2005년 이후</span>
        {(
          [
            ["manual", "수기 대상", manualTotal],
            ["loaded", "적재됨", counts.loaded],
            ["not_in_api", "미수록", counts.not_in_api],
            ["summary_only", "요지만", counts.summary_only],
            ["no_ref", "원심 미상", counts.no_ref],
          ] as [string, string, number][]
        ).map(([val, label, n]) => {
          const sp = new URLSearchParams();
          sp.set("status", val);
          if (q) sp.set("q", q);
          const active = status === val;
          return (
            <Link
              key={val}
              to={`/admin/cases/lower-court?${sp}`}
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
        <span className="text-muted-foreground ml-1">/ 전체 {counts.total}</span>
      </div>

      {/* 수기 투입 안내 — 목록만 보여 주고 방법을 안 적으면 다시 물어보게 된다. */}
      <div className="border-border bg-muted/30 text-muted-foreground mb-4 rounded-xl border px-4 py-3 text-xs leading-relaxed">
        판결문을 구하면{" "}
        <code className="bg-background rounded px-1 py-0.5">
          source/하급심 판결문/특허/
        </code>{" "}
        에{" "}
        <code className="bg-background rounded px-1 py-0.5">
          &lt;대법원 사건번호&gt; &lt;법원&gt; &lt;하급심 사건번호&gt;.pdf
        </code>{" "}
        형식으로 넣고 수집기를 다시 돌리면 적재됩니다. 파일명 첫 토큰(대법원
        사건번호)이 매칭 키입니다.
        <br />
        <strong>미수록·요지만</strong> = 원심 사건번호가 확정돼 있어 판결문만
        구하면 됩니다. <strong>원심 미상</strong> = 우리 DB의 대법원 원문이
        요약본이라 원심이 무엇인지부터 찾아야 합니다.
      </div>

      <Form method="get" className="mb-3 flex flex-wrap items-center gap-2">
        <input type="hidden" name="status" value={status} />
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="사건번호·사건명·원심번호"
            className="h-8 w-60 rounded-lg pl-8 text-xs"
          />
        </div>
        <button
          type="submit"
          className="border-border hover:bg-muted h-8 rounded-lg border px-3 text-xs font-semibold"
        >
          검색
        </button>
      </Form>

      {rows.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-2xl border p-8 text-center text-sm">
          {status === "manual"
            ? "수기로 구해야 할 판결문이 없습니다."
            : "조건에 맞는 판례가 없습니다."}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.caseId}
              className="border-border bg-card rounded-xl border p-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusChip status={r.status} />
                <Chip tone="outline">{r.caseNumber}</Chip>
                <Chip tone="outline">{r.decidedAt}</Chip>
                {r.lowerCaseNumber ? (
                  <Chip tone="blue">
                    <FileTextIcon className="size-3" /> 원심 {r.lowerCourt}{" "}
                    {r.lowerCaseNumber}
                  </Chip>
                ) : null}
                {r.status === "loaded" ? (
                  <Chip tone="outline">
                    {r.charCount.toLocaleString("ko-KR")}자
                  </Chip>
                ) : null}
                <Link
                  to={`/subjects/patent/cases/${r.caseId}`}
                  className="text-link ml-auto text-xs hover:underline"
                >
                  판례 보기
                </Link>
              </div>
              <p className="text-foreground mt-1.5 line-clamp-2 text-sm">
                {r.caseTitle}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function StatusChip({ status }: { status: LowerCourtStatus }) {
  if (status === "loaded") {
    return (
      <Chip tone="emerald">
        <CheckCircle2Icon className="size-3" /> 적재됨
      </Chip>
    );
  }
  if (status === "no_ref") return <Chip tone="coral">원심 미상</Chip>;
  return <Chip tone="amber">{LOWER_STATUS_LABEL[status]}</Chip>;
}
