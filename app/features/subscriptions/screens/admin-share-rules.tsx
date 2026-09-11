// feat-8-029 Stage 2 — 강사 배분 기준 관리 (manager+).
// 규칙 = 강사 × 대상(상품 > 과목 > 전체) × 정률(%)/정액(원). 값 수정 대신 "새 규칙 + 기존 비활성"
// (정산 항목이 규칙을 참조하므로 지급 근거 보존).

import { PercentIcon, ReceiptTextIcon } from "lucide-react";
import { Form, useActionData } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { requireManager } from "~/core/lib/admin-guard.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import {
  listInstructorOptions,
  listShareRules,
} from "~/features/subscriptions/settlements-admin.server";
import {
  TAX_TYPE_LABEL,
  bpToPercentText,
} from "~/features/subscriptions/settlement-engine";
import {
  getSettlementParams,
  listTaxProfiles,
} from "~/features/subscriptions/settlement-params.server";
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-share-rules";

export const meta: Route.MetaFunction = () => [
  { title: "강사 배분 기준 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { client } = await requireManager(request);

  const [rules, instructors, plans, params, taxProfiles] = await Promise.all([
    listShareRules(),
    listInstructorOptions(),
    listSubscriptionPlans(client),
    getSettlementParams(),
    listTaxProfiles(),
  ]);
  return { rules, instructors, plans, feeRateBp: params.feeRateBp, taxProfiles };
}

function subjectName(slug: string): string {
  return LAW_SUBJECTS[slug as keyof typeof LAW_SUBJECTS]?.name ?? slug;
}

export default function AdminShareRules({ loaderData }: Route.ComponentProps) {
  const { rules, instructors, plans, feeRateBp, taxProfiles } = loaderData;
  const actionData = useActionData<{ error?: string }>();
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return (
    <AdminShell
      cluster="sales"
      title="강사 배분 기준"
      desc="결제 1건에 강사별로 가장 구체적인 활성 규칙 1개가 적용됩니다(상품 > 과목 > 전체, 동급이면 적용 시작일 최신). 값 변경은 새 규칙을 등록하고 기존 규칙을 비활성하세요 — 확정된 정산의 지급 근거가 보존됩니다."
    >
      {/* 등록 폼 */}
      <Form
        method="post"
        action="/api/admin/share-rule"
        className="border-border bg-card mb-5 rounded-xl border p-4 shadow-sm"
      >
        <input type="hidden" name="intent" value="create" />
        <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold">
          <PercentIcon className="text-link size-4" /> 규칙 등록
        </h2>
        {actionData?.error ? (
          <p className="mb-3 text-xs font-semibold text-rose-600">
            {actionData.error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Field label="강사" required htmlFor="instructorId">
            <AdminSelect id="instructorId" name="instructorId" required>
              <option value="">선택</option>
              {instructors.map((i) => (
                <option key={i.profileId} value={i.profileId}>
                  {i.name ?? i.profileId.slice(0, 8)}
                  {i.role === "admin" ? " (원장)" : ""}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="적용 대상" required htmlFor="targetKind">
            <AdminSelect id="targetKind" name="targetKind" defaultValue="subject">
              <option value="plan">특정 상품</option>
              <option value="subject">과목</option>
              <option value="all">전체 결제</option>
            </AdminSelect>
          </Field>
          <Field label="대상 상품 (대상=특정 상품일 때)" htmlFor="targetPlanId">
            <AdminSelect id="targetPlanId" name="targetPlanId" defaultValue="">
              <option value="">—</option>
              {plans.map((p) => (
                <option key={p.planId} value={p.planId}>
                  {p.name}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="대상 과목 (대상=과목일 때)" htmlFor="targetSubjectCode">
            <AdminSelect id="targetSubjectCode" name="targetSubjectCode" defaultValue="">
              <option value="">—</option>
              {LAW_SUBJECT_SLUGS.map((slug) => (
                <option key={slug} value={slug}>
                  {subjectName(slug)}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="배분 방식" required htmlFor="shareKind">
            <AdminSelect id="shareKind" name="shareKind" defaultValue="percent">
              <option value="percent">정률 (%)</option>
              <option value="fixed">정액 (원/건)</option>
            </AdminSelect>
          </Field>
          <Field
            label="배분 값"
            required
            htmlFor="shareValue"
            hint="정률: 1~100(%) · 정액: 결제 1건당 원"
          >
            <Input
              id="shareValue"
              name="shareValue"
              type="number"
              min={1}
              required
              className="h-9"
            />
          </Field>
          <Field label="적용 시작일" required htmlFor="effectiveFrom">
            <Input
              id="effectiveFrom"
              name="effectiveFrom"
              type="date"
              defaultValue={today}
              required
              className="h-9"
            />
          </Field>
          <Field label="메모" htmlFor="memo">
            <Input id="memo" name="memo" maxLength={300} className="h-9" />
          </Field>
        </div>
        <div className="mt-3">
          <Button type="submit" size="sm">
            등록
          </Button>
        </div>
      </Form>

      {/* 정산 파라미터 — 수수료율(전체)·강사별 세금 유형. 정산 생성 때 정산서에 스냅샷으로 복사된다. */}
      <div className="border-border bg-card mb-5 rounded-xl border p-4 shadow-sm">
        <h2 className="mb-1 inline-flex items-center gap-1.5 text-sm font-bold">
          <ReceiptTextIcon className="text-link size-4" /> 정산 파라미터
        </h2>
        <p className="text-muted-foreground mb-3 text-xs">
          매출 = 결제 − 환불 − 수수료, 정산금액 = 매출 × 정산비율, 정산 지급액 =
          정산금액 − 세금액. 확정된 정산서는 확정 당시 값을 그대로 보존합니다.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <Form
            method="post"
            action="/api/admin/share-rule"
            className="border-border/60 flex items-end gap-2 rounded-lg border p-3"
          >
            <input type="hidden" name="intent" value="set_fee_rate" />
            <Field
              label="결제 수수료율 (%)"
              htmlFor="feeRatePercent"
              hint={
                feeRateBp > 0
                  ? `현재 ${bpToPercentText(feeRateBp)}`
                  : "미설정 — 수수료 0원으로 계산됩니다"
              }
            >
              <Input
                id="feeRatePercent"
                name="feeRatePercent"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue={(feeRateBp / 100).toFixed(2)}
                className="h-9 w-32"
              />
            </Field>
            <Button type="submit" size="sm" variant="outline">
              저장
            </Button>
          </Form>

          <Form
            method="post"
            action="/api/admin/share-rule"
            className="border-border/60 grid grid-cols-2 gap-2 rounded-lg border p-3 lg:grid-cols-4"
          >
            <input type="hidden" name="intent" value="set_tax_profile" />
            <Field label="강사" required htmlFor="taxInstructorId">
              <AdminSelect id="taxInstructorId" name="instructorId" required>
                <option value="">선택</option>
                {instructors.map((i) => (
                  <option key={i.profileId} value={i.profileId}>
                    {i.name ?? i.profileId.slice(0, 8)}
                  </option>
                ))}
              </AdminSelect>
            </Field>
            <Field label="세금 유형" required htmlFor="taxType">
              <AdminSelect id="taxType" name="taxType" defaultValue="withholding">
                <option value="withholding">개인(원천징수)</option>
                <option value="invoice">사업자(세금계산서)</option>
                <option value="none">없음</option>
              </AdminSelect>
            </Field>
            <Field label="세율 (%)" htmlFor="taxRatePercent" hint="개인 기본 3.3">
              <Input
                id="taxRatePercent"
                name="taxRatePercent"
                type="number"
                step="0.01"
                min={0}
                max={100}
                defaultValue="3.3"
                className="h-9"
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" size="sm" variant="outline">
                저장
              </Button>
            </div>
          </Form>
        </div>
        {taxProfiles.length > 0 ? (
          <p className="text-muted-foreground mt-2 text-xs">
            등록된 세금 유형:{" "}
            {taxProfiles
              .map(
                (t) =>
                  `${t.instructorName ?? t.instructorId.slice(0, 8)} ${TAX_TYPE_LABEL[t.taxType]} ${bpToPercentText(t.taxRateBp)}`,
              )
              .join(" · ")}
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">
            세금 유형 미등록 강사는 개인(원천징수) 3.3% 로 계산됩니다.
          </p>
        )}
      </div>

      {/* 규칙 목록 */}
      {rules.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-12 text-center text-sm shadow-sm">
          등록된 배분 규칙이 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={860}
          headers={[
            { label: "강사", width: "9rem" },
            { label: "적용 대상" },
            { label: "방식", align: "center", width: "6rem" },
            { label: "배분 값", align: "right", width: "8rem" },
            { label: "적용 시작", width: "7rem" },
            { label: "메모" },
            { label: "상태", align: "center", width: "5rem" },
            { label: "", align: "right", width: "6rem" },
          ]}
        >
          {rules.map((r) => (
            <TR key={r.ruleId}>
              <TD>{r.instructorName ?? r.instructorId.slice(0, 8)}</TD>
              <TD>
                {r.targetKind === "plan" ? (
                  <>
                    <Chip tone="blue">상품</Chip>{" "}
                    <span className="ml-1">{r.targetPlanName ?? "(삭제된 상품)"}</span>
                  </>
                ) : r.targetKind === "subject" ? (
                  <>
                    <Chip tone="violet">과목</Chip>{" "}
                    <span className="ml-1">{subjectName(r.targetSubjectCode ?? "")}</span>
                  </>
                ) : (
                  <Chip tone="neutral">전체 결제</Chip>
                )}
              </TD>
              <TD align="center" soft>
                {r.shareKind === "percent" ? "정률" : "정액"}
              </TD>
              <TD align="right" mono>
                {r.shareKind === "percent"
                  ? `${r.shareValue}%`
                  : `₩${r.shareValue.toLocaleString("ko-KR")}/건`}
              </TD>
              <TD mono soft>
                {r.effectiveFrom}
              </TD>
              <TD soft className="max-w-[16rem] truncate">
                {r.memo ?? "—"}
              </TD>
              <TD align="center">
                {r.isActive ? (
                  <Chip tone="emerald">활성</Chip>
                ) : (
                  <Chip tone="neutral">비활성</Chip>
                )}
              </TD>
              <TD align="right">
                <Form method="post" action="/api/admin/share-rule">
                  <input type="hidden" name="intent" value="toggle" />
                  <input type="hidden" name="ruleId" value={r.ruleId} />
                  <input
                    type="hidden"
                    name="isActive"
                    value={r.isActive ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className="text-link text-xs font-semibold hover:underline"
                  >
                    {r.isActive ? "비활성화" : "활성화"}
                  </button>
                </Form>
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
