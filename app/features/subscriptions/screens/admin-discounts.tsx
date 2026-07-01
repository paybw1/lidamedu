// 할인 관리 (feat-8-028 Stage D). manager+ 전용.
// 기간·조건·쿠폰(코드) 할인 정의. 자동 프로모션(코드 없음)은 요금표에 즉시 반영.
import type { ReactNode } from "react";

import { PencilIcon, PlusIcon, TicketPercentIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, IndexTable, TD, TR } from "~/features/admin/components/admin-ui";
import {
  type Discount,
  listAllDiscounts,
} from "~/features/subscriptions/discounts.server";
import {
  DISCOUNT_KIND_LABEL,
  DISCOUNT_TARGET_LABEL,
} from "~/features/subscriptions/labels";
import {
  type SubscriptionPlan,
  listAllPlans,
} from "~/features/subscriptions/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-discounts";

export const meta: Route.MetaFunction = () => [
  { title: "할인 관리 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role || !roleAtLeast(role, "manager")) {
    throw data("Forbidden — manager only", { status: 403 });
  }
  const [discounts, plans] = await Promise.all([
    listAllDiscounts(),
    listAllPlans(),
  ]);
  return { discounts, plans: plans.filter((p) => p.priceKrw > 0), role };
}

export default function AdminDiscounts({ loaderData }: Route.ComponentProps) {
  const { discounts, plans, role } = loaderData;
  const [adding, setAdding] = useState(false);

  return (
    <AdminShell
      cluster="students"
      role={role}
      title="할인 관리"
      desc="기간·조건 할인과 쿠폰을 정의합니다. 코드 없는 할인은 요금표에 자동 반영됩니다. (manager 이상)"
      headerRight={
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <PlusIcon className="size-3.5" /> 할인 추가
        </Button>
      }
    >
      {adding ? (
        <div className="mb-3">
          <DiscountForm mode="create" plans={plans} onClose={() => setAdding(false)} />
        </div>
      ) : null}

      <IndexTable
        minWidth={960}
        headers={[
          { label: "이름" },
          { label: "코드", width: "8rem" },
          { label: "할인", width: "6rem" },
          { label: "대상", width: "8rem" },
          { label: "기간", width: "11rem" },
          { label: "사용", align: "center", width: "5rem" },
          { label: "활성", align: "center", width: "5rem" },
          { label: "", align: "right", width: "4rem" },
        ]}
      >
        {discounts.map((d) => (
          <DiscountRow key={d.discountId} discount={d} plans={plans} />
        ))}
      </IndexTable>
    </AdminShell>
  );
}

function DiscountRow({
  discount: d,
  plans,
}: {
  discount: Discount;
  plans: SubscriptionPlan[];
}) {
  const [editing, setEditing] = useState(false);
  const period =
    d.startsAt || d.endsAt
      ? `${d.startsAt ? d.startsAt.slice(0, 10) : "…"} ~ ${d.endsAt ? d.endsAt.slice(0, 10) : "…"}`
      : "상시";
  return (
    <>
      <TR>
        <TD>
          <span className="font-medium">{d.name}</span>
        </TD>
        <TD soft mono>
          {d.code ? d.code : <Chip tone="outline">자동</Chip>}
        </TD>
        <TD mono>
          {d.kind === "percent"
            ? `${d.value}%`
            : `₩${d.value.toLocaleString("ko-KR")}`}
        </TD>
        <TD soft>{DISCOUNT_TARGET_LABEL[d.targetKind]}</TD>
        <TD soft mono>
          {period}
        </TD>
        <TD align="center" mono soft>
          {d.usedCount}
          {d.maxUses != null ? `/${d.maxUses}` : ""}
        </TD>
        <TD align="center">
          {d.isActive ? (
            <Chip tone="emerald">활성</Chip>
          ) : (
            <Chip tone="neutral">비활성</Chip>
          )}
        </TD>
        <TD align="right">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="수정"
          >
            <PencilIcon className="size-3.5" />
          </button>
        </TD>
      </TR>
      {editing ? (
        <tr className="border-border/60 border-b last:border-0">
          <td colSpan={8} className="p-3">
            <DiscountForm
              mode="update"
              discount={d}
              plans={plans}
              onClose={() => setEditing(false)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  const off = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - off).toISOString().slice(0, 16);
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}

function DiscountForm({
  mode,
  discount: d,
  plans,
  onClose,
}: {
  mode: "create" | "update";
  discount?: Discount;
  plans: SubscriptionPlan[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;
  const [targetKind, setTargetKind] = useState(d?.targetKind ?? "all");
  const targetSet = new Set(d?.targetPlanCodes ?? []);

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/discount"
      className="bg-card border-border space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {mode === "create" ? "새 할인 추가" : `할인 수정 · ${d?.name}`}
      </p>
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="discountId" value={d!.discountId} />
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <FormField label="이름 *">
          <Input
            name="name"
            required
            maxLength={100}
            defaultValue={d?.name ?? ""}
            className="h-8 text-xs"
            placeholder="예: 오픈 기념 20%"
          />
        </FormField>
        <FormField label="쿠폰 코드 (비우면 자동 프로모션)">
          <Input
            name="code"
            maxLength={40}
            defaultValue={d?.code ?? ""}
            className="h-8 text-xs"
            placeholder="예: OPEN20"
          />
        </FormField>
        <FormField label="종류">
          <select
            name="kind"
            defaultValue={d?.kind ?? "percent"}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            <option value="percent">% 할인</option>
            <option value="fixed">정액 할인 (원)</option>
          </select>
        </FormField>
        <FormField label="할인 값 (% 또는 원)">
          <Input
            name="value"
            type="number"
            min={0}
            required
            defaultValue={d?.value ?? 0}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="대상">
          <select
            name="targetKind"
            value={targetKind}
            onChange={(e) =>
              setTargetKind(e.target.value as Discount["targetKind"])
            }
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            <option value="all">전체 상품</option>
            <option value="subject">개별 과목</option>
            <option value="bundle">번들</option>
            <option value="plan">특정 상품</option>
          </select>
        </FormField>
        <FormField label="최소 결제액 (원, 선택)">
          <Input
            name="minAmountKrw"
            type="number"
            min={0}
            defaultValue={d?.minAmountKrw ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="시작 (선택)">
          <Input
            name="startsAt"
            type="datetime-local"
            defaultValue={isoToLocalInput(d?.startsAt ?? null)}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="종료 (선택)">
          <Input
            name="endsAt"
            type="datetime-local"
            defaultValue={isoToLocalInput(d?.endsAt ?? null)}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="총 사용 한도 (선택)">
          <Input
            name="maxUses"
            type="number"
            min={1}
            defaultValue={d?.maxUses ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="인당 한도 (선택)">
          <Input
            name="perUserLimit"
            type="number"
            min={1}
            defaultValue={d?.perUserLimit ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
      </div>

      {targetKind === "plan" ? (
        <div>
          <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold">
            대상 상품 (특정 상품일 때)
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {plans.map((p) => (
              <label
                key={p.code}
                className="inline-flex items-center gap-1 text-xs"
              >
                <input
                  type="checkbox"
                  name="targetPlanCodes"
                  value={p.code}
                  defaultChecked={targetSet.has(p.code)}
                  className="size-3.5"
                />
                {p.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          name="isActive"
          value="1"
          defaultChecked={d?.isActive ?? true}
          className="size-3.5"
        />
        활성
      </label>

      {hasError ? (
        <p className="text-rose-600 text-xs">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          {mode === "create" ? (
            <>
              <PlusIcon className="size-3.5" /> 추가
            </>
          ) : (
            <>
              <TicketPercentIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}
