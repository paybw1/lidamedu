// 상품·요금 관리 (feat-8-028 Stage B). manager+ 전용.
// 개별 과목·번들·회원제 상품의 가격·부여 과목·기능·기간·활성을 편집한다.
import type { ReactNode } from "react";

import { PackageIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  data,
  useFetcher,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";

import { Button } from "~/core/components/ui/button";
import { ImageUploadHint } from "~/core/components/image-upload-hint";
import { Input } from "~/core/components/ui/input";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { HtmlEditor } from "~/features/lms/components/html-editor";
import {
  DETAIL_SECTIONS,
  type DetailSectionKey,
  hasAnyDetailSection,
} from "~/features/lms/lib/detail-sections";
import { PlanPolicyFields } from "~/features/subscriptions/components/plan-policy-fields";
import {
  Chip,
  IndexTable,
  TD,
  TR,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  FORMAT_LABEL as SCHEDULE_FORMAT_LABEL,
  STATUS_LABEL as SCHEDULE_STATUS_LABEL,
  type LectureFormat,
  type ScheduleStatus,
} from "~/features/landing/labels";
import {
  COURSE_FORMATS,
  COURSE_FORMAT_DESCRIPTION,
  COURSE_FORMAT_LABEL,
  type CourseFormat,
  courseFormatFormRules,
} from "~/features/lms/lib/course-format";
import {
  FEATURE_LABEL,
  PRODUCT_KIND_LABEL,
  SALE_STATUS_LABEL,
  SALE_STATUS_ORDER,
  isLectureProductKind,
  type ProductKind,
  type SaleStatus,
  type SubscriptionPlan,
} from "~/features/subscriptions/labels";
import { BookLinksEditor } from "~/features/subscriptions/components/book-links-editor";
import {
  getPlanBookLinks,
  getPlanCourseLinks,
  getPlanPolicies,
  getPlanSaleRecords,
  listAllPlans,
  type PlanBookLink,
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
  // 강의상품(course/tpass) 판정은 labels.ts SSOT 한 번 — planId·code 는 여기서 파생한다.
  const lecturePlans = plans.filter((p) => isLectureProductKind(p.productKind));
  const coursePlanIds = lecturePlans.map((p) => p.planId);
  const [policies, courseLinks, editions, bookLinks, books, categoryOptions, saleRecords] =
    await Promise.all([
      getPlanPolicies(coursePlanIds),
      getPlanCourseLinks(coursePlanIds),
      listCourseEditionsForPicker(client),
      getPlanBookLinks(coursePlanIds),
      listBooksForPicker(),
      // feat-11-008 P3 — 강의 카테고리 테이블 선택지(상위+하위).
      import("~/features/lms/queries.server").then((m) => m.listLectureCategoryOptions(client)),
      // feat-11-013 P2 — 신청내역(주문·수강생) 있는 상품은 과정 유형 잠금(서버 action 과 같은 술어).
      getPlanSaleRecords(coursePlanIds),
    ]);
  // 폼에는 잠금 여부만 싣는다(집계 수치는 강의개설 목록의 몫).
  const formatLocked: Record<string, boolean> = {};
  for (const id of coursePlanIds) formatLocked[id] = Boolean(saleRecords[id]?.hasRecords);
  // feat-11-013 P3-a — 현장·혼합 유형의 읽기 전용 「현장 일정」 표. lecture_schedules 는 plan_code(text)로
  //   상품을 가리킨다(정식화는 P5). 요청 클라이언트로 충분하다 — 읽기 RLS 가 staff 에게 미공개 행까지 연다.
  const courseCodes = lecturePlans.map((p) => p.code);
  const schedulesByPlanCode: Record<string, PlanScheduleSummary[]> = {};
  if (courseCodes.length > 0) {
    const { data: scheduleRows } = await client
      .from("lecture_schedules")
      .select(
        "schedule_id, plan_code, title, format, start_date, day_label, time_label, capacity, enrolled, status, published",
      )
      .in("plan_code", courseCodes)
      .is("deleted_at", null)
      .order("start_date", { ascending: true, nullsFirst: false });
    for (const s of scheduleRows ?? []) {
      if (!s.plan_code) continue;
      (schedulesByPlanCode[s.plan_code] ??= []).push({
        scheduleId: s.schedule_id,
        title: s.title,
        format: s.format,
        startDate: s.start_date,
        dayLabel: s.day_label,
        timeLabel: s.time_label,
        capacity: s.capacity,
        enrolled: s.enrolled,
        status: s.status,
        published: s.published,
      });
    }
  }
  return {
    plans,
    policies,
    courseLinks,
    editions,
    bookLinks,
    books,
    categoryOptions,
    formatLocked,
    schedulesByPlanCode,
    role,
  };
}

/** 현장 일정 요약(읽기 전용 표). 편집은 /admin/lecture-schedules 에서. */
type PlanScheduleSummary = {
  scheduleId: string;
  title: string;
  format: string;
  startDate: string | null;
  dayLabel: string | null;
  timeLabel: string | null;
  capacity: number;
  enrolled: number;
  status: string;
  published: boolean;
};

const SALE_STATUS_TONE: Record<
  SaleStatus,
  "emerald" | "blue" | "amber" | "coral" | "outline"
> = {
  on_sale: "emerald",
  scheduled: "blue",
  paused: "amber",
  closed: "coral",
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
  const {
    plans,
    policies,
    courseLinks,
    editions,
    bookLinks,
    books,
    categoryOptions,
    formatLocked,
    schedulesByPlanCode,
    role,
  } = loaderData;
  const [adding, setAdding] = useState(false);
  // 강의개설 목록의 "강의수정" 에서 ?plan=<planId> 로 들어오면 그 행을 바로 펼친다
  // (원장 요청 2026-08-20 — 목록을 다시 훑지 않게).
  const [params] = useSearchParams();
  const focusPlanId = params.get("plan");
  const coursePlans = plans
    .filter((p) => isLectureProductKind(p.productKind))
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
            linkedBooks={[]}
            categoryOptions={categoryOptions}
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
            linkedBooks={bookLinks[p.planId] ?? []}
            categoryOptions={categoryOptions}
            formatLocked={formatLocked[p.planId] ?? false}
            schedules={schedulesByPlanCode[p.code] ?? []}
            autoOpen={focusPlanId === p.planId}
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
  linkedBooks,
  categoryOptions,
  formatLocked = false,
  schedules = [],
  autoOpen = false,
}: {
  plan: SubscriptionPlan;
  policy?: PlanPolicy;
  coursePlans: CoursePlanRef[];
  editions: CourseEditionRef[];
  linkedCourseIds: string[];
  books: BookPickerItem[];
  linkedBooks: PlanBookLink[];
  categoryOptions: Array<{ categoryId: string; label: string }>;
  /** feat-11-013 P2 — 신청내역이 있어 과정 유형을 바꿀 수 없는 상품. */
  formatLocked?: boolean;
  /** feat-11-013 P3-a — 이 상품 코드로 연결된 현장 일정(읽기 전용). */
  schedules?: PlanScheduleSummary[];
  /** ?plan= 딥링크 대상이면 펼친 상태로 시작하고 화면에 보이도록 스크롤한다. */
  autoOpen?: boolean;
}) {
  const [editing, setEditing] = useState(autoOpen);
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!autoOpen) return;
    rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [autoOpen]);
  return (
    <>
      <TR>
        <TD mono soft>
          {plan.code}
        </TD>
        <TD>
          <span className="font-medium">{plan.name}</span>
        </TD>
        <TD soft>
          {PRODUCT_KIND_LABEL[plan.productKind] ?? plan.productKind}
          {plan.courseFormat ? (
            <span className="text-muted-foreground/80 block text-[11px]">
              {COURSE_FORMAT_LABEL[plan.courseFormat]}
            </span>
          ) : null}
        </TD>
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
        <tr ref={rowRef} className="border-border/60 border-b last:border-0">
          <td colSpan={7} className="p-3">
            <PlanForm
              mode="update"
              plan={plan}
              policy={policy}
              coursePlans={coursePlans}
              editions={editions}
              linkedCourseIds={linkedCourseIds}
              books={books}
              linkedBooks={linkedBooks}
              categoryOptions={categoryOptions}
              formatLocked={formatLocked}
              schedules={schedules}
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
  linkedBooks,
  categoryOptions,
  formatLocked = false,
  schedules = [],
  onClose,
}: {
  mode: "create" | "update";
  plan?: SubscriptionPlan;
  policy?: PlanPolicy;
  coursePlans: CoursePlanRef[];
  editions: CourseEditionRef[];
  linkedCourseIds: string[];
  books: BookPickerItem[];
  linkedBooks: PlanBookLink[];
  categoryOptions: Array<{ categoryId: string; label: string }>;
  formatLocked?: boolean;
  schedules?: PlanScheduleSummary[];
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
  const showPolicy = isLectureProductKind(productKind);
  // feat-11-013 P2 — 과정 유형. 라디오는 표시용, 실제 전송은 hidden 한 칸(조건부 블록이 언마운트돼도
  // 값이 실린다). 잠금(신청내역 있음)이면 라디오를 비활성화하고 저장값을 그대로 보낸다.
  const [courseFormat, setCourseFormat] = useState<CourseFormat | null>(
    plan?.courseFormat ?? null,
  );
  // feat-11-013 P3-a — 유형별 조건부 노출 규칙(서버 action 과 같은 SSOT). 유형 미선택이면 null.
  const rules = showPolicy && courseFormat ? courseFormatFormRules(courseFormat) : null;
  const [detailKind, setDetailKind] = useState<
    "none" | "image" | "html" | "sections"
  >(
    // feat-11-008 P5 — 섹션(9영역) 저장분이 있으면 섹션 모드 우선.
    hasAnyDetailSection(plan?.detailSections ?? {})
      ? "sections"
      : plan?.detailImageUrl
        ? "image"
        : plan?.detailHtml
          ? "html"
          : "none",
  );
  const [sectionTab, setSectionTab] = useState<DetailSectionKey>(
    DETAIL_SECTIONS[0].key,
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
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
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
        {/* 과정 유형 — 요청서 §2 1단계: 유형을 먼저 고르면 필요한 항목만 아래에 나타난다. */}
        {showPolicy ? (
          <fieldset className="border-border bg-muted/30 space-y-1.5 rounded-lg border border-dashed p-3 sm:col-span-2">
            <legend className="text-muted-foreground px-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
              과정 유형 *
            </legend>
            <p className="text-muted-foreground/70 text-[11px]">
              상품의 운영 방식입니다. 수강권 생성·기간 계산·정원·환불 계산이 이 값을 기준으로
              움직입니다. {formatLocked
                ? "신청내역(주문·수강생)이 있어 바꿀 수 없습니다 — 판매중지 후 강의개설 목록의 [복사]로 새 유형 상품을 만드세요."
                : "주문이나 수강생이 생긴 뒤에는 바꿀 수 없습니다."}
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {COURSE_FORMATS.map((f) => (
                <label
                  key={f}
                  className={
                    "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors " +
                    (courseFormat === f
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50") +
                    (formatLocked ? " cursor-not-allowed opacity-70" : "")
                  }
                >
                  <input
                    type="radio"
                    name="courseFormatRadio"
                    value={f}
                    checked={courseFormat === f}
                    disabled={formatLocked}
                    onChange={() => setCourseFormat(f)}
                    className="mt-0.5 size-3.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{COURSE_FORMAT_LABEL[f]}</span>
                    <span className="text-muted-foreground/80 block text-[10px] leading-snug">
                      {COURSE_FORMAT_DESCRIPTION[f]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {rules ? (
              <p className="text-foreground/80 text-[11px]">{rules.hint}</p>
            ) : (
              <p className="text-amber-700 dark:text-amber-300 text-[11px]">
                과정 유형을 먼저 선택하면 필요한 항목만 나타납니다.
              </p>
            )}
          </fieldset>
        ) : null}
        <FormField label="판매가 (원)">
          <Input
            name="priceKrw"
            type="number"
            min={0}
            required
            defaultValue={plan?.priceKrw ?? 0}
            className="h-8 text-xs"
          />
        </FormField>
        <FormField label="정상가 (원, 선택)">
          <Input
            name="listPriceKrw"
            type="number"
            min={0}
            placeholder="비우면 할인 표시 없음"
            defaultValue={plan?.listPriceKrw ?? ""}
            className="h-8 text-xs"
          />
          <p className="text-muted-foreground mt-1 text-[11px]">
            판매가보다 크게 넣으면 카탈로그·상세에 취소선과 할인율이 함께 표시됩니다.
          </p>
        </FormField>
        {/* 전체 예정 회차 — 유형 규칙: 온라인 상시 필수 · 상시 패키지/혼합 선택 · 정규/현장 숨김(서버가 null 강제).
            정규 유형에 회차를 노출하면 refundCalcTypeOf 가 기간제 계산을 단과(회차) 계산으로 바꾼다. */}
        {rules && rules.plannedSessions !== "hidden" ? (
          <FormField
            label={
              rules.plannedSessions === "required"
                ? "전체 예정 회차 *"
                : "전체 예정 회차 (선택)"
            }
          >
            <Input
              name="plannedSessions"
              type="number"
              min={1}
              required={rules.plannedSessions === "required"}
              placeholder={
                rules.plannedSessions === "required"
                  ? "환불 회차 공제의 분모"
                  : "비우면 회차 기준 공제 없음"
              }
              defaultValue={plan?.plannedSessions ?? ""}
              className="h-8 text-xs"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              환불 공제의 <strong>회차 기준 분모</strong>입니다(요청서 11-8). 현재 등록된 회차
              수가 아니라 <strong>판매할 때 안내한 예정 회차</strong>를 넣어 주세요 — 미종강
              강의는 이 값으로 계산해야 학생에게 불리해지지 않습니다.
              {rules.plannedSessions === "optional"
                ? " 비우면 이용일수 기준만 적용합니다."
                : ""}
            </p>
          </FormField>
        ) : null}
        {/* 이용 기간 — 학습 구독 지급 일수. 강의상품은 숨긴다(D2: 권위는 수강 정책의 수강기간,
            서버가 정책 일수로 동기화해 두 컬럼 드리프트를 없앤다). */}
        {!showPolicy ? (
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
        ) : null}
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
        {/* feat-11-013 P3-b — 판매 종료일. 정규 유형(종료일 고정)만 렌더(서버도 termFields 가 아니면 null 강제). */}
        {rules?.termFields ? (
          <FormField label="판매 종료일 (선택)">
            <Input
              name="availableUntil"
              type="datetime-local"
              defaultValue={isoToLocalInput(plan?.availableUntil ?? null)}
              className="h-8 text-xs"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              지나면 카탈로그에서 숨기고 결제를 거절합니다.
            </p>
          </FormField>
        ) : null}
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

      {/* 과정 유형 값은 hidden 한 칸으로 항상 전송(조건부 블록이 언마운트돼도 실린다). 라디오는 위 fieldset. */}
      <input type="hidden" name="courseFormat" value={courseFormat ?? ""} />

      {rules?.showCourses ? (
        <div className="border-border bg-muted/30 space-y-1.5 rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
            {rules.coursesLabel}
          </p>
          <p className="text-muted-foreground/70 text-[11px]">
            {productKind === "tpass"
              ? "T-PASS 는 보통 여러 에디션을 포함합니다."
              : "단과 상품은 보통 1개 에디션을 연결합니다."}{" "}
            결제 시 연결된 강의의 수강권이 지급됩니다. 판매중으로 저장하려면 1개 이상 연결해야
            합니다.
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

      {rules?.showSchedules ? (
        <PlanSchedulesBlock mode={mode} planCode={plan?.code ?? null} schedules={schedules} />
      ) : null}

      {rules ? (
        <BookLinksEditor books={books} value={linkedBooks} />
      ) : null}

      {rules ? (
        <FormField label="강의 카테고리">
          {/* feat-11-008 P3 — 관리자 등록 카테고리(course_categories) 선택. 구 enum 값은
              매출 통계 축 호환을 위해 hidden 으로 보존(쓰기 중단·덮어쓰기 방지). */}
          <input
            type="hidden"
            name="lectureCategory"
            value={plan?.lectureCategory ?? ""}
          />
          <select
            name="categoryId"
            defaultValue={plan?.categoryId ?? ""}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs sm:w-56"
          >
            <option value="">미분류 (전체 탭에만 노출)</option>
            {categoryOptions.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground/70 text-[10px]">
            수강신청(/lecture/catalog) 카테고리 탭 분류입니다. 카테고리는 운영·시스템 {'>'}
            강의 카테고리에서 관리합니다.
          </span>
        </FormField>
      ) : null}

      {rules ? (
        <div className="border-border bg-muted/30 space-y-2 rounded-lg border border-dashed p-3">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
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
                ["sections", "섹션별 작성"],
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
                <ImageUploadHint
                  size="가로 800px 내외"
                  note="세로 길이 제한 없음, 상세페이지 폭에 맞춰 표시"
                  maxMb={8}
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
              <HtmlEditor
                name="detailHtml"
                defaultValue={plan?.detailHtml ?? ""}
                uploadUrl="/api/lms/editor-image"
              />
            </FormField>
          ) : detailKind === "sections" ? (
            // feat-11-008 P5 — 9개 입력 영역을 탭으로 전환하며 각각 통합 에디터로 작성.
            //   숨긴 탭도 DOM 에 유지해야 폼 제출 시 함께 전송된다(값 유실 방지).
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {DETAIL_SECTIONS.map((sec) => {
                  const filled = Boolean(plan?.detailSections?.[sec.key]);
                  return (
                    <button
                      key={sec.key}
                      type="button"
                      onClick={() => setSectionTab(sec.key)}
                      className={
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors " +
                        (sectionTab === sec.key
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:text-foreground")
                      }
                    >
                      {sec.label}
                      {filled ? " ●" : ""}
                    </button>
                  );
                })}
              </div>
              {DETAIL_SECTIONS.map((sec) => (
                <div
                  key={sec.key}
                  className={sectionTab === sec.key ? "" : "hidden"}
                >
                  <HtmlEditor
                    name={`section_${sec.key}`}
                    defaultValue={plan?.detailSections?.[sec.key] ?? ""}
                    uploadUrl="/api/lms/editor-image"
                    minHeight={260}
                  />
                </div>
              ))}
              <p className="text-muted-foreground/70 text-[11px]">
                작성한 섹션만 상세페이지에 순서대로 표시됩니다. 강의명·가격 등 한 줄 항목은
                위 기본 정보에서 입력합니다.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 수강 정책 — 온라인 수강권이 나가는 유형만(현장은 정책 행을 만들지 않는다). */}
      {rules?.showOnlinePolicy ? (
        <PlanPolicyFields
          policy={policy}
          coursePlans={coursePlans}
          currentPlanId={plan?.planId}
          durationMode={rules.durationMode}
          termFields={rules.termFields}
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

// feat-11-013 P3-a — 현장·혼합 유형의 「현장 일정」. ★읽기 전용이다: 정원·접수기간·출결 입력칸은
//   두지 않는다(저장되지 않는 칸 = 반쪽 열림). 일정의 편집·연결(plan_code)은 강의 일정 화면에서 한다.
const SCHEDULES_PATH = "/admin/lecture-schedules";

function PlanSchedulesBlock({
  mode,
  planCode,
  schedules,
}: {
  mode: "create" | "update";
  planCode: string | null;
  schedules: PlanScheduleSummary[];
}) {
  return (
    <div className="border-border bg-muted/30 space-y-1.5 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
          현장 일정
        </p>
        <Link
          to={SCHEDULES_PATH}
          className="text-link text-[11px] underline-offset-2 hover:underline"
        >
          강의 일정 관리 →
        </Link>
      </div>
      {mode === "create" ? (
        <p className="text-muted-foreground/70 text-[11px]">
          저장 후 강의 일정에서 상품 코드로 연결합니다. 강의실·모집 정원·접수기간·출결은
          현장강의 단계에서 추가됩니다.
        </p>
      ) : schedules.length === 0 ? (
        <p className="text-muted-foreground/70 text-[11px]">
          연결된 현장 일정이 없습니다 — 강의 일정에서 이 상품 코드
          {planCode ? ` (${planCode})` : ""}를 연결하세요.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground border-border border-b text-left">
                <th className="py-1 pr-2 font-semibold">일정</th>
                <th className="py-1 pr-2 font-semibold">형태</th>
                <th className="py-1 pr-2 font-semibold">개강일</th>
                <th className="py-1 pr-2 font-semibold">요일·시간</th>
                <th className="py-1 pr-2 text-right font-semibold">정원(표시값)</th>
                <th className="py-1 pr-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr key={s.scheduleId} className="border-border/60 border-b last:border-0">
                  <td className="py-1 pr-2">
                    <Link
                      to={`${SCHEDULES_PATH}/${s.scheduleId}/edit`}
                      className="text-link underline-offset-2 hover:underline"
                    >
                      {s.title}
                    </Link>
                    {!s.published ? (
                      <span className="text-muted-foreground/60 ml-1">(비공개)</span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-2">
                    {SCHEDULE_FORMAT_LABEL[s.format as LectureFormat] ?? s.format}
                  </td>
                  <td className="py-1 pr-2">{s.startDate ?? "-"}</td>
                  <td className="py-1 pr-2">
                    {[s.dayLabel, s.timeLabel].filter(Boolean).join(" ") || "-"}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {s.enrolled}/{s.capacity}
                  </td>
                  <td className="py-1 pr-2">
                    {SCHEDULE_STATUS_LABEL[s.status as ScheduleStatus] ?? s.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground/70 mt-1 text-[10px]">
            정원·신청 인원은 현재 표시값입니다(판매 제한 아님 — 좌석 권위화는 현장강의 단계).
          </p>
        </div>
      )}
    </div>
  );
}
