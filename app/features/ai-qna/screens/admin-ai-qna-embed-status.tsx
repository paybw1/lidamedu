// feat-9 운영 모니터링 — 임베딩 진행 상태 + 수동 cron 트리거.
// staff 전용. ai_embedding_status RPC + ai_embedding_dirty_sample RPC.

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  CpuIcon,
  Loader2Icon,
  PlayIcon,
} from "lucide-react";
import { Form, data, redirect, useNavigation } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-ai-qna-embed-status";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A 임베딩 상태 | 운영자" },
];

interface StatusRow {
  total_chunks: number;
  embedded_chunks: number;
  dirty_chunks: number;
  embedded_last_24h: number;
  total_articles: number;
  total_cases: number;
  total_problems: number;
  dirty_articles: number;
  dirty_cases: number;
  dirty_problems: number;
  oldest_dirty_at: string | null;
  latest_embedded_at: string | null;
}

interface DirtySample {
  chunk_id: string;
  source_type: "article" | "case" | "problem";
  source_id: string;
  heading_path: string | null;
  law_code: string | null;
  token_count: number;
  created_at: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");

  const [{ data: statusData }, { data: sampleData }] = await Promise.all([
    client.rpc("ai_embedding_status"),
    client.rpc("ai_embedding_dirty_sample", { p_limit: 10 }),
  ]);
  const status: StatusRow = (statusData?.[0] as unknown as StatusRow | undefined) ?? {
    total_chunks: 0,
    embedded_chunks: 0,
    dirty_chunks: 0,
    embedded_last_24h: 0,
    total_articles: 0,
    total_cases: 0,
    total_problems: 0,
    dirty_articles: 0,
    dirty_cases: 0,
    dirty_problems: 0,
    oldest_dirty_at: null,
    latest_embedded_at: null,
  };
  const sample = (sampleData ?? []) as unknown as DirtySample[];
  return {
    status,
    sample,
    voyageConfigured: Boolean(process.env.VOYAGE_API_KEY),
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  if (String(fd.get("intent")) !== "run_embed") {
    return data({ error: "Unknown intent" }, { status: 400 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return data({ error: "CRON_SECRET 미설정" }, { status: 503 });
  if (!process.env.VOYAGE_API_KEY)
    return data({ error: "VOYAGE_API_KEY 미설정 (dry-run 상태)" }, { status: 503 });

  // 같은 서버에서 내부 fetch — `request.url` 의 origin 사용.
  const origin = new URL(request.url).origin;
  const resp = await fetch(`${origin}/api/cron/embed-chunks?limit=50`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok)
    return data(
      { error: `cron 호출 실패 ${resp.status}: ${JSON.stringify(body).slice(0, 200)}` },
      { status: 502 },
    );
  return data({ ok: true, cron: body });
}

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function fmtTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function AdminAiQnaEmbedStatus({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { status, sample, voyageConfigured, cronSecretConfigured } = loaderData;
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  const progressPct =
    status.total_chunks > 0
      ? Math.round((status.embedded_chunks / status.total_chunks) * 100)
      : 0;

  const result = actionData;
  const cronOk = result && "ok" in result && result.ok;
  const cronErr = result && "error" in result ? (result as { error: string }).error : null;

  return (
    <AdminShell title="AI Q&A 임베딩 상태" cluster="ai-qna">
      <div className="mx-auto max-w-5xl space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="inline-flex items-center gap-2 text-xl font-bold tracking-tight">
              <CpuIcon className="text-link size-5" /> 임베딩 상태
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              <code className="text-foreground">content_chunks</code> 의 임베딩
              진행도입니다. 스케줄러가 매 15분 자동 실행합니다(`/api/cron/embed-chunks`). 환경변수
              미설정 시 빈 실행(dry-run) 상태입니다.
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="run_embed" />
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !voyageConfigured || !cronSecretConfigured}
              className="rounded-full"
              title={
                !voyageConfigured
                  ? "VOYAGE_API_KEY 미설정"
                  : !cronSecretConfigured
                    ? "CRON_SECRET 미설정"
                    : "지금 임베딩 실행 (50건 배치)"
              }
            >
              {submitting ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <PlayIcon className="size-3.5" />
              )}
              지금 임베딩 실행
            </Button>
          </Form>
        </header>

        {/* 환경 변수 안내 */}
        <section className="grid gap-2 sm:grid-cols-2">
          <ConfigPill ok={voyageConfigured} label="VOYAGE_API_KEY" />
          <ConfigPill ok={cronSecretConfigured} label="CRON_SECRET" />
        </section>

        {cronOk ? (
          <pre className="border-emerald-500/30 bg-emerald-500/[0.04] overflow-x-auto rounded-2xl border p-3 text-[11px] text-emerald-700 dark:text-emerald-300">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
        {cronErr ? (
          <p className="border-rose-500/30 bg-rose-500/[0.04] rounded-2xl border p-3 text-xs text-rose-600 dark:text-rose-300">
            {cronErr}
          </p>
        ) : null}

        {/* 핵심 카드 */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="전체 청크" value={fmtNum(status.total_chunks)} icon={CircleDotIcon} />
          <Stat
            label="임베딩 완료"
            value={`${fmtNum(status.embedded_chunks)} (${progressPct}%)`}
            accent={progressPct === 100 ? "emerald" : "blue"}
            icon={CheckCircle2Icon}
          />
          <Stat
            label="대기(dirty)"
            value={fmtNum(status.dirty_chunks)}
            accent={status.dirty_chunks > 0 ? "amber" : "emerald"}
            icon={AlertTriangleIcon}
          />
          <Stat
            label="최근 24시간 처리"
            value={fmtNum(status.embedded_last_24h)}
          />
        </section>

        {/* source_type 별 */}
        <section className="border-border bg-card rounded-2xl border p-4 shadow-sm">
          <p className="text-foreground mb-3 text-sm font-bold tracking-tight">
            source_type 별
          </p>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">소스</th>
                <th className="px-3 py-2 text-right font-semibold">전체</th>
                <th className="px-3 py-2 text-right font-semibold">대기</th>
                <th className="px-3 py-2 text-right font-semibold">완료</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              <SourceRow
                label="조문 (article)"
                total={status.total_articles}
                dirty={status.dirty_articles}
              />
              <SourceRow
                label="판례 (case)"
                total={status.total_cases}
                dirty={status.dirty_cases}
              />
              <SourceRow
                label="문제 (problem)"
                total={status.total_problems}
                dirty={status.dirty_problems}
              />
            </tbody>
          </table>
        </section>

        {/* 시각 정보 */}
        <section className="border-border bg-card grid gap-2 rounded-2xl border p-4 text-xs shadow-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">최근 임베딩 시각: </span>
            <span className="text-foreground tabular-nums">
              {fmtTime(status.latest_embedded_at)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">최오래 대기 시각: </span>
            <span className="text-foreground tabular-nums">
              {fmtTime(status.oldest_dirty_at)}
            </span>
          </div>
        </section>

        {/* dirty 샘플 */}
        {sample.length > 0 ? (
          <section className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
            <div className="border-border border-b px-4 py-3">
              <p className="text-sm font-bold tracking-tight">
                대기 청크 샘플 (오래된 순 {sample.length}건)
              </p>
            </div>
            <ul className="divide-border divide-y">
              {sample.map((s) => (
                <li
                  key={s.chunk_id}
                  className="px-4 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {s.source_type}
                    </Badge>
                    {s.law_code ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {s.law_code}
                      </Badge>
                    ) : null}
                    <span className="text-muted-foreground tabular-nums">
                      {fmtTime(s.created_at)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {s.token_count} 토큰
                    </span>
                  </div>
                  <p className="text-foreground mt-1 line-clamp-1 text-[12px]">
                    {s.heading_path ?? `(${s.source_id.slice(0, 8)})`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed py-12 text-center">
            <CheckCircle2Icon
              className="mx-auto size-10 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <p className="text-muted-foreground mt-3 text-sm">
              대기 중인 청크가 없습니다. 모두 임베딩 완료.
            </p>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent?: "blue" | "amber" | "emerald" | "rose";
  icon?: typeof CircleDotIcon;
}) {
  const cls =
    accent === "amber"
      ? "text-amber-700 dark:text-amber-300"
      : accent === "rose"
        ? "text-rose-700 dark:text-rose-300"
        : accent === "emerald"
          ? "text-emerald-700 dark:text-emerald-300"
          : accent === "blue"
            ? "text-link"
            : "text-foreground";
  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}

function SourceRow({
  label,
  total,
  dirty,
}: {
  label: string;
  total: number;
  dirty: number;
}) {
  const embedded = total - dirty;
  const pct = total > 0 ? Math.round((embedded / total) * 100) : 0;
  return (
    <tr>
      <td className="px-3 py-2">{label}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmtNum(total)}</td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          dirty > 0
            ? "text-amber-700 dark:text-amber-300"
            : "text-muted-foreground",
        )}
      >
        {fmtNum(dirty)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {fmtNum(embedded)} <span className="text-muted-foreground">({pct}%)</span>
      </td>
    </tr>
  );
}

function ConfigPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={cn(
        "border-border bg-card flex items-center justify-between rounded-xl border p-3 text-xs",
        ok
          ? "border-emerald-500/30 bg-emerald-500/[0.04]"
          : "border-amber-500/40 bg-amber-500/[0.04]",
      )}
    >
      <span className="text-foreground font-semibold">{label}</span>
      <Badge
        variant="outline"
        className={
          ok
            ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
            : "border-amber-500/40 text-amber-700 dark:text-amber-300"
        }
      >
        {ok ? "OK" : "미설정"}
      </Badge>
    </div>
  );
}
