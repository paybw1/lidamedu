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
import { PlanPolicyFields } from "~/features/subscriptions/components/plan-policy-fields";
import {
  LECTURE_CATEGORIES,
  LECTURE_CATEGORY_LABEL,
} from "~/features/lms/lib/lecture-category";
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
  SALE_STATUS_LABEL,
  SALE_STATUS_ORDER,
  type ProductKind,
  type SaleStatus,
  type SubscriptionPlan,
} from "~/features/subscriptions/labels";
import {
  getPlanBookLinks,
  getPlanCourseLinks,
  getPlanPolicies,
  listAllPlans,
  type PlanPolicy,
} from "~/features/subscriptions/queries.server";
import {
  listCourseEditionsForPicker,
  type CourseEditionRef,
} from "~/features/lms/queries.server";
import {
  listBooksForPicker,
  type BookPickerItem,
} from "~/features/bookstore/queries.server";
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
  const coursePlanIds = plans
    .filter((p) => p.productKind === "course" || p.productKind === "tpass")
    .map((p) => p.planId);
  const [policies, courseLinks, editions, bookLinks, books] = await Promise.all([
    getPlanPolicies(coursePlanIds),
    getPlanCourseLinks(coursePlanIds),
    listCourseEditionsForPicker(client),
    getPlanBookLinks(coursePlanIds),
    listBooksForPicker(),
  ]);
  return { plans, policies, courseLinks, editions, bookLinks, books, role };
}

const SALE_STATUS_TONE: Record<
  SaleStatus,
  "emerald" | "blue" | "amber" | "coral" | "outline"
> = {
  on_sale: "emerald",
  scheduled: "blue",
  paused: "amber",
  ended: "coral",
  hidden: "outline",
};

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
  const { plans, policies, courseLinks, editions, bookLinks, books, role } =
    loaderData;
  const [adding, setAdding] = useState(false);
  const coursePlans = plans
    .filter((p) => p.productKind === "course" || p.productKind === "tpass")
    .map((p) => ({ planId: p.planId, name: p.name }));

  return (
    <AdminShell
      cluster="products"
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
          <PlanForm
            mode="create"
            coursePlans={coursePlans}
            editions={editions}
            linkedCourseIds={[]}
            books={books}
            linkedBookIds={[]}
            onClose={() => setAdding(false)}
          />
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
          { label: "판매상태", align: "center", width: "6rem" },
          { label: "", align: "right", width: "4rem" },
        ]}
      >
        {plans.map((p) => (
          <PlanRow
            key={p.planId}
            plan={p}
            policy={policies[p.planId]}
            coursePlans={coursePlans}
            editions={editions}
            linkedCourseIds={courseLinks[p.planId] ?? []}
            books={books}
            linkedBookIds={bookLinks[p.planId] ?? []}
          />
        ))}
      </IndexTable>
    </AdminShell>
  );
}

type CoursePlanRef = { planId: string; name: string };

