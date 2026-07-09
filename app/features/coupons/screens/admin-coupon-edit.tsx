// feat-13 쿠폰 등록/수정 — /admin/coupons/new · /:couponId/edit.
import { useState } from "react";
import { Form, Link, redirect } from "react-router";

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
  return { role, c };
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
  const { role, c } = loaderData;
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
      </div>
    </AdminShell>
  );
}
