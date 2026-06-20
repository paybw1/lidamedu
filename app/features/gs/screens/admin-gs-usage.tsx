// 운영자 — GS AI/OCR 사용량 모니터링. cap 잔여 + 7일 추이 + 회차 top.
// 환경변수 cap 값은 SSR 시점에 process.env 로 읽고 client 에 전달.

import { CoinsIcon, GaugeIcon, InboxIcon, ScanLineIcon } from "lucide-react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  type DailyUsageRow,
  type RoundUsageRow,
  getRecentUsage,
  getTopRoundsByUsage,
} from "~/features/gs/queries-usage.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-gs-usage";

export const meta: Route.MetaFunction = () => [
  { title: "GS AI·OCR 사용량 | Lidam Patent Attorney Academy" },
];

interface CapConfig {
  aiCostCap: number;
  ocrCostCap: number;
  ocrCallCap: number;
  ocrPageCostUsd: number;
}

function readEnvCap(name: string): number {
  const raw = process.env[name];
  if (!raw) return 0;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? "7");
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 30) : 7;

  const [recent, topRounds] = await Promise.all([
    getRecentUsage(client, days),
    getTopRoundsByUsage(client, days, 10),
  ]);
  const caps: CapConfig = {
    aiCostCap: readEnvCap("GS_AI_DAILY_COST_USD_CAP"),
    ocrCostCap: readEnvCap("GS_OCR_DAILY_COST_USD_CAP"),
    ocrCallCap: readEnvCap("GS_OCR_DAILY_CALL_CAP"),
    ocrPageCostUsd: Number(process.env.GS_OCR_PAGE_USD ?? 0.0015),
  };

  return { role, recent, topRounds, caps, days };
}

function fmt(usd: number): string {
  return `$${usd.toFixed(usd >= 1 ? 2 : 4)}`;
}

function pct(current: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, Math.round((current / cap) * 100));
}

