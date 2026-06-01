// feat §3 — AI 초안 일괄 생성 화면. /admin/problems/ai-gen.
// 강사 입력: lawCode + (선택) primaryArticleIds 콤마 입력 + mc_short/mc_box 수 + model.
// POST → API → GenerateReport 표시. 생성된 problemId 들은 검토 큐 link.

import { CpuIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Field } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-ai-problem-gen";

export const meta: Route.MetaFunction = () => [
  { title: "AI 문제 초안 생성 | Lidam Patent Attorney Academy" },
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

interface GenReport {
  totalRequested: number;
  totalGenerated: number;
  totalSkippedNoEvidence: number;
  totalStructureWarnings: number;
  totalDuplicateSuspected: number;
  generatedProblemIds: string[];
  perArticleErrors: Array<{ articleId: string; reason: string }>;
  tokenUsage: { input: number; output: number };
  costUsd: number;
}

export default function AdminAiProblemGen({
  loaderData,
}: Route.ComponentProps) {
  const { role } = loaderData;
  const fetcher = useFetcher<{ ok?: boolean; report?: GenReport; error?: string }>();
  const busy = fetcher.state !== "idle";
  const [lawCode, setLawCode] = useState<string>("patent");
  const [articleIds, setArticleIds] = useState<string>("");
  const [mcShort, setMcShort] = useState<number>(3);
  const [mcBox, setMcBox] = useState<number>(2);
  const [model, setModel] = useState<string>("claude-sonnet-4-6");
  const total = mcShort + mcBox;

  const submit = () => {
    const fd = new FormData();
    fd.set("lawCode", lawCode);
    if (articleIds.trim().length > 0) fd.set("primaryArticleIds", articleIds.trim());
    fd.set("mcShortCount", String(mcShort));
    fd.set("mcBoxCount", String(mcBox));
    fd.set("model", model);
    fetcher.submit(fd, { method: "post", action: "/api/admin/ai-problem-gen" });
  };

  return (
    <AdminShell
      cluster="problems"
      title="AI 문제 초안 생성"
      desc={
        <span>
          범위·문항 수 지정 → AI 초안 일괄 생성. 생성된 문제는{" "}
          <Link to="/admin/problems/review" className="text-primary hover:underline">
            검증 큐
          </Link>
          에서 강사 승인 후 모의고사 picker·학습과목에 노출됩니다.
        </span>
      }
      role={role}
      width={1100}
    >
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="과목">
              <AdminSelect
                value={lawCode}
                onChange={(e) => setLawCode(e.target.value)}
              >
                {LAW_SUBJECT_SLUGS.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s].name}
                  </option>
                ))}
              </AdminSelect>
            </Field>
            <Field label="생성 모델">
              <AdminSelect
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (권장)</option>
                <option value="claude-opus-4-7">Claude Opus 4.7 (가장 정확, 비쌈)</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (저가, 정확도 ↓)</option>
              </AdminSelect>
            </Field>
          </div>

          <Field
            label="주요 조문 ID (선택, 콤마)"
            hint="비우면 과목 전체 조문에서 무작위 균등 분배. 채우면 그 조문들에만 분배."
          >
            <Textarea
              value={articleIds}
              onChange={(e) => setArticleIds(e.target.value)}
              rows={3}
              placeholder="uuid1, uuid2, ..."
              className="font-mono text-xs"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="단답형(mc_short) 수">
              <Input
                type="number"
                min={0}
                max={30}
                value={mcShort}
                onChange={(e) => setMcShort(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
            <Field label="박스형(mc_box) 수">
              <Input
                type="number"
                min={0}
                max={30}
                value={mcBox}
                onChange={(e) => setMcBox(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>
          </div>

          <div className="text-muted-foreground text-xs">
            합계 {total}문항 (최대 30). 한 article 당 1문항. 근거 부족 article 은 자동 skip.
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={submit}
              disabled={busy || total === 0 || total > 30}
              className="gap-2"
            >
              <SparklesIcon className="size-4" />
              {busy ? "생성 중…" : "생성 시작"}
            </Button>
            {busy ? (
              <span className="text-muted-foreground text-xs">
                AI 생성은 1-5분 걸릴 수 있습니다. 페이지 닫지 마세요.
              </span>
            ) : null}
          </div>

          {fetcher.data?.error ? (
            <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-700/60 dark:bg-rose-950/30">
              {fetcher.data.error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* 결과 리포트 */}
      {fetcher.data?.report ? <ReportPanel report={fetcher.data.report} /> : null}
    </AdminShell>
  );
}

function ReportPanel({ report }: { report: GenReport }) {
  return (
    <Card className="mt-4">
      <CardContent className="space-y-3 p-5">
        <div className="text-muted-foreground flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase">
          <CpuIcon className="size-3" /> 생성 결과
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="요청" value={report.totalRequested} />
          <Stat label="성공 생성" value={report.totalGenerated} emerald />
          <Stat
            label="근거 부족 skip"
            value={report.totalSkippedNoEvidence}
            amber
          />
          <Stat
            label="구조 경고"
            value={report.totalStructureWarnings}
            amber
          />
          <Stat
            label="중복 의심"
            value={report.totalDuplicateSuspected}
            amber
          />
          <Stat
            label="비용 (USD)"
            value={`$${report.costUsd.toFixed(4)}`}
          />
          <Stat
            label="입력 토큰"
            value={report.tokenUsage.input.toLocaleString()}
          />
          <Stat
            label="출력 토큰"
            value={report.tokenUsage.output.toLocaleString()}
          />
        </div>

        {report.generatedProblemIds.length > 0 ? (
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-bold tracking-wide uppercase">
              생성된 문제 ({report.generatedProblemIds.length})
            </p>
            <p className="text-xs">
              <Link
                to="/admin/problems/review"
                className="text-primary hover:underline"
              >
                검증 큐에서 검토 →
              </Link>
            </p>
            <ul className="mt-2 max-h-40 overflow-auto rounded border border-border bg-muted/30 p-2 text-[11px] font-mono">
              {report.generatedProblemIds.map((id) => (
                <li key={id}>
                  <Link
                    to={`/admin/problems/review?focus=${id}`}
                    className="hover:underline"
                  >
                    {id}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {report.perArticleErrors.length > 0 ? (
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-bold tracking-wide uppercase">
              오류·skip ({report.perArticleErrors.length})
            </p>
            <ul className="max-h-40 overflow-auto rounded border border-border bg-muted/30 p-2 text-[11px] font-mono">
              {report.perArticleErrors.map((e, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">
                    {e.articleId.slice(0, 8)}
                  </span>{" "}
                  — {e.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  emerald,
  amber,
}: {
  label: string;
  value: number | string;
  emerald?: boolean;
  amber?: boolean;
}) {
  return (
    <div
      className={
        "rounded border border-border p-2.5 " +
        (emerald
          ? "bg-emerald-50 dark:bg-emerald-950/20"
          : amber
            ? "bg-amber-50 dark:bg-amber-950/20"
            : "bg-muted/30")
      }
    >
      <p className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}
