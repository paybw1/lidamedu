// feat-8-029 Stage 2 — 강사 배분 기준 관리 (manager+).
// 규칙 = 강사 × 대상(상품 > 과목 > 전체) × 정률(%)/정액(원). 값 수정 대신 "새 규칙 + 기존 비활성"
// (정산 항목이 규칙을 참조하므로 지급 근거 보존).

import { PercentIcon } from "lucide-react";
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
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-share-rules";

export const meta: Route.MetaFunction = () => [
  { title: "강사 배분 기준 | 운영자" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { client } = await requireManager(request);

  const [rules, instructors, plans] = await Promise.all([
    listShareRules(),
    listInstructorOptions(),
    listSubscriptionPlans(client),
  ]);
  return { rules, instructors, plans };
}

function subjectName(slug: string): string {
  return LAW_SUBJECTS[slug as keyof typeof LAW_SUBJECTS]?.name ?? slug;
}

export default function AdminShareRules({ loaderData }: Route.ComponentProps) {
  const { rules, instructors, plans } = loaderData;
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
