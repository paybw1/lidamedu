// 상품(플랜) 생성·수정 — feat-8-028 Stage B. manager+ 전용.
import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  COURSE_FORMATS,
  COURSE_FORMAT_LABEL,
  type CourseFormat,
  MID_ENTRY_MODES,
  courseFormatFormRules,
  isFormatAllowedForKind,
  toCourseFormat,
} from "~/features/lms/lib/course-format";
import { DETAIL_SECTIONS } from "~/features/lms/lib/detail-sections";
import {
  FEATURE_LABEL,
  PRODUCT_KIND_LABEL,
  type ProductKind,
  isLectureProductKind,
} from "~/features/subscriptions/labels";
import { applyHiddenPolicyGroups } from "~/features/subscriptions/lib/plan-policy-groups";
import {
  type PlanPolicy,
  copyPlan,
  getPlanPolicies,
  getPlanSaleRecords,
  syncPlanBookLinks,
  syncPlanCourses,
  upsertPlan,
  upsertPlanPolicy,
} from "~/features/subscriptions/queries.server";
import { LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-plan";

const SUBJECT_SLUGS = new Set<string>([...LAW_SUBJECT_SLUGS, "science"]);
const FEATURE_KEYS = new Set<string>(Object.keys(FEATURE_LABEL));

const toIso = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ★달력 왕복 검증 — `new Date(v)` 의 NaN 검사만으로는 2026-02-31 이 03-03 으로 롤오버돼 통과하고,
//   DB(date 컬럼)가 22008 로 거절해 upsertPlan 뒤에서 실패한다(생성 모드 고아 행).
//   fixedEndDate(종료일)·startsOn(수강 시작일, P3-b) 이 함께 쓴다.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    // ★2026-13-01 처럼 월·일 범위 밖은 롤오버가 아니라 Invalid Date 라 toISOString 이 throw → NaN 먼저 거른다.
    const d = new Date(v + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "존재하지 않는 날짜입니다.");

// 강의 수강 정책(course/tpass 전용) — plan_policies. durationMode 로 수강기간 방식 분기.
// ★배수(multiplier)는 수강기간 방식이 아니라 독립 축이다 — 어느 방식이든 함께 지정한다.
//   무제한은 null. DB check 가 multiplier >= 1 이라 하한을 1 로 둔다(0 이면 저장 실패).
// ★미전송 칸은 false·0·null(무제한/기본값)로 파싱된다. 유형 규칙(policyGroups)이 숨긴 그룹의 칸은 이 값을 쓰지 않고
//   쓰기 직전에 applyHiddenPolicyGroups 가 기존 행/DDL 기본값으로 되돌린다(feat-11-015 P3-c).
const policySchema = z.object({
  durationMode: z.enum(["days", "fixed"]),
  multiplier: z.coerce.number().min(1).max(100).nullable(),
  // DB check 가 duration_days > 0 이라 하한은 1.
  durationDays: z.coerce.number().int().min(1).max(3650).nullable(),
  fixedEndDate: calendarDate.nullable(),
  // feat-11-013 P3-b — 정규 기간 칸(rules.termFields 일 때만 값, 그 밖은 action 이 null 로 강제).
  startsOn: calendarDate.nullable(),
  midEntryMode: z.enum(MID_ENTRY_MODES).nullable(),
  // 일수 검증(≥1)은 mode 가 fixed_days 일 때 아래에서 별도 문구로 한다 — 여기서는 형식만.
  midEntryDays: z
    .union([z.literal(""), z.coerce.number().int().max(3650)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  allowDownload: z.boolean(),
  allowPc: z.boolean(),
  allowMobile: z.boolean(),
  // feat-11-011 P7 — 기기 수 입력란은 폼에서 뺐다(요청서 §4.1 — 기기 허용은 콜러스 정책 단독).
  //   ★nullish 로 두지 않으면 폼이 보내지 않는 값을 0 으로 코어스해 저장된 정책을 덮는다.
  maxDevicesPc: z.coerce.number().int().min(0).max(20).nullish(),
  maxDevicesMobile: z.coerce.number().int().min(0).max(20).nullish(),
  pauseAllowed: z.boolean(),
  pauseMaxCount: z.coerce.number().int().min(0).max(50),
  pauseMinDays: z.coerce.number().int().min(0).max(365),
  pauseMaxDays: z.coerce.number().int().min(0).max(3650),
  pauseTotalDays: z.coerce.number().int().min(0).max(3650),
  // feat-11-010 — "" = 기본값(app_settings)을 따른다. 값이 있으면 이 강의만의 설정.
  //   ★boolean 이 아니라 3-상태다: "" (기본값) / "1" (허용) / "0" (불허).
  extensionAllowed: z
    .enum(["", "1", "0"])
    .transform((v) => (v === "" ? null : v === "1")),
  extensionPlanIds: z.array(z.string()),
  extensionPriceKrw: z.union([z.literal(""), z.coerce.number().int().min(0).max(100_000_000)]).transform((v) => (v === "" ? null : v)),
  extensionMaxCount: z.union([z.literal(""), z.coerce.number().int().min(0).max(100)]).transform((v) => (v === "" ? null : v)),
  extensionDays: z.union([z.literal(""), z.coerce.number().int().min(0).max(3650)]).transform((v) => (v === "" ? null : v)),
});

const schema = z.object({
  intent: z.enum(["create", "update"]),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, "영소문자·숫자·_ 만 사용")
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  priceKrw: z.coerce.number().int().min(0).max(100_000_000),
  // 정상가 — 비우면 할인 표시 없음. 판매가 미만이면 DB 제약에 걸리므로 여기서 먼저 막는다.
  listPriceKrw: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(100_000_000)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  // 전체 예정 회차(T) — 환불의 회차 기준 공제 분모(요청서 11-8). 비우면 회차 기준을 쓰지 않는다.
  plannedSessions: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(1000)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  // 이용 기간(학습 구독 지급 일수). ★강의상품은 폼이 보내지 않는다 — 권위가 plan_policies 라(D2)
  //   서버가 정책 일수로 동기화한다(아래). 빈 값을 0 으로 코어스하면 깨진 폼이 조용히 통과하므로 명시.
  durationDays: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(3650)])
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  productKind: z.enum(["subject", "bundle", "membership", "course", "tpass"]),
  availableFrom: z.string().datetime().nullable(),
  // feat-11-013 P3-b — 판매 종료일. 정규 유형(rules.termFields)만, 그 밖은 아래에서 null 로 강제.
  availableUntil: z.string().datetime().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(9999),
  saleStatus: z.enum(["scheduled", "on_sale", "paused", "closed", "hidden"]),
  // 강의 카탈로그 분류(강의 플랫폼 course/tpass 상품에만 의미). 미분류=null.
  lectureCategory: z
    .enum(["round1", "round2", "package", "onsite"])
    .nullable(),
  // feat-11-013 P2 — 과정 유형. 강의상품(course/tpass)은 필수(아래에서 검사), 그 밖은 null 로 강제.
  courseFormat: z.enum(COURSE_FORMATS).nullable(),
  // feat-11-008 P3 — 강의 카테고리 테이블(course_categories) 연결. 미선택=null.
  categoryId: z.string().uuid().nullable(),
});

