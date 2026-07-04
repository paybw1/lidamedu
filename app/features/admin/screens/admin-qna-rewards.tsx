// feat-7-042 Q&A 답변 적립·지급 (manager+) — 단가·한도 설정 + 강사별 적립 현황 + 지급 처리.
// 적립: 강사 답변 확정 시 자동(스레드당 1건, rewards.server). 지급: 미지급 누적이 한도
// 도달 시 운영자가 일괄 지급 처리. 크레딧은 답변 저작물 이용 대가 — 답변 수정·삭제·강사
// 변경과 무관하게 유지.

import { CoinsIcon } from "lucide-react";
import { Form, data, redirect, useActionData } from "react-router";
import { z } from "zod";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  Field,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getQnaRewardSettings } from "~/features/qna/rewards.server";

import type { Route } from "./+types/admin-qna-rewards";

export const meta: Route.MetaFunction = () => [
  { title: "Q&A 답변 적립 | 운영자" },
];

async function requireManager(request: Request): Promise<string> {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { data: prof } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!roleAtLeast(prof?.role, "manager")) throw redirect("/admin");
  return user.id;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireManager(request);
  const [settings, { data: credits }, { data: payouts }] = await Promise.all([
    getQnaRewardSettings(),
    adminClient
      .from("instructor_qna_credits")
      .select("instructor_id, amount_krw, payout_id, profiles!instructor_id(name)")
      .limit(50000),
    adminClient
      .from("qna_reward_payouts")
      .select("payout_id, instructor_id, amount_krw, credit_count, paid_at, profiles!instructor_id(name)")
      .order("paid_at", { ascending: false })
      .limit(200),
  ]);

  const byInstructor = new Map<
    string,
    { name: string | null; totalKrw: number; totalCount: number; unpaidKrw: number; unpaidCount: number }
  >();
  for (const c of credits ?? []) {
    if (!byInstructor.has(c.instructor_id)) {
      byInstructor.set(c.instructor_id, {
        name: c.profiles?.name ?? null,
        totalKrw: 0,
        totalCount: 0,
        unpaidKrw: 0,
        unpaidCount: 0,
      });
    }
    const agg = byInstructor.get(c.instructor_id)!;
    agg.totalKrw += c.amount_krw;
    agg.totalCount += 1;
    if (!c.payout_id) {
      agg.unpaidKrw += c.amount_krw;
      agg.unpaidCount += 1;
    }
  }

  return {
    settings,
    instructors: [...byInstructor.entries()]
      .map(([id, v]) => ({ instructorId: id, ...v }))
      .sort((a, b) => b.unpaidKrw - a.unpaidKrw),
    payouts: (payouts ?? []).map((p) => ({
      payoutId: p.payout_id,
      instructorName: p.profiles?.name ?? null,
      amountKrw: p.amount_krw,
      creditCount: p.credit_count,
      paidAt: p.paid_at,
    })),
  };
}

const settingsSchema = z.object({
  intent: z.literal("settings"),
  unitKrw: z.coerce.number().int().min(0).max(1000000),
  payoutThresholdKrw: z.coerce.number().int().min(1000).max(100000000),
  isActive: z.enum(["true", "false"]),
});
const payoutSchema = z.object({
  intent: z.literal("payout"),
  instructorId: z.string().uuid(),
});

