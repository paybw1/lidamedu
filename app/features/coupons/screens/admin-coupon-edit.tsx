// feat-13 쿠폰 등록/수정 — /admin/coupons/new · /:couponId/edit.
import { useState } from "react";
import { Form, Link, data, redirect, useActionData } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import { SCOPE_OPTIONS } from "../labels";
import { getCoupon } from "../queries.server";

import type { Route } from "./+types/admin-coupon-edit";

export function meta() {
  return [{ title: "쿠폰 등록 | 운영관리" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const c = params.couponId ? await getCoupon(client, params.couponId) : null;
  // 개별(비공용) 쿠폰의 발급 내역.
  let grants: Awaited<
    ReturnType<typeof import("../grants.server").listCouponGrants>
  > = [];
  if (c && !c.is_shared) {
    const { listCouponGrants } = await import("../grants.server");
    grants = await listCouponGrants(c.coupon_id);
  }
  return { role, c, grants };
}

// 개별 발급/회수 — 인라인 에러 노출 위해 페이지 자체 action 사용(저장/삭제는 /api/admin/coupon).
export async function action({ request, params }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  if (!(await getStaffRole(client, user.id)))
    return data({ error: "Forbidden" }, { status: 403 });
  const couponId = params.couponId;
  if (!couponId) return data({ error: "쿠폰을 찾을 수 없습니다." }, { status: 400 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  if (intent === "grant") {
    const email = String(fd.get("email") ?? "").trim();
    if (!email) return data({ error: "이메일을 입력해 주세요." }, { status: 400 });
    const { grantCouponToEmail } = await import("../grants.server");
    const r = await grantCouponToEmail({ couponId, email, grantedBy: user.id });
    if (!r.ok) return data({ error: r.error }, { status: 400 });
    return redirect(`/admin/coupons/${couponId}/edit`);
  }
  if (intent === "revoke") {
    const grantId = String(fd.get("grantId") ?? "");
    if (grantId) {
      const { revokeCouponGrant } = await import("../grants.server");
      await revokeCouponGrant(grantId);
    }
    return redirect(`/admin/coupons/${couponId}/edit`);
  }
  return data({ error: "bad intent" }, { status: 400 });
}

const IN = "h-9 text-sm";
const REQ = <span className="text-rose-500"> *</span>;

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="border-border grid grid-cols-1 gap-2 border-b py-4 sm:grid-cols-[160px_1fr] sm:items-start sm:gap-4">
      <Label className="pt-1.5 text-[13px] font-semibold">
        {label}
        {required ? REQ : null}
      </Label>
      <div className="flex flex-col gap-1.5">
        {children}
        {hint ? (
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminCouponEdit({ loaderData }: Route.ComponentProps) {
  const { role, c, grants } = loaderData;
  const actionData = useActionData<typeof action>();
  const [discountType, setDiscountType] = useState(c?.discount_type ?? "fixed");

  return (
    <AdminShell
      cluster="sales"
      role={role}
      title={c ? "쿠폰 수정" : "쿠폰 등록"}
      desc="유효기간은 필수, 사용일수는 선택입니다."
    >
      <div className="mx-auto max-w-3xl p-5 md:p-8">
        <Link
          to="/admin/coupons"
          className="text-muted-foreground hover:text-foreground mb-4 inline-block text-sm"
        >
          ← 쿠폰 목록
        </Link>

        {/* 유효기간 및 사용일수 안내 */}
        <div className="border-border bg-muted/40 mb-5 rounded-xl border p-4 text-[13px] leading-relaxed">
          <p className="text-foreground mb-1 font-bold">
            유효기간 및 사용일수 안내
          </p>
          <p className="text-muted-foreground">
            유효기간은 필수, 사용일수는 선택 사항입니다.
          </p>
          <ul className="text-muted-foreground mt-1.5 list-disc space-y-1 pl-4">
            <li>
              유효기간과 관계없이 사용일수 기준으로만 쿠폰을 운영하려면, 유효기간을
              충분히 길게 설정해 주세요.
            </li>
            <li>사용일수가 설정되어 있더라도 유효기간이 우선 적용됩니다.</li>
          </ul>
        </div>

        <Form method="post" action="/api/admin/coupon">
          <input type="hidden" name="intent" value="save" />
          {c ? <input type="hidden" name="id" value={c.coupon_id} /> : null}

          <Field label="쿠폰명" required>
            <Input name="name" required defaultValue={c?.name} className={IN} />
          </Field>

          <Field label="쿠폰범위" required>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {SCOPE_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="scope"
                    value={o.value}
                    defaultChecked={(c?.scope ?? "all") === o.value}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="최소금액"
            required
            hint="최소금액 이상 가격의 상품에만 쿠폰 적용이 가능합니다."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                name="min_amount"
                defaultValue={c?.min_amount ?? 0}
                className={`${IN} w-40`}
                min={0}
              />
              <span className="text-muted-foreground text-sm">원</span>
            </div>
          </Field>

          <Field label="할인구분" required>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="discount_type"
                  value="fixed"
                  checked={discountType === "fixed"}
                  onChange={() => setDiscountType("fixed")}
                />
                정액
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="discount_type"
                  value="percent"
                  checked={discountType === "percent"}
                  onChange={() => setDiscountType("percent")}
                />
                정률
              </label>
              <span className="text-muted-foreground text-sm">할인가{REQ}</span>
              <Input
                type="number"
                name="discount_value"
                defaultValue={c?.discount_value ?? 0}
                className={`${IN} w-40`}
                min={0}
                required
              />
              <span className="text-muted-foreground text-sm">
                {discountType === "percent" ? "%" : "원"}
              </span>
            </div>
          </Field>

          <Field label="공용여부" required>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="is_shared"
                  value="shared"
                  defaultChecked={c ? c.is_shared : true}
                  className="mt-1"
                />
                <span>
                  <b>공용</b>
                  <span className="text-muted-foreground">
                    {" "}
                    공용 쿠폰번호를 1개 발급하고, 여러 명이 사용할 수 있습니다.
                    아이디당 1번 등록 및 사용이 가능합니다.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="is_shared"
                  value="individual"
                  defaultChecked={c ? !c.is_shared : false}
                  className="mt-1"
                />
                <span>
                  <b>개별</b>
                  <span className="text-muted-foreground">
                    {" "}
                    각기 다른 쿠폰번호를 여러 개 발급하고, 번호당 1번 사용이
                    가능합니다.
                  </span>
                </span>
              </label>
            </div>
          </Field>

          <Field label="발행수" required>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                name="issue_count"
                defaultValue={c?.issue_count ?? 0}
                className={`${IN} w-40`}
                min={0}
              />
              <span className="text-muted-foreground text-sm">장</span>
            </div>
          </Field>

          <Field label="유효기간" required>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                name="valid_from"
                defaultValue={c?.valid_from ?? ""}
                className={`${IN} w-44`}
                required
              />
              <span className="text-muted-foreground">~</span>
              <Input
                type="date"
                name="valid_to"
                defaultValue={c?.valid_to ?? ""}
                className={`${IN} w-44`}
                required
              />
            </div>
          </Field>

          <Field
            label="사용일수"
            hint="관리자의 발급일 또는 사용자의 등록일로부터 최대 +n 일로 자동 계산됩니다."
          >
            <div className="flex items-center gap-2">
              <Input
                type="number"
                name="usable_days"
                defaultValue={c?.usable_days ?? ""}
                className={`${IN} w-40`}
                min={0}
                placeholder="선택"
              />
              <span className="text-muted-foreground text-sm">일</span>
            </div>
          </Field>

          <Field label="상태" required hint="중지된 쿠폰은 사용할 수 없습니다.">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="status"
                  value="active"
                  defaultChecked={(c?.status ?? "active") === "active"}
                />
                정상
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="status"
                  value="stopped"
                  defaultChecked={c?.status === "stopped"}
                />
                중지
              </label>
            </div>
          </Field>

          <div className="mt-5 flex justify-end gap-2">
            <Button asChild variant="ghost">
              <Link to="/admin/coupons">취소</Link>
            </Button>
            <Button type="submit">{c ? "저장" : "등록"}</Button>
          </div>
        </Form>

        {/* 개별 발급 관리 — 비공용 쿠폰만 */}
        {c && !c.is_shared ? (
          <div className="border-border mt-8 rounded-xl border p-5">
            <h2 className="text-sm font-bold">회원 개별 발급</h2>
            <p className="text-muted-foreground mt-1 text-[13px]">
              발급받은 회원만 결제 시 이 쿠폰을 사용할 수 있습니다. (번호당 1회 사용)
            </p>

            <Form method="post" className="mt-3 flex gap-2">
              <input type="hidden" name="intent" value="grant" />
              <Input
                name="email"
                type="email"
                required
                placeholder="회원 이메일"
                className={`${IN} max-w-xs`}
              />
              <Button type="submit" variant="outline" className="h-9 shrink-0">
                발급
              </Button>
            </Form>
            {actionData?.error ? (
              <p className="text-destructive mt-1.5 text-xs">{actionData.error}</p>
            ) : null}

            {grants.length > 0 ? (
              <ul className="mt-4 divide-y rounded-lg border text-sm">
                {grants.map((g) => (
                  <li
                    key={g.grantId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{g.name || "(이름 없음)"}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {g.email ?? g.userId.slice(0, 8)}
                      </span>
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {g.grantedAt.slice(0, 10)}
                    </span>
                    {g.revokedAt ? (
                      <span className="text-muted-foreground text-xs">회수됨</span>
                    ) : g.usedAt ? (
                      <span className="text-xs font-semibold text-emerald-600">
                        사용 완료
                      </span>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="intent" value="revoke" />
                        <input type="hidden" name="grantId" value={g.grantId} />
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-destructive text-xs underline"
                        >
                          회수
                        </button>
                      </Form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-4 text-xs">
                아직 발급 내역이 없습니다.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
