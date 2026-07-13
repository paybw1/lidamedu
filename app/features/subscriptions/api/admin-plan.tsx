// 상품(플랜) 생성·수정 — feat-8-028 Stage B. manager+ 전용.
import { randomUUID } from "node:crypto";

import { data } from "react-router";
import { z } from "zod";

import { roleAtLeast } from "~/core/lib/roles";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { logAuditEvent } from "~/features/admin/queries/audit-log.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { FEATURE_LABEL } from "~/features/subscriptions/labels";
import {
  syncPlanBooks,
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
const policySchema = z.object({
  durationMode: z.enum(["multiplier", "days", "fixed"]),
  multiplier: z.coerce.number().min(0).max(100).nullable(),
  durationDays: z.coerce.number().int().min(0).max(3650).nullable(),
  fixedEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  allowDownload: z.boolean(),
  allowPc: z.boolean(),
  allowMobile: z.boolean(),
  maxDevicesPc: z.coerce.number().int().min(0).max(20),
  maxDevicesMobile: z.coerce.number().int().min(0).max(20),
  pauseAllowed: z.boolean(),
  pauseMaxCount: z.coerce.number().int().min(0).max(50),
  pauseMinDays: z.coerce.number().int().min(0).max(365),
  pauseMaxDays: z.coerce.number().int().min(0).max(3650),
  pauseTotalDays: z.coerce.number().int().min(0).max(3650),
  extensionAllowed: z.boolean(),
  extensionPlanIds: z.array(z.string()),
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
  durationDays: z.coerce.number().int().min(0).max(3650),
  productKind: z.enum(["subject", "bundle", "membership", "course", "tpass"]),
  availableFrom: z.string().datetime().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(9999),
  saleStatus: z.enum(["scheduled", "on_sale", "paused", "ended", "hidden"]),
  // 강의 카탈로그 분류(강의 플랫폼 course/tpass 상품에만 의미). 미분류=null.
  lectureCategory: z
    .enum(["round1", "round2", "package", "onsite"])
    .nullable(),
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
  const parsed = schema.safeParse({
    intent: fd.get("intent"),
    code: fd.get("code"),
    name: fd.get("name"),
    description: (() => {
      const s = String(fd.get("description") ?? "").trim();
      return s === "" ? null : s;
    })(),
    priceKrw: fd.get("priceKrw"),
    durationDays: fd.get("durationDays"),
    productKind: fd.get("productKind"),
    availableFrom: toIso(fd.get("availableFrom")),
    displayOrder: fd.get("displayOrder"),
    saleStatus: fd.get("saleStatus"),
    lectureCategory: (() => {
      const s = String(fd.get("lectureCategory") ?? "").trim();
      return s === "" ? null : s;
    })(),
  });
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
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

  const res = await upsertPlan(
    {
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      priceKrw: parsed.data.priceKrw,
      durationDays: parsed.data.durationDays,
      productKind: parsed.data.productKind,
      subjectCodes,
      features,
      availableFrom: parsed.data.availableFrom,
      displayOrder: parsed.data.displayOrder,
      saleStatus: parsed.data.saleStatus,
      lectureCategory: parsed.data.lectureCategory,
      detailImageUrl,
      detailHtml,
    },
    parsed.data.intent,
  );
  if (!res.ok) return data({ error: res.error }, { status: 400 });

  // 강의 상품(course/tpass)이면 수강 정책 upsert.
  if (
    parsed.data.productKind === "course" ||
    parsed.data.productKind === "tpass"
  ) {
    const durationMode = String(fd.get("policy_durationMode") ?? "days");
    const policyParsed = policySchema.safeParse({
      durationMode,
      multiplier:
        durationMode === "multiplier" ? fd.get("policy_multiplier") : null,
      durationDays:
        durationMode === "days" ? fd.get("policy_durationDays") : null,
      fixedEndDate:
        durationMode === "fixed"
          ? String(fd.get("policy_fixedEndDate") ?? "").trim() || null
          : null,
      allowDownload: fd.get("policy_allowDownload") === "1",
      allowPc: fd.get("policy_allowPc") === "1",
      allowMobile: fd.get("policy_allowMobile") === "1",
      maxDevicesPc: fd.get("policy_maxDevicesPc"),
      maxDevicesMobile: fd.get("policy_maxDevicesMobile"),
      pauseAllowed: fd.get("policy_pauseAllowed") === "1",
      pauseMaxCount: fd.get("policy_pauseMaxCount"),
      pauseMinDays: fd.get("policy_pauseMinDays"),
      pauseMaxDays: fd.get("policy_pauseMaxDays"),
      pauseTotalDays: fd.get("policy_pauseTotalDays"),
      extensionAllowed: fd.get("policy_extensionAllowed") === "1",
      extensionPlanIds: fd.getAll("policy_extensionPlanIds").map(String),
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
    const p = policyParsed.data;
    const polRes = await upsertPlanPolicy(res.planId, {
      multiplier: p.multiplier,
      durationDays: p.durationDays,
      fixedEndDate: p.fixedEndDate,
      allowDownload: p.allowDownload,
      allowPc: p.allowPc,
      allowMobile: p.allowMobile,
      maxDevicesPc: p.maxDevicesPc,
      maxDevicesMobile: p.maxDevicesMobile,
      pauseAllowed: p.pauseAllowed,
      pauseMaxCount: p.pauseMaxCount,
      pauseMinDays: p.pauseMinDays,
      pauseMaxDays: p.pauseMaxDays,
      pauseTotalDays: p.pauseTotalDays,
      extensionAllowed: p.extensionAllowed,
      extensionPlanIds: p.extensionPlanIds,
    });
    if (!polRes.ok) return data({ error: polRes.error }, { status: 400 });

    // 연결 강의(에디션) 동기화 — plan_courses.
    const courseIds = fd
      .getAll("courseIds")
      .map(String)
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    const linkRes = await syncPlanCourses(res.planId, courseIds);
    if (!linkRes.ok) return data({ error: linkRes.error }, { status: 400 });

    // 연결 교재(도서) 동기화 — plan_books.
    const bookIds = fd
      .getAll("bookIds")
      .map(String)
      .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    const bookRes = await syncPlanBooks(res.planId, bookIds);
    if (!bookRes.ok) return data({ error: bookRes.error }, { status: 400 });
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
      subjectCodes,
      saleStatus: parsed.data.saleStatus,
    },
  });

  return data({ ok: true, planId: res.planId });
}
