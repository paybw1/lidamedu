// 상품·요금 관리 (feat-8-028 Stage B). manager+ 전용.
// 개별 과목·번들·회원제 상품의 가격·부여 과목·기능·기간·활성을 편집한다.
import type { ReactNode } from "react";

import { PackageIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { data, useFetcher, useLocation, useNavigate } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FEATURE_LABEL,
  PRODUCT_KIND_LABEL,
  type ProductKind,
  type SubscriptionPlan,
} from "~/features/subscriptions/labels";
import { listAllPlans } from "~/features/subscriptions/queries.server";
import { LAW_SUBJECTS, LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-plans";

export const meta: Route.MetaFunction = () => [
  { title: "상품·요금 관리 | 리담변리사학원" },
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
  const plans = await listAllPlans();
  return { plans, role };
}

const subjectName = (slug: string) =>
  slug === "science"
    ? "자연과학"
    : (LAW_SUBJECTS[slug as keyof typeof LAW_SUBJECTS]?.name ?? slug);

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const dt = new Date(iso);
  const off = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - off).toISOString().slice(0, 16);
}

export default function AdminPlans({ loaderData }: Route.ComponentProps) {
  const { plans, role } = loaderData;
  const [adding, setAdding] = useState(false);

  return (
    <AdminShell
      cluster="sales"
      role={role}
      title="상품·요금 관리"
      desc="개별 과목·번들·회원제 상품의 가격·부여 과목·기능·기간을 관리합니다. (manager 이상)"
      headerRight={
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <PlusIcon className="size-3.5" /> 상품 추가
        </Button>
      }
    >
      {adding ? (
        <div className="mb-3">
          <PlanForm mode="create" onClose={() => setAdding(false)} />
        </div>
      ) : null}

      <IndexTable
        minWidth={900}
        headers={[
          { label: "코드", width: "9rem" },
          { label: "이름" },
          { label: "종류", width: "7rem" },
          { label: "가격", align: "right", width: "7rem" },
          { label: "부여 과목" },
          { label: "활성", align: "center", width: "5rem" },
          { label: "", align: "right", width: "4rem" },
        ]}
      >
        {plans.map((p) => (
          <PlanRow key={p.planId} plan={p} />
        ))}
      </IndexTable>
    </AdminShell>
  );
}

function PlanRow({ plan }: { plan: SubscriptionPlan }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <TR>
        <TD mono soft>
          {plan.code}
        </TD>
        <TD>
          <span className="font-medium">{plan.name}</span>
        </TD>
        <TD soft>{PRODUCT_KIND_LABEL[plan.productKind] ?? plan.productKind}</TD>
        <TD align="right" mono>
          ₩{plan.priceKrw.toLocaleString("ko-KR")}
        </TD>
        <TD soft>
          {plan.subjectCodes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {plan.subjectCodes.map((s) => (
                <Chip key={s} tone="outline">
                  {subjectName(s)}
                </Chip>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </TD>
        <TD align="center">
          {plan.isActive ? (
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
          <td colSpan={7} className="p-3">
            <PlanForm
              mode="update"
              plan={plan}
              onClose={() => setEditing(false)}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FormField({
  label,
  children,
  full,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      {children}
    </label>
  );
}

function PlanForm({
  mode,
  plan,
  onClose,
}: {
  mode: "create" | "update";
  plan?: SubscriptionPlan;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;

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

  const subjectSet = new Set(plan?.subjectCodes ?? []);
  const featureSet = new Set(plan?.features ?? []);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/plan"
      className="bg-card border-border space-y-3 rounded-xl border p-4 shadow-sm"
    >
      <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
        {mode === "create" ? "새 상품 추가" : `상품 수정 · ${plan?.code}`}
      </p>
      <input type="hidden" name="intent" value={mode} />
      {mode === "update" ? (
        <input type="hidden" name="code" value={plan!.code} />
      ) : null}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {mode === "create" ? (
          <FormField label="코드 * (영소문자·숫자·_)">
            <Input
              name="code"
              required
              maxLength={40}
              placeholder="예: subj_patent"
              className="h-8 text-xs"
            />
          </FormField>
        ) : null}
        <FormField label="이름 *">
          <Input
            name="name"
            required
            maxLength={100}
            defaultValue={plan?.name ?? ""}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="종류">
          <select
            name="productKind"
            defaultValue={(plan?.productKind ?? "subject") as ProductKind}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            <option value="subject">개별 과목</option>
            <option value="bundle">번들</option>
            <option value="membership">회원제</option>
          </select>
        </FormField>
        <FormField label="가격 (원)">
          <Input
            name="priceKrw"
            type="number"
            min={0}
            required
            defaultValue={plan?.priceKrw ?? 0}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="이용 기간 (일)">
          <Input
            name="durationDays"
            type="number"
            min={0}
            required
            defaultValue={plan?.durationDays ?? 30}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="정렬 순서">
          <Input
            name="displayOrder"
            type="number"
            min={0}
            required
            defaultValue={plan?.displayOrder ?? 0}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="오픈일 (비우면 즉시 판매)">
          <Input
            name="availableFrom"
            type="datetime-local"
            defaultValue={isoToLocalInput(plan?.availableFrom ?? null)}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="설명" full>
          <textarea
            name="description"
            maxLength={500}
            defaultValue={plan?.description ?? ""}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold">
            부여 학습과목 (결제 시 열림)
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {LAW_SUBJECT_SLUGS.map((slug) => (
              <label
                key={slug}
                className="inline-flex items-center gap-1 text-xs"
              >
                <input
                  type="checkbox"
                  name="subjectCodes"
                  value={slug}
                  defaultChecked={subjectSet.has(slug)}
                  className="size-3.5"
                />
                {LAW_SUBJECTS[slug].name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold">
            부여 기능 (권한)
          </p>
          <div className="grid grid-cols-1 gap-x-3 gap-y-1">
            {Object.entries(FEATURE_LABEL).map(([key, label]) => (
              <label
                key={key}
                className="inline-flex items-center gap-1 text-[11px]"
              >
                <input
                  type="checkbox"
                  name="features"
                  value={key}
                  defaultChecked={featureSet.has(key)}
                  className="size-3.5"
                />
                <span className="text-muted-foreground">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          name="isActive"
          value="1"
          defaultChecked={plan?.isActive ?? true}
          className="size-3.5"
        />
        활성 (요금표에 노출)
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
              <PackageIcon className="size-3.5" /> 저장
            </>
          )}
        </Button>
      </div>
    </fetcher.Form>
  );
}