// feat-11-015 L2 — 종류(product_kind) ↔ 과정 유형 결합 규칙 위반 문구. 규칙 문장(KIND_FORMAT_RULE)은 한 벌이고
//   앞머리만 경로별로 다르다 — 생성·수정은 폼에 종류 select 가 있어 「선택한 종류」로, 복사는 대화상자에 종류 칸이
//   없고 원본 종류를 그대로 물려받으므로 원본 종류·고른 유형을 이름으로 밝힌다.
//   라벨은 화면(admin-plans 종류 select · COURSE_FORMAT_LABEL)과 맞춘다: 강의 / T-PASS · 정규 패키지 / 상시 패키지.
const KIND_FORMAT_RULE =
  "패키지 유형(정규 패키지·상시 패키지)은 T-PASS 종류에서만, 그 밖의 유형은 강의 종류에서만 저장할 수 있습니다.";
const KIND_FORMAT_MISMATCH_ERROR = `선택한 종류에는 이 과정 유형을 쓸 수 없습니다. ${KIND_FORMAT_RULE}`;

/** DB `product_kind`(string)를 화면 라벨로. 라벨 사전은 ProductKind 키라 string 은 guard 후 조회, 미등록 값은 원문. */
function productKindLabel(kind: string): string {
  return kind in PRODUCT_KIND_LABEL
    ? PRODUCT_KIND_LABEL[kind as ProductKind]
    : kind;
}

