// feat-7-036 시드 import dry-run UI.
// CSV 일괄 정정 — dry-run preview → 사용자 승인 후 apply. Non-negotiable §8 화면화.

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  EyeIcon,
  SendIcon,
} from "lucide-react";
import { Form, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip } from "~/features/admin/components/admin-ui";
import {
  type SeedDiffResult,
  type SeedEntity,
  applyArticleImportance,
  applyCaseImportance,
  previewArticleImportance,
  previewCaseImportance,
} from "~/features/admin/queries/seed-preview.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-seeds-preview";

export const meta: Route.MetaFunction = () => [
  { title: "시드 import dry-run | Lidam" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return { role };
}

interface ActionResult {
  mode?: "preview" | "apply";
  entity?: SeedEntity;
  preview?: SeedDiffResult;
  apply?: { applied: number; skipped: number };
  error?: string;
}

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const entity = String(formData.get("entity") ?? "") as SeedEntity;
  const csv = String(formData.get("csv") ?? "");

  if (!csv.trim()) {
    return data({ error: "CSV 가 비어 있습니다." } satisfies ActionResult, {
      status: 400,
    });
  }
  if (entity !== "article_importance" && entity !== "case_importance") {
    return data({ error: "지원하지 않는 엔티티" } satisfies ActionResult, {
      status: 400,
    });
  }

  if (intent === "preview") {
    const preview =
      entity === "article_importance"
        ? await previewArticleImportance(client, csv)
        : await previewCaseImportance(client, csv);
    return data({ mode: "preview", entity, preview } satisfies ActionResult);
  }
  if (intent === "apply") {
    const apply =
      entity === "article_importance"
        ? await applyArticleImportance(csv, user.id)
        : await applyCaseImportance(csv, user.id);
    return data({ mode: "apply", entity, apply } satisfies ActionResult);
  }
  return data({ error: "Unknown intent" } satisfies ActionResult, {
    status: 400,
  });
}

const SAMPLE_ARTICLE = `# 헤더 한 줄(주석)이거나 첫 줄이 컬럼명이어도 자동 인식
law_code,article_number,importance
patent,29,3
patent,33,2
trademark,33,1`;

const SAMPLE_CASE = `case_number,importance
2020다123456,3
2019후1234,2`;

export default function AdminSeedsPreview({
  loaderData,
}: Route.ComponentProps) {
  const { role } = loaderData;
  const fetcher = useFetcher<ActionResult>();
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  const preview = result?.mode === "preview" ? result.preview : undefined;
  const applyResult = result?.mode === "apply" ? result.apply : undefined;

  return (
    <AdminShell
      cluster="laws"
      role={role}
      title="시드 import dry-run"
      desc="CSV 일괄 정정 — 미리보기로 diff 를 확인한 뒤 승인하면 적용. 한 번에 ~500행 권장."
      width={1280}
    >
      {/* Non-negotiable §8 안내 */}
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/40 p-3 dark:border-amber-700/40 dark:bg-amber-950/20">
        <AlertTriangleIcon
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="text-xs leading-relaxed">
          <p className="text-foreground font-semibold">
            다건 정정은 반드시 dry-run preview 로 검증 후 적용하세요.
          </p>
          <p className="text-muted-foreground mt-0.5">
            모든 apply 는 audit_logs 에 기록됩니다. 조문 본문(article_revisions)
            in-place 수정은 이 도구에서 차단 — 개정 흐름을 사용하세요.
          </p>
        </div>
      </div>

      <fetcher.Form method="post" className="space-y-3">
        <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
          <p className="text-foreground mb-2 text-sm font-bold">엔티티</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="entity"
                value="article_importance"
                defaultChecked
              />
              <span>
                articles.importance{" "}
                <span className="text-muted-foreground text-xs">
                  (law_code, article_number, importance 0–5)
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="entity" value="case_importance" />
              <span>
                cases.importance{" "}
                <span className="text-muted-foreground text-xs">
                  (case_number, importance 0–5)
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-foreground text-sm font-bold">CSV 입력</p>
            <span className="text-muted-foreground text-[11px]">
              헤더 줄·`#` 시작 주석은 무시.
            </span>
          </div>
          <Textarea
            name="csv"
            rows={10}
            placeholder={`articles 예시:\n${SAMPLE_ARTICLE}\n\ncases 예시:\n${SAMPLE_CASE}`}
            className="bg-background font-mono text-xs"
            required
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            name="intent"
            value="preview"
            variant="outline"
            disabled={busy}
          >
            <EyeIcon className="size-3.5" /> 미리보기 (dry-run)
          </Button>
          <Button
            type="submit"
            name="intent"
            value="apply"
            disabled={busy || !preview || preview.changedCount === 0}
          >
            <SendIcon className="size-3.5" />
            {preview ? `${preview.changedCount}건 적용` : "미리보기 후 적용"}
          </Button>
          {applyResult ? (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2Icon className="mr-1 inline size-3.5" />
              {applyResult.applied}건 적용 완료 (스킵 {applyResult.skipped})
            </span>
          ) : null}
          {result?.error ? (
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              ✗ {result.error}
            </span>
          ) : null}
        </div>
      </fetcher.Form>

      {preview ? <PreviewTable preview={preview} /> : null}
    </AdminShell>
  );
}

function statusTone(s: import("~/features/admin/queries/seed-preview.server").SeedDiffRow["status"]) {
  if (s === "changed")
    return { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-300", label: "변경" };
  if (s === "unchanged")
    return { bg: "bg-muted/40", text: "text-muted-foreground", label: "동일" };
  if (s === "not_found")
    return { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-700 dark:text-sky-300", label: "미발견" };
  return { bg: "bg-rose-50 dark:bg-rose-950/30", text: "text-rose-700 dark:text-rose-300", label: "오류" };
}

function PreviewTable({ preview }: { preview: SeedDiffResult }) {
  return (
    <section className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          미리보기 결과
        </p>
        <Chip tone="amber">변경 {preview.changedCount}</Chip>
        <Chip tone="neutral">동일 {preview.unchangedCount}</Chip>
        <Chip tone="blue">미발견 {preview.notFoundCount}</Chip>
        <Chip tone="coral">오류 {preview.invalidCount}</Chip>
      </div>
      <div className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60">
                <th className="text-muted-foreground px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                  대상
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                  현재
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                  →
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                  신규
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                  상태
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
                  비고
                </th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r, i) => {
                const tone = statusTone(r.status);
                return (
                  <tr
                    key={`${r.key}-${i}`}
                    className="border-border/60 border-t first:border-t-0"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{r.key}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {r.currentValue ?? "—"}
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-right text-xs">
                      →
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-mono text-xs font-bold tabular-nums",
                        r.status === "changed"
                          ? "text-amber-700 dark:text-amber-300"
                          : "",
                      )}
                    >
                      {r.status === "invalid" ? "—" : r.newValue}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold",
                          tone.bg,
                          tone.text,
                        )}
                      >
                        {tone.label}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-3 py-2 text-[11px]">
                      {r.note ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
