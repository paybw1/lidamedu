// feat-9-006 — 운영자용 AI Q&A 한도 + 토큰 캡 편집 화면.
// app_settings.ai_qna_quotas jsonb 1개 키. 저장 즉시 다음 ask 부터 반영.

import { Loader2Icon, SaveIcon } from "lucide-react";
import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getAiQuotas,
  setAiQuotas,
  type AiQuotas,
} from "~/features/ai-qna/settings.server";

import type { Route } from "./+types/admin-ai-qna-settings";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A 한도 설정 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");
  const quotas = await getAiQuotas(client);
  return { quotas };
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
  const next: AiQuotas = {
    freeDailyLimit: pickPositiveInt(fd.get("freeDailyLimit"), 5),
    tier1DailyLimit: pickPositiveInt(fd.get("tier1DailyLimit"), 20),
    maxOutputTokens: pickPositiveInt(fd.get("maxOutputTokens"), 800),
    maxContextChunks: pickPositiveInt(fd.get("maxContextChunks"), 8),
  };
  // 비현실적인 값 차단 — 비용 폭주 가드.
  if (next.maxOutputTokens > 4096) {
    return data(
      { error: "maxOutputTokens 는 4096 이하" },
      { status: 400 },
    );
  }
  if (next.maxContextChunks > 30) {
    return data({ error: "maxContextChunks 는 30 이하" }, { status: 400 });
  }
  if (next.freeDailyLimit > 100 || next.tier1DailyLimit > 500) {
    return data({ error: "일일 한도가 너무 큽니다" }, { status: 400 });
  }
  const res = await setAiQuotas(client, next, user.id);
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return data({ ok: true, saved: next });
}

function pickPositiveInt(raw: FormDataEntryValue | null, fallback: number): number {
  if (raw === null) return fallback;
  const n = Number(String(raw));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export default function AdminAiQnaSettings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { quotas } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";
  const [draft, setDraft] = useState<AiQuotas>(quotas);
  const saved = actionData && "ok" in actionData && actionData.ok;
  const error =
    actionData && "error" in actionData ? actionData.error : null;

  return (
    <AdminShell title="AI Q&A 한도 설정" cluster="comms">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-xl font-bold tracking-tight">
            AI Q&A 한도 · 토큰 캡
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            저장 즉시 다음 요청부터 반영됩니다. 사용량 측정은{" "}
            <code className="text-foreground">ai_messages.token_usage</code>{" "}
            컬럼에서 향후 사용량 기반 청구로 활용 가능합니다.
          </p>
        </header>

        <Form method="post" className="space-y-5">
          <FieldRow
            label="무료 사용자 일 한도 (회/일)"
            help="비구독 학생의 하루 질문 횟수. 작은 값이 안전 — 기본 5."
            name="freeDailyLimit"
            value={draft.freeDailyLimit}
            onChange={(v) => setDraft({ ...draft, freeDailyLimit: v })}
            min={1}
            max={100}
          />
          <FieldRow
            label="회원3(area_study_mgmt) 일 한도 (회/일)"
            help="유료 학생 한도. 운영팀이 비용/UX 균형 조절. 보수안 20."
            name="tier1DailyLimit"
            value={draft.tier1DailyLimit}
            onChange={(v) => setDraft({ ...draft, tier1DailyLimit: v })}
            min={1}
            max={500}
          />
          <FieldRow
            label="답변 최대 출력 토큰"
            help="작을수록 답변 짧고 비용 절감. 800 권장 (1024 max 의 80%)."
            name="maxOutputTokens"
            value={draft.maxOutputTokens}
            onChange={(v) => setDraft({ ...draft, maxOutputTokens: v })}
            min={128}
            max={4096}
          />
          <FieldRow
            label="컨텍스트 청크 수 (RAG top-K)"
            help="작을수록 입력 토큰 절감. 8 권장 (정밀도/비용 균형)."
            name="maxContextChunks"
            value={draft.maxContextChunks}
            onChange={(v) => setDraft({ ...draft, maxContextChunks: v })}
            min={2}
            max={30}
          />

          {error ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
          ) : null}
          {saved ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-300">
              저장되었습니다.
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving} className="rounded-full">
              {saving ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SaveIcon className="size-3.5" />
              )}
              저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDraft(quotas)}
              disabled={saving}
              className="rounded-full"
            >
              되돌리기
            </Button>
          </div>
        </Form>

        <section className="border-border bg-muted/30 rounded-2xl border p-4 text-xs">
          <p className="text-foreground font-semibold">
            비용 추정 (Claude Sonnet 4.6 기준, 한 건당 약 75원)
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-4 leading-relaxed">
            <li>
              회원3 50명 × {draft.tier1DailyLimit}회/일 × 30일 ≈{" "}
              <strong className="text-foreground tabular-nums">
                {(
                  (50 * draft.tier1DailyLimit * 30 * 75) /
                  10000
                ).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
              </strong>{" "}
              만원/월
            </li>
            <li>
              무료 100명 × {draft.freeDailyLimit}회/일 × 30일 ≈{" "}
              <strong className="text-foreground tabular-nums">
                {(
                  (100 * draft.freeDailyLimit * 30 * 75) /
                  10000
                ).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
              </strong>{" "}
              만원/월
            </li>
            <li>
              실제는 평균 30% 사용 가정 시 위 값의 약 1/3 — 데이터가 쌓이면{" "}
              <code className="text-foreground">ai_messages.token_usage</code>{" "}
              로 정밀 정산 가능.
            </li>
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}

function FieldRow({
  label,
  help,
  name,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  help: string;
  name: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-sm font-semibold">
        {label}
      </Label>
      <Input
        id={name}
        name={name}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40"
      />
      <p className="text-muted-foreground text-xs leading-relaxed">{help}</p>
    </div>
  );
}