function PlanRow({
  plan,
  policy,
  coursePlans,
  editions,
  linkedCourseIds,
  books,
  linkedBookIds,
}: {
  plan: SubscriptionPlan;
  policy?: PlanPolicy;
  coursePlans: CoursePlanRef[];
  editions: CourseEditionRef[];
  linkedCourseIds: string[];
  books: BookPickerItem[];
  linkedBookIds: string[];
}) {
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
          <Chip tone={SALE_STATUS_TONE[plan.saleStatus] ?? "neutral"}>
            {SALE_STATUS_LABEL[plan.saleStatus] ?? plan.saleStatus}
          </Chip>
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
              policy={policy}
              coursePlans={coursePlans}
              editions={editions}
              linkedCourseIds={linkedCourseIds}
              books={books}
              linkedBookIds={linkedBookIds}
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
  policy,
  coursePlans,
  editions,
  linkedCourseIds,
  books,
  linkedBookIds,
  onClose,
}: {
  mode: "create" | "update";
  plan?: SubscriptionPlan;
  policy?: PlanPolicy;
  coursePlans: CoursePlanRef[];
  editions: CourseEditionRef[];
  linkedCourseIds: string[];
  books: BookPickerItem[];
  linkedBookIds: string[];
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;
  const [productKind, setProductKind] = useState<ProductKind>(
    (plan?.productKind ?? "subject") as ProductKind,
  );
  const showPolicy = productKind === "course" || productKind === "tpass";
  const [detailKind, setDetailKind] = useState<"none" | "image" | "html">(
    plan?.detailImageUrl ? "image" : plan?.detailHtml ? "html" : "none",
  );

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
      encType="multipart/form-data"
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
            value={productKind}
            onChange={(e) => setProductKind(e.target.value as ProductKind)}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            <option value="subject">개별 과목</option>
            <option value="bundle">번들</option>
            <option value="membership">회원제</option>
            <option value="course">강의 (강의 플랫폼)</option>
            <option value="tpass">T-PASS (강의 플랫폼)</option>
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

      {showPolicy ? (
        <div className="border-border bg-muted/30 space-y-1.5 rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
            연결 강의 (에디션)
          </p>
          <p className="text-muted-foreground/70 text-[11px]">
            {productKind === "tpass"
              ? "T-PASS 는 보통 여러 에디션을 포함합니다."
              : "단과 상품은 보통 1개 에디션을 연결합니다."}{" "}
            결제 시 연결된 강의의 수강권이 지급됩니다.
          </p>
          {editions.length === 0 ? (
            <p className="text-muted-foreground/60 text-[11px]">
              등록된 에디션이 없습니다. (강의 관리에서 먼저 생성)
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {editions.map((e) => (
                <label
                  key={e.courseId}
                  className="inline-flex items-center gap-1.5 text-[12px]"
                >
                  <input
                    type="checkbox"
                    name="courseIds"
                    value={e.courseId}
                    defaultChecked={linkedCourseIds.includes(e.courseId)}
                    className="size-3.5"
                  />
                  <span>{e.label}</span>
                  {e.status !== "published" ? (
                    <span className="text-muted-foreground/60 text-[10px]">
                      ({e.status === "draft" ? "초안" : e.status})
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {showPolicy ? (
        <div className="border-border bg-muted/30 space-y-1.5 rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
            연결 교재
          </p>
          <p className="text-muted-foreground/70 text-[11px]">
            이 강의의 사용 교재를 연결하면 수강신청 화면에 교재로 함께 표시됩니다.
          </p>
          {books.length === 0 ? (
            <p className="text-muted-foreground/60 text-[11px]">
              등록된 도서가 없습니다. (도서 관리에서 먼저 등록)
            </p>
          ) : (
            <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {books.map((b) => (
                <label
                  key={b.bookId}
                  className="inline-flex items-center gap-1.5 text-[12px]"
                >
                  <input
                    type="checkbox"
                    name="bookIds"
                    value={b.bookId}
                    defaultChecked={linkedBookIds.includes(b.bookId)}
                    className="size-3.5 shrink-0"
                  />
                  <span className="truncate">{b.title}</span>
                  {b.courseOnly ? (
                    <span className="text-muted-foreground/60 shrink-0 text-[10px]">
                      (강의전용)
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {showPolicy ? (
        <FormField label="강의 카탈로그 분류">
          <select
            name="lectureCategory"
            defaultValue={plan?.lectureCategory ?? ""}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs sm:w-56"
          >
            <option value="">미분류 (전체 탭에만 노출)</option>
            {LECTURE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {LECTURE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground/70 text-[10px]">
            수강신청(/lecture/catalog) 카테고리 탭 분류입니다.
          </span>
        </FormField>
      ) : null}

      {showPolicy ? (
        <div className="border-border bg-muted/30 space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
            수강신청 상세 페이지
          </p>
          <p className="text-muted-foreground/70 text-[11px]">
            수강신청 목록에서 이 강의를 클릭하면 열리는 상세 화면 본문입니다.
            히어로 배너처럼 이미지 또는 HTML 로 직접 구성합니다. (미사용 시 이름·소개·포함
            강의·교재만 표시)
          </p>
          <input type="hidden" name="detailKind" value={detailKind} />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {(
              [
                ["none", "미사용"],
                ["image", "이미지"],
                ["html", "HTML"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="detailKindRadio"
                  checked={detailKind === k}
                  onChange={() => setDetailKind(k)}
                  className="size-3.5"
                />
                {label}
              </label>
            ))}
          </div>
          {detailKind === "image" ? (
            <div className="space-y-1.5">
              {plan?.detailImageUrl ? (
                <img
                  src={plan.detailImageUrl}
                  alt="현재 상세 이미지"
                  className="border-border max-h-48 rounded border"
                />
              ) : null}
              <FormField label="이미지 파일 업로드 (세로로 긴 상세 이미지 권장)">
                <input
                  type="file"
                  name="detailImageFile"
                  accept="image/*"
                  className="text-xs"
                />
              </FormField>
              <FormField label="또는 이미지 URL 직접 입력 (파일 업로드 시 무시)">
                <Input
                  name="detailImageUrl"
                  defaultValue={plan?.detailImageUrl ?? ""}
                  placeholder="https://..."
                  className="h-8 text-xs"
                />
              </FormField>
            </div>
          ) : detailKind === "html" ? (
            <FormField label="HTML 본문">
              <textarea
                name="detailHtml"
                rows={8}
                defaultValue={plan?.detailHtml ?? ""}
                placeholder="<section>...</section>"
                className="border-input bg-background w-full rounded-md border px-2 py-1 font-mono text-[11px]"
              />
            </FormField>
          ) : null}
        </div>
      ) : null}

      {showPolicy ? (
        <PlanPolicyFields
          policy={policy}
          coursePlans={coursePlans}
          currentPlanId={plan?.planId}
        />
      ) : null}

      <FormField label="판매 상태">
        <select
          name="saleStatus"
          defaultValue={plan?.saleStatus ?? "hidden"}
          className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs sm:w-56"
        >
          {SALE_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {SALE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="text-muted-foreground/70 text-[10px]">
          판매중일 때만 요금표·카탈로그에 노출·구매 가능합니다.
        </span>
      </FormField>

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
