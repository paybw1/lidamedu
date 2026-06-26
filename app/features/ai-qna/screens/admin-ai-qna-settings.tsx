// feat-9-006 / 통합 Q&A Phase 6 — 운영자용 AI Q&A 설정 화면.
// ① 등급별 'AI 즉답' 토글(app_settings.qna_ai_instant) ② 한도·토큰 캡(ai_qna_quotas).
// 저장 즉시 다음 질문부터 반영.

import { Loader2Icon, SaveIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Switch } from "~/core/components/ui/switch";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  getQnaAiInstantToggle,
  setQnaAiInstantToggle,
  type QnaAiInstantToggle,
} from "~/features/qna/ai-answer.server";
import {
  getAiQuotas,
  setAiQuotas,
  type AiQuotas,
} from "~/features/ai-qna/settings.server";

import type { Route } from "./+types/admin-ai-qna-settings";

export const meta: Route.MetaFunction = () => [
  { title: "AI Q&A 설정 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/admin");
  const [quotas, instant] = await Promise.all([
    getAiQuotas(client),
    getQnaAiInstantToggle(client),
  ]);
  return { quotas, instant };
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

  // 등급별 즉답 토글 저장 — 통합 Q&A 질문 생성 시 즉답 여부 결정.
  if (fd.get("intent") === "instant") {
    const toggle: QnaAiInstantToggle = {
      free: fd.get("free") === "on",
      tier1: fd.get("tier1") === "on",
    };
    const res = await setQnaAiInstantToggle(client, toggle, user.id);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, savedInstant: toggle });
  }

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
  const { quotas, instant } = loaderData;
  const navigation = useNavigation();
  const saving = navigation.state !== "idle";
  const [draft, setDraft] = useState<AiQuotas>(quotas);
  const [instantDraft, setInstantDraft] = useState<QnaAiInstantToggle>(instant);
  const quotaSaved = actionData && "saved" in actionData;
  const instantSaved = actionData && "savedInstant" in actionData;
  const error =
    actionData && "error" in actionData ? actionData.error : null;

  return (
    <AdminShell title="AI Q&A 설정" cluster="comms">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-xl font-bold tracking-tight">AI Q&A 설정</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            통합 Q&A 의 등급별 AI 즉답 활성 여부와 한도·토큰 캡을 관리합니다. 저장
            즉시 다음 질문부터 반영됩니다.
          </p>
        </header>

        {/* ① 등급별 AI 즉답 토글 — 통합 Q&A 질문 시 AI 즉답 여부. OFF 면 강사 답변 대기. */}
        <Form
          method="post"
          className="border-border bg-card space-y-4 rounded-2xl border p-5 shadow-sm"
        >
          <input type="hidden" name="intent" value="instant" />
          <input
            type="hidden"
            name="free"
            value={instantDraft.free ? "on" : "off"}
          />
          <input
            type="hidden"
            name="tier1"
            value={instantDraft.tier1 ? "on" : "off"}
          />
          <div className="flex items-center gap-2">
            <SparklesIcon className="text-link size-4" />
            <h2 className="text-sm font-bold tracking-tight">
              등급별 AI 즉답
            </h2>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            ON 이면 해당 등급 학생이 Q&amp;A 에 질문할 때 AI 가 즉시 답변합니다(강사가
            이후 정확/부정확을 확인). OFF 면 AI 없이 <strong>강사 답변 대기</strong>
            로 등록됩니다(질문은 정상 접수). 품질을 확인하며 단계적으로 개방하세요.
          </p>

          <ToggleRow
            label="회원3 · 강사 (tier1)"
            help="area_study_mgmt 구독자 + 강사입니다. 비용 부담이 작아 우선 개방을 권장합니다."
            checked={instantDraft.tier1}
            onChange={(v) => setInstantDraft({ ...instantDraft, tier1: v })}
          />
          <ToggleRow
            label="무료 학생 (free)"
            help="그 외 전체입니다. 사용량이 많아 비용 영향이 큽니다 — 품질 확인 후 개방하세요."
            checked={instantDraft.free}
            onChange={(v) => setInstantDraft({ ...instantDraft, free: v })}
          />

          {instantSaved ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-300">
              즉답 설정이 저장되었습니다.
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving} className="rounded-full">
              {saving ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <SaveIcon className="size-3.5" />
              )}
              즉답 설정 저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setInstantDraft(instant)}
              disabled={saving}
              className="rounded-full"
            >
              되돌리기
            </Button>
          </div>
        </Form>

        {/* ② 한도·토큰 캡 */}
        <h2 className="text-sm font-bold tracking-tight">한도 · 토큰 캡</h2>
        <Form method="post" className="space-y-5">
          <input type="hidden" name="intent" value="quotas" />
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
          {quotaSaved ? (
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
            비용 추정 (Claude Haiku 4.5 기준, 한 건당 약 10원)
          </p>
          <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-4 leading-relaxed">
            <li>
              회원3 50명 × {draft.tier1DailyLimit}회/일 × 30일 ≈{" "}
              <strong className="text-foreground tabular-nums">
                {(
                  (50 * draft.tier1DailyLimit * 30 * 10) /
                  10000
                ).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
              </strong>{" "}
              만원/월
            </li>
            <li>
              무료 100명 × {draft.freeDailyLimit}회/일 × 30일 ≈{" "}
              <strong className="text-foreground tabular-nums">
                {(
                  (100 * draft.freeDailyLimit * 30 * 10) /
                  10000
                ).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}
              </strong>{" "}
              만원/월
            </li>
            <li>
              위는 한도 100% 사용 시 상한 — 실제는 더 낮습니다. 즉답이 꺼진 등급은
              비용이 발생하지 않으며, 전역 일일 캡(<code className="text-foreground">
                AI_QNA_DAILY_*_CAP
              </code>)으로 최악도 천장 이하로 보장됩니다.
            </li>
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="border-border/60 flex items-start justify-between gap-4 rounded-xl border p-3">
      <div className="space-y-0.5">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{help}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </div>
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