export async function action({ request }: Route.ActionArgs) {
  const actorId = await requireManager(request);
  const form = Object.fromEntries(await request.formData());

  if (form.intent === "settings") {
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
    const { error } = await adminClient.from("qna_reward_settings").upsert({
      id: true,
      unit_krw: parsed.data.unitKrw,
      payout_threshold_krw: parsed.data.payoutThresholdKrw,
      is_active: parsed.data.isActive === "true",
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return redirect("/admin/settlements/qna-rewards");
  }

  if (form.intent === "payout") {
    const parsed = payoutSchema.safeParse(form);
    if (!parsed.success)
      return data({ error: "입력값을 확인해 주세요." }, { status: 400 });
    const instructorId = parsed.data.instructorId;
    const { data: unpaid, error: qErr } = await adminClient
      .from("instructor_qna_credits")
      .select("credit_id, amount_krw")
      .eq("instructor_id", instructorId)
      .is("payout_id", null)
      .limit(50000);
    if (qErr) return data({ error: qErr.message }, { status: 400 });
    const total = (unpaid ?? []).reduce((a, c) => a + c.amount_krw, 0);
    if (!unpaid?.length || total <= 0)
      return data({ error: "지급할 미지급 적립이 없습니다." }, { status: 400 });
    const { data: payout, error: pErr } = await adminClient
      .from("qna_reward_payouts")
      .insert({
        instructor_id: instructorId,
        amount_krw: total,
        credit_count: unpaid.length,
        paid_by: actorId,
      })
      .select("payout_id")
      .single();
    if (pErr || !payout)
      return data({ error: pErr?.message ?? "지급 생성 실패" }, { status: 400 });
    const { error: uErr } = await adminClient
      .from("instructor_qna_credits")
      .update({ payout_id: payout.payout_id })
      .eq("instructor_id", instructorId)
      .is("payout_id", null);
    if (uErr) return data({ error: uErr.message }, { status: 400 });
    return redirect("/admin/settlements/qna-rewards");
  }

  return data({ error: "알 수 없는 intent" }, { status: 400 });
}

function fmtKrw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export default function AdminQnaRewards({ loaderData }: Route.ComponentProps) {
  const { settings, instructors, payouts } = loaderData;
  const actionData = useActionData<{ error?: string }>();

  return (
    <AdminShell
      cluster="sales"
      title="Q&A 답변 적립"
      desc="강사가 Q&A 답변을 등록하면 답변 1건당 단가가 자동 적립되고, 미지급 누적이 한도에 도달하면 지급 처리합니다. 적립·지급된 금액은 답변 저작물 이용 대가로, 답변 수정·삭제·강사 변경과 무관하게 유지됩니다."
    >
      {/* 설정 */}
      <Form
        method="post"
        className="border-border bg-card mb-5 rounded-xl border p-4 shadow-sm"
      >
        <input type="hidden" name="intent" value="settings" />
        <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold">
          <CoinsIcon className="text-link size-4" /> 적립 설정
        </h2>
        {actionData?.error ? (
          <p className="mb-3 text-xs font-semibold text-rose-600">{actionData.error}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="답변 1건당 적립액 (원)" required htmlFor="unitKrw">
            <Input
              id="unitKrw"
              name="unitKrw"
              type="number"
              min={0}
              defaultValue={settings.unitKrw}
              required
              className="h-9 w-36"
            />
          </Field>
          <Field label="지급 한도 (원)" required htmlFor="payoutThresholdKrw">
            <Input
              id="payoutThresholdKrw"
              name="payoutThresholdKrw"
              type="number"
              min={1000}
              defaultValue={settings.payoutThresholdKrw}
              required
              className="h-9 w-36"
            />
          </Field>
          <Field label="적립 활성" htmlFor="isActive">
            <select
              id="isActive"
              name="isActive"
              defaultValue={String(settings.isActive)}
              className="border-input bg-background h-9 rounded-md border px-3 text-[13px] outline-none"
            >
              <option value="true">활성</option>
              <option value="false">중지</option>
            </select>
          </Field>
          <Button type="submit" size="sm">
            저장
          </Button>
        </div>
      </Form>

      {/* 강사별 적립 현황 */}
      <h2 className="text-muted-foreground mb-2 text-[12px] font-bold tracking-widest uppercase">
        강사별 적립 현황
      </h2>
      {instructors.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground mb-6 rounded-xl border py-10 text-center text-sm shadow-sm">
          적립 내역이 없습니다. 강사가 Q&A에 답변하면 자동으로 쌓입니다.
        </div>
      ) : (
        <IndexTable
          minWidth={720}
          headers={[
            { label: "강사", width: "11rem" },
            { label: "답변 수 (누적)", align: "right", width: "8rem" },
            { label: "누적 적립", align: "right", width: "8rem" },
            { label: "미지급", align: "right", width: "8rem" },
            { label: "상태", align: "center", width: "8rem" },
            { label: "", align: "right", width: "7rem" },
          ]}
        >
          {instructors.map((i) => (
            <TR key={i.instructorId}>
              <TD>{i.name ?? i.instructorId.slice(0, 8)}</TD>
              <TD align="right" mono soft>
                {i.totalCount}
              </TD>
              <TD align="right" mono soft>
                {fmtKrw(i.totalKrw)}
              </TD>
              <TD align="right" mono>
                {fmtKrw(i.unpaidKrw)}
              </TD>
              <TD align="center">
                {i.unpaidKrw >= settings.payoutThresholdKrw ? (
                  <Chip tone="coral">지급 대상</Chip>
                ) : i.unpaidKrw > 0 ? (
                  <Chip tone="amber">적립 중</Chip>
                ) : (
                  <Chip tone="neutral">지급 완료</Chip>
                )}
              </TD>
              <TD align="right">
                {i.unpaidKrw > 0 ? (
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (
                        !confirm(
                          `${i.name ?? "이 강사"}에게 미지급 ${fmtKrw(i.unpaidKrw)}(${i.unpaidCount}건)을 지급 처리하시겠습니까?`,
                        )
                      )
                        e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="payout" />
                    <input type="hidden" name="instructorId" value={i.instructorId} />
                    <button
                      type="submit"
                      className="text-link text-xs font-semibold hover:underline"
                    >
                      지급 처리
                    </button>
                  </Form>
                ) : null}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}

      {/* 지급 이력 */}
      <h2 className="text-muted-foreground mt-6 mb-2 text-[12px] font-bold tracking-widest uppercase">
        지급 이력
      </h2>
      {payouts.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-8 text-center text-sm shadow-sm">
          지급 이력이 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={560}
          headers={[
            { label: "지급일", width: "8rem" },
            { label: "강사" },
            { label: "답변 수", align: "right", width: "7rem" },
            { label: "지급액", align: "right", width: "8rem" },
          ]}
        >
          {payouts.map((p) => (
            <TR key={p.payoutId}>
              <TD mono soft>
                {p.paidAt.slice(0, 10)}
              </TD>
              <TD>{p.instructorName ?? "—"}</TD>
              <TD align="right" mono soft>
                {p.creditCount}
              </TD>
              <TD align="right" mono>
                {fmtKrw(p.amountKrw)}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