/** 복사 경로 전용 — 조사는 「종류」「유형」에 붙여 라벨의 받침(은/는·을/를)에 흔들리지 않게 한다. */
function copyKindFormatMismatchError(
  sourceKind: string,
  format: CourseFormat,
): string {
  return `복사본은 원본 상품의 종류(${productKindLabel(sourceKind)})를 그대로 물려받아, 이 종류에서는 「${COURSE_FORMAT_LABEL[format]}」 유형을 쓸 수 없습니다. ${KIND_FORMAT_RULE}`;
}

// feat-11-013 P2-D7 — 상품 복사. 기본정보·강의 구성은 복사, 가격·정책은 선택, 주문·수강생은 절대 아님.
const copySchema = z.object({
  sourcePlanId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, "영소문자·숫자·_ 만 사용")
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(100),
  courseFormat: z.enum(COURSE_FORMATS).nullable(),
  copyPrice: z.boolean(),
  copyPolicy: z.boolean(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role || !roleAtLeast(role, "manager")) {
    return data({ error: "Forbidden — manager 이상" }, { status: 403 });
  }

  const fd = await request.formData();

  // ── 복사(intent=copy) — 판매중지 → 복사 → 새 유형 등록 흐름(요청서 §5) ──
  if (String(fd.get("intent") ?? "") === "copy") {
    const cp = copySchema.safeParse({
      sourcePlanId: fd.get("sourcePlanId"),
      code: fd.get("code"),
      name: fd.get("name"),
      courseFormat: toCourseFormat(fd.get("courseFormat")),
      copyPrice: fd.get("copyPrice") === "1",
      copyPolicy: fd.get("copyPolicy") === "1",
    });
    if (!cp.success) {
      return data(
        { error: cp.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    }
    // feat-11-015 L2 — 복사본은 원본의 종류(product_kind)를 그대로 물려받는데 복사 대화상자는 6유형을 전부
    //   고르게 하므로, 새 유형이 원본 종류와 결합 규칙에 어긋나면 여기서 거절한다(copyPlan 앞 — 행이 생기기 전).
    //   courseFormat=null 은 원본 유형 유지라 검사하지 않는다(원본이 규칙 안이면 복사본도 안). 강의상품이 아닌
    //   원본은 copyPlan 이 유형을 null 로 버리므로 역시 검사하지 않는다.
    //   ★대화상자(plan-copy-dialog)는 productKind prop 이 없어 allowedFormatsForKind 로 선택지를 줄이지 못한다 —
    //     그래서 문구가 원본 종류를 이름으로 밝힌다. 선택지 제한은 해당 컴포넌트 소유 갈래의 후속 작업.
    if (cp.data.courseFormat) {
      const { data: src, error: srcErr } = await adminClient
        .from("subscription_plans")
        .select("product_kind")
        .eq("plan_id", cp.data.sourcePlanId)
        .maybeSingle();
      if (srcErr) return data({ error: srcErr.message }, { status: 400 });
      if (
        src &&
        isLectureProductKind(src.product_kind) &&
        !isFormatAllowedForKind(src.product_kind, cp.data.courseFormat)
      ) {
        return data(
          {
            error: copyKindFormatMismatchError(
              src.product_kind,
              cp.data.courseFormat,
            ),
          },
          { status: 400 },
        );
      }
    }
    const copied = await copyPlan(cp.data);
    if (!copied.ok) return data({ error: copied.error }, { status: 400 });
    await logAuditEvent({
      actorId: user.id,
      actorRole: role,
      action: "plan.copy",
      entityType: "subscription_plan",
      entityId: cp.data.code,
      metadata: {
        sourcePlanId: cp.data.sourcePlanId,
        courseFormat: cp.data.courseFormat,
        copyPrice: cp.data.copyPrice,
        copyPolicy: cp.data.copyPolicy,
      },
    });
    return data({ ok: true, planId: copied.planId });
  }

  const parsed = schema.safeParse({
    intent: fd.get("intent"),
    code: fd.get("code"),
    name: fd.get("name"),
    description: (() => {
      const s = String(fd.get("description") ?? "").trim();
      return s === "" ? null : s;
    })(),
    priceKrw: fd.get("priceKrw"),
    listPriceKrw: fd.get("listPriceKrw") ?? "",
    plannedSessions: fd.get("plannedSessions") ?? "",
    durationDays: fd.get("durationDays") ?? "",
    productKind: fd.get("productKind"),
    availableFrom: toIso(fd.get("availableFrom")),
    availableUntil: toIso(fd.get("availableUntil")),
    displayOrder: fd.get("displayOrder"),
    saleStatus: fd.get("saleStatus"),
    lectureCategory: (() => {
      const s = String(fd.get("lectureCategory") ?? "").trim();
      return s === "" ? null : s;
    })(),
    courseFormat: toCourseFormat(fd.get("courseFormat")),
    categoryId: (() => {
      const s = String(fd.get("categoryId") ?? "").trim();
      return s === "" ? null : s;
    })(),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }

  // ── 과정 유형(feat-11-013 P2) — 강의상품은 필수, 그 밖은 null. 신청내역이 있으면 변경 불가(§5). ──
  const isLecture = isLectureProductKind(parsed.data.productKind);
  const courseFormat = isLecture ? parsed.data.courseFormat : null;
  if (isLecture && !courseFormat) {
    return data({ error: "과정 유형을 선택하세요." }, { status: 400 });
  }
  // ── feat-11-015 L2 — 종류 ↔ 유형 결합(패키지 유형 ⇔ tpass, 그 밖 ⇔ course). 폼이 라디오를 같은 규칙으로
  //   제한하지만 낡은 탭·직접 POST 를 믿지 않는다. 어긋난 채 저장되면 일시정지 resolver(course_format 축)와
  //   유료 연장 게이트(product_kind 축)가 서로 다른 답을 낸다.
  //   ★update 도 같은 검사를 받으므로 기존 저장값이 규칙에 어긋나는 상품은 수정 자체가 거절된다 — 운영 실측
  //     (2026-09-17) 조합 분포는 course→online_always 3건 · tpass→package_always 1건뿐이라 거절되는 기존 행은 없다.
  if (
    isLecture &&
    courseFormat &&
    !isFormatAllowedForKind(parsed.data.productKind, courseFormat)
  ) {
    return data({ error: KIND_FORMAT_MISMATCH_ERROR }, { status: 400 });
  }
  if (parsed.data.intent === "update") {
    const { data: current } = await adminClient
      .from("subscription_plans")
      .select("plan_id, course_format, product_kind")
      .eq("code", parsed.data.code)
      .maybeSingle();
    if (
      current &&
      isLectureProductKind(current.product_kind) &&
      current.course_format &&
      current.course_format !== courseFormat
    ) {
      const records = (await getPlanSaleRecords([current.plan_id]))[current.plan_id];
      if (records?.hasRecords) {
        return data(
          {
            error:
              "신청내역이 있는 상품은 과정 유형을 변경할 수 없습니다. 판매중지 후 복사해 새 유형으로 등록해 주세요.",
          },
          { status: 400 },
        );
      }
    }
  }

  // 부여 과목·기능은 다중 체크박스 → 알려진 값만 허용.
  const subjectCodes = fd
    .getAll("subjectCodes")
    .map(String)
    .filter((s) => SUBJECT_SLUGS.has(s));
  const features = fd
    .getAll("features")
    .map(String)
    .filter((s) => FEATURE_KEYS.has(s));

  // 수강신청 상세 본문(이미지 또는 HTML) — 히어로 배너와 동일 방식.
  //   detailKind: none=미사용 / image=이미지(업로드 또는 URL) / html=직접 HTML.
  const detailKind = String(fd.get("detailKind") ?? "none");
  let detailImageUrl: string | null = null;
  let detailHtml: string | null = null;
  if (detailKind === "image") {
    const urlText = String(fd.get("detailImageUrl") ?? "").trim();
    detailImageUrl = urlText === "" ? null : urlText;
    const file = fd.get("detailImageFile");
    if (file instanceof File && file.size > 0) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `product-details/${randomUUID()}.${ext}`;
      const { error: upErr } = await adminClient.storage
        .from("landing-banners")
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        return data(
          { error: `이미지 업로드 실패: ${upErr.message}` },
          { status: 400 },
        );
      }
      detailImageUrl = adminClient.storage
        .from("landing-banners")
        .getPublicUrl(path).data.publicUrl;
    }
  } else if (detailKind === "html") {
    const htmlText = String(fd.get("detailHtml") ?? "").trim();
    detailHtml = htmlText === "" ? null : htmlText;
  }
  // feat-11-008 P5 — 섹션(9영역) 수집. 섹션 모드일 때만 저장(다른 모드 선택 시 비운다).
  const detailSections: Record<string, string> = {};
  if (detailKind === "sections") {
    for (const sec of DETAIL_SECTIONS) {
      const html = String(fd.get(`section_${sec.key}`) ?? "").trim();
      if (html) detailSections[sec.key] = html;
    }
  }

  // 정상가는 판매가 이상이어야 한다(취소선 표시가 의미를 가지려면 정상가 ≥ 판매가). DB 제약과 동일.
  if (
    parsed.data.listPriceKrw != null &&
    parsed.data.listPriceKrw < parsed.data.priceKrw
  ) {
    return data(
      { error: "정상가는 판매가보다 작을 수 없습니다." },
      { status: 400 },
    );
  }

  // ── feat-11-013 P3-a — 유형별 규칙은 폼과 같은 SSOT 로 판정한다(유형 리스트 재하드코딩 금지).
  //   ★검증을 전부 끝낸 뒤에 쓴다 — upsertPlan 뒤에서 400 이 나면 생성 모드는 정책 없는 상품 행이,
  //   수정 모드는 절반만 바뀐 상태가 남는다.
  const rules = courseFormat ? courseFormatFormRules(courseFormat) : null;

  // 전체 예정 회차 — hidden 유형은 서버가 null 로 강제(폼이 안 보냈다고 믿지 않는다: 낡은 탭·직접 POST).
  //   required(온라인 상시)는 환불 회차 공제의 분모라 비우면 저장을 거절한다(요청서 11-8).
  let plannedSessions: number | null = parsed.data.plannedSessions;
  if (rules) {
    if (rules.plannedSessions === "hidden") plannedSessions = null;
    else if (rules.plannedSessions === "required" && plannedSessions == null) {
      return data(
        {
          error:
            "온라인 상시 강의는 전체 예정 회차를 입력하세요(환불 회차 공제의 분모입니다).",
        },
        { status: 400 },
      );
    }
  }

  // 수강 정책(course/tpass 중 온라인 수강권이 나가는 유형만) — 파싱만 먼저, 쓰기는 upsertPlan 뒤.
  //   durationMode 는 rules 가 고정하면(상시=days · 정규=fixed) 폼 값을 **덮어쓴다**(서버 권위).
  let policy: z.infer<typeof policySchema> | null = null;
  if (rules?.showOnlinePolicy) {
    const durationMode =
      rules.durationMode === "any"
        ? String(fd.get("policy_durationMode") ?? "days")
        : rules.durationMode;
    // 배수 — 프리셋 라디오(무제한/1/1.5/2/3/직접입력)에서 값을 정한다.
    const mulChoice = String(fd.get("policy_multiplierChoice") ?? "unlimited");
    const multiplier =
      mulChoice === "unlimited"
        ? null
        : mulChoice === "custom"
          ? fd.get("policy_multiplier")
          : mulChoice;
    const policyParsed = policySchema.safeParse({
      durationMode,
      multiplier,
      durationDays:
        durationMode === "days" ? fd.get("policy_durationDays") : null,
      fixedEndDate:
        durationMode === "fixed"
          ? String(fd.get("policy_fixedEndDate") ?? "").trim() || null
          : null,
      // P3-b 정규 기간 칸 — termFields 가 아니면 폼이 보냈어도 null(낡은 탭·직접 POST 를 믿지 않는다).
      startsOn: rules.termFields
        ? String(fd.get("policy_startsOn") ?? "").trim() || null
        : null,
      midEntryMode: rules.termFields
        ? String(fd.get("policy_midEntryMode") ?? "").trim() || null
        : null,
      midEntryDays: rules.termFields
        ? String(fd.get("policy_midEntryDays") ?? "").trim()
        : "",
      allowDownload: fd.get("policy_allowDownload") === "1",
      allowPc: fd.get("policy_allowPc") === "1",
      allowMobile: fd.get("policy_allowMobile") === "1",
      maxDevicesPc: fd.get("policy_maxDevicesPc") ?? undefined,
      maxDevicesMobile: fd.get("policy_maxDevicesMobile") ?? undefined,
      pauseAllowed: fd.get("policy_pauseAllowed") === "1",
      pauseMaxCount: fd.get("policy_pauseMaxCount"),
      pauseMinDays: fd.get("policy_pauseMinDays"),
      pauseMaxDays: fd.get("policy_pauseMaxDays"),
      pauseTotalDays: fd.get("policy_pauseTotalDays"),
      extensionAllowed: String(fd.get("policy_extensionAllowed") ?? ""),
      extensionPlanIds: fd.getAll("policy_extensionPlanIds").map(String),
      extensionPriceKrw: String(fd.get("policy_extensionPriceKrw") ?? ""),
      extensionMaxCount: String(fd.get("policy_extensionMaxCount") ?? ""),
      extensionDays: String(fd.get("policy_extensionDays") ?? ""),
    });
    if (!policyParsed.success) {
      return data(
        {
          error:
            "수강 정책 입력 오류: " +
            (policyParsed.error.issues[0]?.message ?? ""),
        },
        { status: 400 },
      );
    }
    policy = policyParsed.data;
    // 수강기간은 일수·종료일 중 하나가 반드시 있어야 한다(DB 제약).
    // 여기서 막지 않으면 DB 제약 문구가 그대로 관리자에게 노출된다.
    if (policy.durationDays == null && policy.fixedEndDate == null) {
      return data(
        {
          error:
            durationMode === "fixed"
              ? "수강 종료일을 입력하세요."
              : "수강기간(일)을 1일 이상 입력하세요.",
        },
        { status: 400 },
      );
    }
    // ── feat-11-013 P3-b — 정규 기간 칸 검증(DB CHECK 문구가 관리자에게 새지 않게 여기서 먼저).
    if (policy.midEntryMode === "fixed_days") {
      if (policy.midEntryDays == null || policy.midEntryDays <= 0) {
        return data(
          { error: "중간 신청 일수를 1일 이상 입력하세요" },
          { status: 400 },
        );
      }
    } else {
      // 방식을 바꾼 뒤 남은 일수가 저장되지 않게 — fixed_days 가 아니면 일수는 의미가 없다.
      policy.midEntryDays = null;
    }
    // ★중간 신청 정책은 「시작일 뒤 결제」의 처리다 — 시작일이 없으면 fixed_days 는 **전원**에게
    //   결제+N일이 되고(카탈로그는 「종료일까지」로 안내), closed 는 isMidEntryClosed 가 항상
    //   false 라 배지만 뜨는 빈 설정이 된다. 둘 다 시작일을 요구한다.
    if (
      policy.midEntryMode != null &&
      policy.midEntryMode !== "until_end" &&
      policy.startsOn == null
    ) {
      return data(
        {
          error:
            "중간 신청 정책(신청일부터 N일·불허)은 수강 시작일이 있어야 합니다. 수강 시작일을 입력하세요.",
        },
        { status: 400 },
      );
    }
    if (
      policy.startsOn != null &&
      policy.fixedEndDate != null &&
      !(policy.startsOn < policy.fixedEndDate) // 둘 다 YYYY-MM-DD 라 사전순 = 날짜순
    ) {
      return data(
        { error: "수강 시작일은 종료일보다 앞서야 합니다" },
        { status: 400 },
      );
    }
  }

  // 판매 종료일 — 정규 유형만. 그 밖(학습 구독·상시·현장·혼합)은 폼 값과 무관하게 null 로 강제한다.
  const availableUntil = rules?.termFields ? parsed.data.availableUntil : null;
  if (
    availableUntil != null &&
    parsed.data.availableFrom != null &&
    !(Date.parse(availableUntil) > Date.parse(parsed.data.availableFrom))
  ) {
    return data(
      { error: "판매 종료일은 오픈일보다 뒤여야 합니다" },
      { status: 400 },
    );
  }

  // 연결 강의(에디션) — showCourses=false(현장)면 폼 값과 무관하게 **빈 배열**로 동기화한다.
  //   온라인→현장으로 바뀐 상품에 plan_courses 가 남으면 결제 시 온라인 수강권이 나간다.
  const courseIds = rules?.showCourses
    ? fd
        .getAll("courseIds")
        .map(String)
        .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    : [];
  // 판매중 저장인데 구성이 비면 거절 — cart-resolve 가 같은 이유로 409 를 내므로 저장 시점에 미리 보여 준다.
  if (rules?.showCourses && parsed.data.saleStatus === "on_sale" && courseIds.length === 0) {
    return data(
      {
        error:
          "판매중으로 저장하려면 연결 강의가 1개 이상 필요합니다. 구성이 빈 상품은 결제 단계에서 거절됩니다.",
      },
      { status: 400 },
    );
  }
  // 존재·미삭제 강의만 허용 — 형식만 맞는 UUID 는 plan_courses FK(23503)로 upsertPlan **뒤**에서 터져
  //   생성 모드에 「판매중·강의 0개」 고아 행을 남긴다. 저장 전에 거절한다.
  if (courseIds.length > 0) {
    const uniqueIds = [...new Set(courseIds)];
    const { data: existing, error: existErr } = await adminClient
      .from("courses")
      .select("course_id")
      .in("course_id", uniqueIds)
      .is("deleted_at", null);
    if (existErr) return data({ error: existErr.message }, { status: 400 });
    if ((existing ?? []).length !== uniqueIds.length) {
      return data(
        { error: "존재하지 않거나 삭제된 강의가 포함돼 있습니다." },
        { status: 400 },
      );
    }
  }

  // 이용 기간(subscription_plans.duration_days) — 학습 구독은 폼 값(필수), 강의상품은 정책과 동기화(D2).
  //   고정 일수 → 정책 일수 / 고정 종료일·현장 → 0. course/tpass 를 읽는 소비처가 없어 표시·지급 무영향
  //   (bank-transfer·webhook 은 course/tpass 를 건너뛰고, 카탈로그·강의개설 목록은 plan_policies 를 읽는다).
  let durationDays: number;
  if (isLecture) {
    durationDays = policy?.durationDays ?? 0;
  } else {
    if (parsed.data.durationDays == null) {
      return data({ error: "이용 기간(일)을 입력하세요." }, { status: 400 });
    }
    durationDays = parsed.data.durationDays;
  }

  const res = await upsertPlan(
    {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      priceKrw: parsed.data.priceKrw,
      listPriceKrw: parsed.data.listPriceKrw,
      plannedSessions,
      durationDays,
      productKind: parsed.data.productKind,
      subjectCodes,
      features,
      availableFrom: parsed.data.availableFrom,
      availableUntil,
      displayOrder: parsed.data.displayOrder,
      saleStatus: parsed.data.saleStatus,
      lectureCategory: parsed.data.lectureCategory,
      courseFormat,
      categoryId: parsed.data.categoryId,
      detailImageUrl,
      detailHtml,
      detailSections,
    },
    parsed.data.intent,
  );
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  // 뒤 단계(정책·강의·교재)가 DB 제약으로 실패하면 **생성 모드에 한해** 방금 만든 plan 행을 지운다(copyPlan 과
  //   같은 abort). plan_policies·plan_courses·plan_book_links 는 on delete cascade 라 plan 한 행이면 된다.
  //   ★update 모드는 res.planId 가 기존 상품이므로 절대 지우지 않는다(절반 반영은 별도 항목).
  const failAfterUpsert = async (message: string) => {
    if (parsed.data.intent === "create") {
      await adminClient.from("subscription_plans").delete().eq("plan_id", res.planId);
    }
    return data({ error: message }, { status: 400 });
  };

  // 강의 상품(course/tpass) — 정책 upsert(현장은 건너뜀: 기존 행이 있어도 그대로 둔다) + 강의·교재 동기화.
  if (isLecture && rules) {
    if (policy) {
      // ★upsert 는 안 보낸 칸을 기본값으로 되돌린다(22칸 전부 upsert, 부분 갱신 없음). 폼이 렌더하지 않는 칸은
      //   **저장된 값을 그대로 다시 넣어** 보존한다(화면에서만 없앤다, 값은 건드리지 않는다):
      //   · 기기 수(max_devices_*) — 요청서 §4.1(feat-11-011 P7). 폼이 없으면 kept, 그것도 없으면 1.
      //   · 그룹 단위 숨김(배수·기기/다운로드·일시정지·연장) — feat-11-015 P3-c. 폼과 같은 규칙
      //     (rules.policyGroups)으로 숨긴 그룹의 칸을 기존 행(update) / DDL 기본값(create·행 없음)으로 되돌린다.
      //     policySchema 가 미전송 칸을 false·0·null 로 파싱한 값은 노출 그룹에만 남는다.
      //   기존 행은 getPlanPolicies 로 22칸 전부 읽는다(create 모드는 행이 없어 undefined → 기본값).
      //   ★조회 실패는 throw 라 잡아서 failAfterUpsert 로 보낸다 — 안 잡으면 create 모드에 고아 plan 행이 남고,
      //     기본값으로 진행하면 update 모드의 저장값이 덮인다(닫힌 쪽으로 실패: 아무것도 쓰지 않는다).
      let keptPolicy: PlanPolicy | undefined;
      try {
        keptPolicy = (await getPlanPolicies([res.planId]))[res.planId];
      } catch (e) {
        return failAfterUpsert(
          `수강 정책 조회 실패: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      const p = applyHiddenPolicyGroups(policy, rules.policyGroups, keptPolicy);

      const polRes = await upsertPlanPolicy(res.planId, {
        multiplier: p.multiplier,
        durationDays: p.durationDays,
        fixedEndDate: p.fixedEndDate,
        startsOn: p.startsOn,
        midEntryMode: p.midEntryMode,
        midEntryDays: p.midEntryDays,
        allowDownload: p.allowDownload,
        allowPc: p.allowPc,
        allowMobile: p.allowMobile,
        maxDevicesPc: p.maxDevicesPc ?? keptPolicy?.maxDevicesPc ?? 1,
        maxDevicesMobile: p.maxDevicesMobile ?? keptPolicy?.maxDevicesMobile ?? 1,
        pauseAllowed: p.pauseAllowed,
        pauseMaxCount: p.pauseMaxCount,
        pauseMinDays: p.pauseMinDays,
        pauseMaxDays: p.pauseMaxDays,
        pauseTotalDays: p.pauseTotalDays,
        extensionAllowed: p.extensionAllowed,
        extensionPlanIds: p.extensionPlanIds,
        extensionPriceKrw: p.extensionPriceKrw,
        extensionMaxCount: p.extensionMaxCount,
        extensionDays: p.extensionDays,
      });
      if (!polRes.ok) return failAfterUpsert(polRes.error);
    }

    // 연결 강의(에디션) 동기화 — plan_courses(현장은 빈 배열).
    const linkRes = await syncPlanCourses(res.planId, courseIds);
    if (!linkRes.ok) return failAfterUpsert(linkRes.error);

    // 연결 교재(주/부·필수/선택·순서) 동기화 — plan_book_links(JSON). 유형과 무관하게 계속 동기화.
    let bookLinks: Array<{
      bookId: string;
      role: "main" | "sub";
      requirement: "required" | "optional";
    }> = [];
    try {
      const raw = JSON.parse(String(fd.get("bookLinks") ?? "[]"));
      if (Array.isArray(raw))
        bookLinks = raw
          .filter(
            (r) =>
              r &&
              typeof r.bookId === "string" &&
              /^[0-9a-f-]{36}$/i.test(r.bookId),
          )
          .map((r) => ({
            bookId: r.bookId,
            role: r.role === "sub" ? "sub" : "main",
            requirement: r.requirement === "required" ? "required" : "optional",
          }));
    } catch {
      bookLinks = [];
    }
    const bookRes = await syncPlanBookLinks(res.planId, bookLinks);
    if (!bookRes.ok) return failAfterUpsert(bookRes.error);
  }

  await logAuditEvent({
    actorId: user.id,
    actorRole: role,
    action: `plan.${parsed.data.intent}`,
    entityType: "subscription_plan",
    entityId: parsed.data.code,
    metadata: {
      priceKrw: parsed.data.priceKrw,
      productKind: parsed.data.productKind,
      courseFormat,
      subjectCodes,
      saleStatus: parsed.data.saleStatus,
      availableUntil,
      startsOn: policy?.startsOn ?? null,
      midEntryMode: policy?.midEntryMode ?? null,
    },
  });

  return data({ ok: true, planId: res.planId });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
