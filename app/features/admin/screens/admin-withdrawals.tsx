// 탈퇴 관리 (admin 전용) — No/회원명/회원아이디/삭제처리자/탈퇴일/삭제일/상태.
// 흐름: 탈퇴 처리(이용 승인 해제·계정 보존) → 완전 삭제(auth 계정 제거, 비가역).

import { UserMinusIcon } from "lucide-react";
import { Form, data, useActionData } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  listWithdrawals,
} from "~/features/admin/queries/withdrawals.server";

import type { Route } from "./+types/admin-withdrawals";

export const meta: Route.MetaFunction = () => [
  { title: "탈퇴 관리 | 리담변리사학원" },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (role !== "admin") throw data("Forbidden — admin only", { status: 403 });

  const withdrawals = await listWithdrawals();
  // 탈퇴 처리 폼용 — 학생 계정 목록 (이미 탈퇴 처리된 회원 제외).
  const withdrawnIds = new Set(
    withdrawals.filter((w) => w.status === "withdrawn").map((w) => w.userId),
  );
  const { data: students } = await adminClient
    .from("profiles")
    .select("profile_id, member_no, name")
    .eq("role", "student")
    .order("member_no");
  return {
    role,
    withdrawals,
    students: (students ?? []).filter((s) => !withdrawnIds.has(s.profile_id)),
  };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export default function AdminWithdrawals({ loaderData }: Route.ComponentProps) {
  const { role, withdrawals, students } = loaderData;
  const actionData = useActionData<{ error?: string }>();

  return (
    <AdminShell
      cluster="students"
      role={role}
      title="탈퇴 관리"
      desc="탈퇴 처리 시 이용 승인이 즉시 해제되고 계정·학습 데이터는 보존됩니다. 완전 삭제는 계정과 학습 데이터를 제거하는 비가역 작업입니다 (이 대장의 이름·아이디 스냅샷만 남음)."
    >
      {/* 탈퇴 처리 폼 */}
      <Form
        method="post"
        action="/api/admin/withdrawal"
        className="border-border bg-card mb-5 rounded-xl border p-4 shadow-sm"
        onSubmit={(e) => {
          const sel = e.currentTarget.querySelector<HTMLSelectElement>("select[name=userId]");
          const name = sel?.selectedOptions[0]?.text ?? "선택 회원";
          if (!confirm(`${name} 회원을 탈퇴 처리하시겠습니까? 이용 승인이 즉시 해제됩니다.`))
            e.preventDefault();
        }}
      >
        <input type="hidden" name="intent" value="withdraw" />
        <h2 className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold">
          <UserMinusIcon className="text-link size-4" /> 탈퇴 처리
        </h2>
        {actionData?.error ? (
          <p className="mb-3 text-xs font-semibold text-rose-600">{actionData.error}</p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="회원" required htmlFor="userId" className="min-w-[220px]">
            <AdminSelect id="userId" name="userId" required>
              <option value="">선택</option>
              {students.map((s) => (
                <option key={s.profile_id} value={s.profile_id}>
                  {s.name || "(이름 없음)"} {s.member_no != null ? `#${s.member_no}` : ""}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Field label="사유" htmlFor="reason" className="min-w-[260px] flex-1">
            <Input id="reason" name="reason" maxLength={300} className="h-9" placeholder="예: 본인 요청" />
          </Field>
          <Button type="submit" size="sm" variant="destructive">
            탈퇴 처리
          </Button>
        </div>
      </Form>

      {withdrawals.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground rounded-xl border py-14 text-center text-sm shadow-sm">
          탈퇴 이력이 없습니다.
        </div>
      ) : (
        <IndexTable
          minWidth={980}
          headers={[
            { label: "No", align: "center", width: "3.5rem" },
            { label: "회원명", width: "10rem" },
            { label: "회원아이디" },
            { label: "사유" },
            { label: "삭제처리자", width: "7rem" },
            { label: "탈퇴일", align: "right", width: "6.5rem" },
            { label: "삭제일", align: "right", width: "6.5rem" },
            { label: "상태", align: "center", width: "6rem" },
            { label: "", align: "right", width: "10rem" },
          ]}
          footer={
            <div className="border-border/60 text-muted-foreground border-t px-3 py-2 text-[11px] font-medium tabular-nums">
              총 {withdrawals.length}건
            </div>
          }
        >
          {withdrawals.map((w, i) => (
            <TR key={w.withdrawalId}>
              <TD align="center" soft mono>
                {i + 1}
              </TD>
              <TD>
                {w.userName ?? "—"}
                {w.memberNo != null ? (
                  <span className="text-muted-foreground ml-1 text-[11px]">#{w.memberNo}</span>
                ) : null}
              </TD>
              <TD soft mono>
                {w.userLoginId ?? "—"}
              </TD>
              <TD soft className="max-w-[14rem] truncate">
                {w.reason ?? "—"}
              </TD>
              <TD soft>{w.deletedByName ?? w.withdrawnByName ?? "—"}</TD>
              <TD align="right" mono soft>
                {fmtDate(w.withdrawnAt)}
              </TD>
              <TD align="right" mono soft>
                {fmtDate(w.deletedAt)}
              </TD>
              <TD align="center">
                {w.status === "deleted" ? (
                  <Chip tone="coral">삭제완료</Chip>
                ) : (
                  <Chip tone="amber">탈퇴</Chip>
                )}
              </TD>
              <TD align="right">
                {w.status === "withdrawn" ? (
                  <div className="inline-flex items-center gap-2.5">
                    <Form
                      method="post"
                      action="/api/admin/withdrawal"
                      onSubmit={(e) => {
                        if (
                          !confirm(
                            `${w.userName ?? "이 회원"}의 계정과 학습 데이터를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.`,
                          )
                        )
                          e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="withdrawalId" value={w.withdrawalId} />
                      <button
                        type="submit"
                        className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                      >
                        완전 삭제
                      </button>
                    </Form>
                    <Form
                      method="post"
                      action="/api/admin/withdrawal"
                      onSubmit={(e) => {
                        if (!confirm("탈퇴를 취소하고 이용을 재승인하시겠습니까?")) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="intent" value="cancel" />
                      <input type="hidden" name="withdrawalId" value={w.withdrawalId} />
                      <button type="submit" className="text-link text-xs font-semibold hover:underline">
                        탈퇴 취소
                      </button>
                    </Form>
                  </div>
                ) : null}
              </TD>
            </TR>
          ))}
        </IndexTable>
      )}
    </AdminShell>
  );
}