export default function AdminGsUsage({ loaderData }: Route.ComponentProps) {
  const { role, recent, topRounds, caps, days } = loaderData;
  const today = recent[0] ?? null;
  const aiCostToday = today?.aiCostUsd ?? 0;
  const ocrCostToday = today?.ocrCostUsd ?? 0;
  const ocrCallsToday = today?.ocrCalls ?? 0;

  return (
    <AdminShell
      cluster="gs"
      role={role}
      title="GS AI·OCR 사용량"
      desc="오늘 비용·cap 잔여, 최근 추이, 회차별 비용 상위. cap 도달 시 운영자 알림 1회 발송됩니다."
    >
      {/* 오늘 cap 잔여 — 3 카드 */}
      <section className="mb-6 grid gap-2.5 sm:grid-cols-3">
        <CapCard
          label="AI 비용 (오늘)"
          icon={GaugeIcon}
          current={aiCostToday}
          cap={caps.aiCostCap}
          renderCurrent={fmt}
          renderCap={fmt}
          hint={
            caps.aiCostCap > 0
              ? "GS_AI_DAILY_COST_USD_CAP 도달 시 AI 채점 초안 차단 (강사 직접 채점 정상)"
              : "GS_AI_DAILY_COST_USD_CAP 미설정 — cap 비활성"
          }
        />
        <CapCard
          label="OCR 비용 (오늘)"
          icon={ScanLineIcon}
          current={ocrCostToday}
          cap={caps.ocrCostCap}
          renderCurrent={fmt}
          renderCap={fmt}
          hint={
            caps.ocrCostCap > 0
              ? "도달 시 OCR 만 보류 (페이지 업로드·제출 정상)"
              : "GS_OCR_DAILY_COST_USD_CAP 미설정 — cap 비활성"
          }
        />
        <CapCard
          label="OCR 호출수 (오늘)"
          icon={InboxIcon}
          current={ocrCallsToday}
          cap={caps.ocrCallCap}
          renderCurrent={(v) => v.toLocaleString("ko-KR")}
          renderCap={(v) => v.toLocaleString("ko-KR")}
          hint={
            caps.ocrCallCap > 0
              ? "Vision 무료 한도(1000/월) 대응. 도달 시 OCR 만 보류"
              : "GS_OCR_DAILY_CALL_CAP 미설정 — cap 비활성"
          }
        />
      </section>

      {/* 7일 추이 표 */}
      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-mono text-[11px] font-bold tracking-[0.1em] uppercase text-muted-foreground">
            최근 {days}일 추이
          </p>
          <div className="flex gap-1 text-xs">
            {[3, 7, 14, 30].map((d) => (
              <Link
                key={d}
                to={`?days=${d}`}
                className={cn(
                  "rounded-full px-2 py-0.5",
                  d === days
                    ? "bg-primary/10 text-link font-bold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {d}d
              </Link>
            ))}
          </div>
        </div>
        <RecentTable rows={recent} ocrPageCostUsd={caps.ocrPageCostUsd} />
      </section>

      {/* 비용 상위 회차 */}
      <section>
        <p className="mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase text-muted-foreground">
          비용 상위 회차 (최근 {days}일)
        </p>
        <TopRoundsTable rows={topRounds} />
      </section>
    </AdminShell>
  );
}

function CapCard({
  label,
  icon: Icon,
  current,
  cap,
  renderCurrent,
  renderCap,
  hint,
}: {
  label: string;
  icon: typeof CoinsIcon;
  current: number;
  cap: number;
  renderCurrent: (v: number) => string;
  renderCap: (v: number) => string;
  hint: string;
}) {
  const ratio = pct(current, cap);
  const tone =
    cap === 0
      ? "muted"
      : ratio >= 100
        ? "rose"
        : ratio >= 75
          ? "amber"
          : "emerald";
  const barColor =
    tone === "rose"
      ? "bg-rose-500"
      : tone === "amber"
        ? "bg-amber-500"
        : tone === "emerald"
          ? "bg-emerald-500"
          : "bg-muted-foreground/30";
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        <Icon className="size-3" /> {label}
      </p>
      <p className="text-foreground mt-1 text-[22px] font-extrabold tracking-tight tabular-nums">
        {renderCurrent(current)}
        {cap > 0 ? (
          <span className="text-muted-foreground ml-1 text-xs font-medium">
            / {renderCap(cap)}
          </span>
        ) : null}
      </p>
      {cap > 0 ? (
        <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className={cn("h-full rounded-full", barColor)}
            style={{ width: `${ratio}%` }}
          />
        </div>
      ) : null}
      <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
        {hint}
      </p>
    </div>
  );
}

function RecentTable({
  rows,
  ocrPageCostUsd,
}: {
  rows: DailyUsageRow[];
  ocrPageCostUsd: number;
}) {
  if (rows.length === 0) {
    return (
      <div className="border-border bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
        해당 기간에 호출 기록이 없습니다.
      </div>
    );
  }
  return (
    <IndexTable
      headers={[
        { label: "날짜" },
        { label: "AI 호출", align: "right", width: "6rem" },
        { label: "AI 비용", align: "right", width: "6rem" },
        { label: "OCR 호출", align: "right", width: "6rem" },
        { label: "OCR 페이지", align: "right", width: "6rem" },
        { label: "OCR 비용", align: "right", width: "6rem" },
        { label: "skip(cap)", align: "right", width: "5rem" },
      ]}
    >
      {rows.map((r) => {
        const skip = r.aiSkippedCap + r.ocrSkippedCap;
        return (
          <TR key={r.date}>
            <TD>{r.date}</TD>
            <TD align="right">{r.aiCalls.toLocaleString("ko-KR")}</TD>
            <TD align="right">{fmt(r.aiCostUsd)}</TD>
            <TD align="right">{r.ocrCalls.toLocaleString("ko-KR")}</TD>
            <TD align="right">{r.ocrPages.toLocaleString("ko-KR")}</TD>
            <TD align="right">{fmt(r.ocrCostUsd)}</TD>
            <TD align="right">
              {skip > 0 ? (
                <Chip tone="coral">{skip.toLocaleString("ko-KR")}</Chip>
              ) : (
                <span className="text-muted-foreground">0</span>
              )}
            </TD>
          </TR>
        );
      })}
    </IndexTable>
  );
}

function TopRoundsTable({ rows }: { rows: RoundUsageRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border-border bg-card text-muted-foreground rounded-xl border p-8 text-center text-sm">
        해당 기간에 회차별 사용량이 없습니다.
      </div>
    );
  }
  return (
    <IndexTable
      headers={[
        { label: "회차" },
        { label: "AI 비용", align: "right", width: "6rem" },
        { label: "OCR 비용", align: "right", width: "6rem" },
        { label: "총 비용", align: "right", width: "6rem" },
        { label: "AI/OCR 호출", align: "right", width: "7rem" },
        { label: "" , width: "6rem" },
      ]}
    >
      {rows.map((r) => (
        <TR key={r.roundId}>
          <TD>
            <Link
              to={`/admin/gs/${r.roundId}/stats`}
              className="text-foreground hover:underline"
            >
              {r.roundTitle ?? "(제목 없음)"}
            </Link>
          </TD>
          <TD align="right">{fmt(r.aiCostUsd)}</TD>
          <TD align="right">{fmt(r.ocrCostUsd)}</TD>
          <TD align="right">
            <strong>{fmt(r.totalCostUsd)}</strong>
          </TD>
          <TD align="right" className="text-muted-foreground">
            {r.aiCalls.toLocaleString("ko-KR")} / {r.ocrCalls.toLocaleString("ko-KR")}
          </TD>
          <TD>
            <Link
              to={`/admin/gs/${r.roundId}/stats`}
              className="text-link text-xs hover:underline"
            >
              회차 통계 →
            </Link>
          </TD>
        </TR>
      ))}
    </IndexTable>
  );
}
