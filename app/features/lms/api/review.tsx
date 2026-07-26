// feat-11-006 Phase 4 — 수강평/교재평 학생 뮤테이션(작성/수정/삭제/신고).
//   ★구매자 게이트: isPurchaser 로 검증(RLS 는 author 기준이라 여기가 유일 방어).
import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { adjustMemberPoints } from "~/features/admin/queries/member-crm.server";
import {
  isPlanCourseCompleted,
  isPurchaser,
  type ReviewTargetType,
} from "~/features/lms/reviews.server";
import {
  REVIEW_REWARD_MIN_CHARS,
  REVIEW_REWARD_POINTS,
} from "~/features/lms/reviews-config";

import type { Route } from "./+types/review";

const submitSchema = z.object({
  targetType: z.enum(["plan", "book"]),
  targetId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(2000),
  isPublic: z.boolean(),
});

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "로그인이 필요합니다." }, { status: 401 });

  const fd = await request.formData();
  const intent = fd.get("intent");

  if (intent === "submit") {
    const parsed = submitSchema.safeParse({
      targetType: fd.get("targetType"),
      targetId: fd.get("targetId"),
      rating: fd.get("rating"),
      body: fd.get("body") ?? "",
      isPublic: fd.get("isPublic") !== "0",
    });
    if (!parsed.success)
      return data({ error: "별점과 내용을 확인해 주세요." }, { status: 400 });
    const p = parsed.data;
    // 작성 게이트 — 강의(plan)=완강한 사람만(원장 결정 2026-07-26) / 교재(book)=구매자.
    if (p.targetType === "plan") {
      if (!(await isPlanCourseCompleted(user.id, p.targetId)))
        return data(
          { error: "강의를 완강한 후에 수강 후기를 작성할 수 있습니다." },
          { status: 403 },
        );
    } else if (
      !(await isPurchaser(
        client,
        user.id,
        p.targetType as ReviewTargetType,
        p.targetId,
      ))
    ) {
      return data(
        { error: "구매한 회원만 후기를 작성할 수 있습니다." },
        { status: 403 },
      );
    }
    // upsert(대상당 1인 1리뷰) — 기존 있으면 수정.
    const { data: existing } = await client
      .from("course_reviews")
      .select("review_id")
      .eq("target_type", p.targetType)
      .eq("target_id", p.targetId)
      .eq("author_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();
    let reviewId: string;
    if (existing) {
      const { error } = await client
        .from("course_reviews")
        .update({ rating: p.rating, body: p.body, is_public: p.isPublic })
        .eq("review_id", existing.review_id);
      if (error) return data({ error: error.message }, { status: 400 });
      reviewId = existing.review_id;
    } else {
      const { data: inserted, error } = await client
        .from("course_reviews")
        .insert({
          target_type: p.targetType,
          target_id: p.targetId,
          author_id: user.id,
          rating: p.rating,
          body: p.body,
          is_public: p.isPublic,
        })
        .select("review_id")
        .single();
      if (error) return data({ error: error.message }, { status: 400 });
      reviewId = inserted.review_id;
    }

    // 보상 — 강의(plan) 후기만 대상. 일정 분량 이상 본문 + 이 대상에 미지급이면 적립(대상당 1회).
    //   ★교재(book) 후기는 보상 제외(원장 결정 2026-07-26).
    //   ★멱등: 소프트삭제 포함 전체 조회로 이미 지급된 대상은 재지급 안 함(삭제→재작성 어뷰즈 차단).
    //   ★point_transactions insert 는 staff RLS 전용 → adminClient(adjustMemberPoints) 경유.
    let awardedPoints = 0;
    if (
      p.targetType === "plan" &&
      p.body.trim().length >= REVIEW_REWARD_MIN_CHARS
    ) {
      const { data: prior } = await adminClient
        .from("course_reviews")
        .select("review_id")
        .eq("author_id", user.id)
        .eq("target_type", p.targetType)
        .eq("target_id", p.targetId)
        .not("points_awarded_at", "is", null)
        .limit(1);
      if (!prior || prior.length === 0) {
        const res = await adjustMemberPoints({
          userId: user.id,
          delta: REVIEW_REWARD_POINTS,
          reason: "수강 후기 작성 보상",
        });
        if (res.ok) {
          await adminClient
            .from("course_reviews")
            .update({ points_awarded_at: new Date().toISOString() })
            .eq("review_id", reviewId);
          awardedPoints = REVIEW_REWARD_POINTS;
        }
      }
    }
    return data({ ok: true as const, awardedPoints });
  }

  if (intent === "delete") {
    const reviewId = z.string().uuid().safeParse(fd.get("reviewId"));
    if (!reviewId.success)
      return data({ error: "잘못된 요청" }, { status: 400 });
    // soft-delete(본인 것만 — RLS update author 기준). SELECT own 정책이 deleted_at 무필터라 42501 없음.
    const { error } = await client
      .from("course_reviews")
      .update({ deleted_at: new Date().toISOString() })
      .eq("review_id", reviewId.data)
      .eq("author_id", user.id);
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  if (intent === "report") {
    const reviewId = z.string().uuid().safeParse(fd.get("reviewId"));
    if (!reviewId.success)
      return data({ error: "잘못된 요청" }, { status: 400 });
    const reason = String(fd.get("reason") ?? "").trim() || null;
    const { error } = await client.from("course_review_reports").insert({
      review_id: reviewId.data,
      reporter_id: user.id,
      reason,
    });
    // 중복 신고(unique)면 조용히 성공 처리.
    if (error && !error.message.includes("duplicate"))
      return data({ error: error.message }, { status: 400 });
    return data({ ok: true as const });
  }

  return data({ error: "알 수 없는 요청" }, { status: 400 });
}
