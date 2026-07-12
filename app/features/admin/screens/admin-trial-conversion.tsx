// 체험→유료 전환 추적 (P1). 진행 중 체험·만료 임박 워크리스트·전환율·팔로업.
// 접근: admin 항상 + '수강생 관리 접근' duty. 데이터는 파생 집계(별도 저장 없음).

import { DownloadIcon, TimerIcon } from "lucide-react";
import { Link, data, useSearchParams } from "react-router";

import { Button } from "~/core/components/ui/button";
import { csvResponse } from "~/core/lib/csv.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import {
  getTrialConversionOverview,
  type TrialWorklistRow,
} from "~/features/admin/queries/trial-conversion.server";
import { getStaffRole } from "~/features/laws/queries.server";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/admin-trial-conversion";

export const meta: Route.MetaFunction = () => [
  { title: "체험 전환 | 운영자" },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function fmtDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  const canAccess = await hasDutyAccess("student_admin_access", user.id, role);
  if (!canAccess) throw data("Forbidden", { status: 403 });

  const overview = await getTrialConversionOverview();

  // CSV 내보내기 — 만료 임박 연락 대상(대량 메시징·팔로업 핸드오프).
  const url = new URL(request.url);
  if (url.searchParams.get("export") === "csv") {
    const headers = ["회원번호", "이름", "연락처", "체험 종료일", "D-day"];
    const rows = overview.expiringSoon.map((r) => [
      r.memberNo ?? "",
      r.name ?? "",
      r.phone ?? "",
      fmtDay(r.trialEndsAt),
      r.dDays,
    ]);
    return csvResponse("체험만료임박.csv", headers, rows);
  }

  return { overview };
}

interface Kpi {
  label: string;
  value: string;
  sub: string;
  tone: "neutral" | "warn" | "good" | "bad";
}

export default function AdminTrialConversion({
  loaderData,
}: Route.ComponentProps) {
  const { overview } = loaderData;
  const { conversion } = overview;
  const [searchParams] = useSearchParams();
  const exportHref = (() => {
    const p = new URLSearchParams(searchParams);
    p.set("export", "csv");
    return `?${p.toString()}`;
  })();

  const kpis: Kpi[] = [
    {
      label: "진행 중 체험",
      value: overview.activeTrials.toLocaleString("ko-KR"),
      sub: "미전환 학생",
      tone: "neutral",
    },
    {
      label: `만료 임박 (${overview.expiringSoonDays}일)`,
      value: overview.expiringSoon.length.toLocaleString("ko-KR"),
      sub: "연락 권장 대상",
      tone: overview.expiringSoon.length > 0 ? "warn" : "neutral",
    },
    {
      label: `전환율 (${conversion.windowDays}일)`,
      value: conversion.ratePct == null ? "—" : `${conversion.ratePct}%`,
      sub: `전환 ${conversion.convertedCount} / 종료 ${conversion.endedCount}`,
      tone:
        conversion.ratePct == null
          ? "neutral"
          : conversion.ratePct >= 20
            ? "good"
            : "warn",
    },
    {
      label: `최근 만료 미전환 (${overview.followupDays}일)`,
      value: overview.followup.length.toLocaleString("ko-KR"),
      sub: "팔로업 대상",
      tone: overview.followup.length > 0 ? "bad" : "neutral",
    },
  ];

  return (
    <AdminShell
      cluster="students"
      title="체험 전환"
      desc="15일 무료 체험 회원의 진행·만료·유료 전환을 추적합니다. 전환 = 완료 결제 또는 활성 종합반 배정. 만료 임박 대상에게 미리 안내하면 전환율을 높일 수 있습니다."
      headerRight={
        overview.expiringSoon.length > 0 ? (
          <Button asChild size="sm" variant="outline">
            <a href={exportHref} download>
              <DownloadIcon className="size-3.5" /> 임박 대상 CSV
            </a>
          </Button>
        ) : undefined
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="border-border bg-card rounded-xl border p-3.5 shadow-sm"
          >
            <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              {k.label}
            </p>
            <p
              className={cn(
                "mt-1.5 text-[22px] leading-none font-extrabold tracking-tight tabular-nums",
                k.tone === "warn"
                  ? "text-amber-700 dark:text-amber-300"
                  : k.tone === "bad"
                    ? "text-rose-700 dark:text-rose-300"
                    : k.tone === "good"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-foreground",
              )}
            >
              {k.value}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">{k.sub}</p>
          </div>
        ))}
      </div>

      <section className="mb-8">
        <div className="mb-2 flex items-center gap-1.5">
          <TimerIcon className="text-amber-600 size-3.5 dark:text-amber-400" />
          <h2 className="text-sm font-bold tracking-tight">
            만료 임박 ({overview.expiringSoon.length})
          </h2>
        </div>
        <WorklistTable rows={overview.expiringSoon} emptyLabel="임박한 체험 없음" />
      </section>

      <section>
        <div className="mb-2 flex items-center gap-1.5">
          <h2 className="text-sm font-bold tracking-tight">
            최근 만료 미전환 ({overview.followup.length})
          </h2>
        </div>
        <WorklistTable
          rows={overview.followup}
          emptyLabel="최근 만료 미전환 없음"
        />
      </section>
    </AdminShell>
  );
}

function WorklistTable({
  rows,
  emptyLabel,
}: {
  rows: TrialWorklistRow[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-border bg-card text-muted-foreground rounded-xl border px-4 py-6 text-center text-sm shadow-sm">
        {emptyLabel}
      </div>
    );
  }
  return (
    <IndexTable
      headers={[
        { label: "회원" },
        { label: "연락처" },
        { label: "체험 종료일" },
        { label: "D-day", align: "right" },
      ]}
    >
      {rows.map((r) => (
        <TR key={r.profileId}>
          <TD>
            <Link
              to={`/admin/students/${r.profileId}`}
              className="text-link font-medium hover:underline"
              viewTransition
            >
              {r.name ?? "(이름 없음)"}
            </Link>
            {r.memberNo != null ? (
              <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                #{r.memberNo}
              </span>
            ) : null}
          </TD>
          <TD mono soft>
            {r.phone ?? "—"}
          </TD>
          <TD mono soft>
            {fmtDay(r.trialEndsAt)}
          </TD>
          <TD align="right" mono>
            <span
              className={cn(
                "font-bold tabular-nums",
                r.dDays <= 0
                  ? "text-rose-600 dark:text-rose-400"
                  : r.dDays <= 3
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-foreground",
              )}
            >
              {r.dDays > 0 ? `D-${r.dDays}` : r.dDays === 0 ? "D-day" : `D+${-r.dDays}`}
            </span>
          </TD>
        </TR>
      ))}
    </IndexTable>
  );
}
