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
  courseFormatFormRules,
  toCourseFormat,
} from "~/features/lms/lib/course-format";
import { DETAIL_SECTIONS } from "~/features/lms/lib/detail-sections";
import {
  FEATURE_LABEL,
  isLectureProductKind,
} from "~/features/subscriptions/labels";
import {
  copyPlan,
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

// 강의 수강 정책(course/tpass 전용) — plan_policies. durationMode 로 수강기간 방식 분기.
// ★배수(multiplier)는 수강기간 방식이 아니라 독립 축이다 — 어느 방식이든 함께 지정한다.
//   무제한은 null. DB check 가 multiplier >= 1 이라 하한을 1 로 둔다(0 이면 저장 실패).
const policySchema = z.object({
  durationMode: z.enum(["days", "fixed"]),
  multiplier: z.coerce.number().min(1).max(100).nullable(),
  // DB check 가 duration_days > 0 이라 하한은 1.
  durationDays: z.coerce.number().int().min(1).max(3650).nullable(),
  // ★달력 왕복 검증 — `new Date(v)` 의 NaN 검사만으로는 2026-02-31 이 03-03 으로 롤오버돼 통과하고,
  //   DB(date 컬럼)가 22008 로 거절해 upsertPlan 뒤에서 실패한다(생성 모드 고아 행).
  fixedEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      // ★2026-13-01 처럼 월·일 범위 밖은 롤오버가 아니라 Invalid Date 라 toISOString 이 throw → NaN 먼저 거른다.
      const d = new Date(v + "T00:00:00Z");
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, "존재하지 않는 날짜입니다.")
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
      const p = policy;
      // ★upsert 는 안 보낸 칸을 기본값으로 되돌린다. 폼에서 뺀 기기 수는 **저장된 값을
      //   그대로 다시 넣어** 보존한다(요청서 §4.1 — 화면에서만 없앤다, 값은 건드리지 않는다).
      const { data: keptPolicy } = await adminClient
        .from("plan_policies")
        .select("max_devices_pc, max_devices_mobile")
        .eq("plan_id", res.planId)
        .maybeSingle();

      const polRes = await upsertPlanPolicy(res.planId, {
        multiplier: p.multiplier,
        durationDays: p.durationDays,
        fixedEndDate: p.fixedEndDate,
        allowDownload: p.allowDownload,
        allowPc: p.allowPc,
        allowMobile: p.allowMobile,
        maxDevicesPc: p.maxDevicesPc ?? keptPolicy?.max_devices_pc ?? 1,
        maxDevicesMobile: p.maxDevicesMobile ?? keptPolicy?.max_devices_mobile ?? 1,
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
    },
  });

  return data({ ok: true, planId: res.planId });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
