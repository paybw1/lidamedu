// feat-6-011 고객센터 문의 액션 — 학생/staff 공용. RLS client(조회·쓰기 DB 강제)+역할 게이트.
import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { requireAuthentication } from "~/core/lib/guards.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  addReply,
  createInquiry,
  getInquiryDetail,
  markAnswered,
  setInquiryStatus,
  softDeleteInquiry,
  updateInquiry,
} from "../queries.server";
import {
  notifyAuthorAnswered,
  notifyStaffNewInquiry,
} from "../notify.server";

import type { Route } from "./+types/cs-inquiry";

const categoryField = z.enum([
  "payment",
  "course",
  "book",
  "account",
  "site",
  "etc",
]);
const titleField = z.string().trim().min(1).max(200);
const bodyField = z.string().trim().min(1).max(20000);
const boolField = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    category: categoryField,
    title: titleField,
    bodyMd: bodyField,
    isPrivate: boolField,
  }),
  z.object({
    intent: z.literal("update"),
    inquiryId: z.string().uuid(),
    category: categoryField,
    title: titleField,
    bodyMd: bodyField,
    isPrivate: boolField,
  }),
  z.object({
    intent: z.literal("reply"),
    inquiryId: z.string().uuid(),
    bodyMd: bodyField,
  }),
  z.object({ intent: z.literal("close"), inquiryId: z.string().uuid() }),
  z.object({ intent: z.literal("reopen"), inquiryId: z.string().uuid() }),
  z.object({ intent: z.literal("delete"), inquiryId: z.string().uuid() }),
]);

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  await requireAuthentication(client, request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data(null, { status: 401 });

  const form = Object.fromEntries(await request.formData());
  const parsed = schema.safeParse(form);
  if (!parsed.success) {
    return data(
      { error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const isStaff = (await getStaffRole(client, user.id)) !== null;

  if (input.intent === "create") {
    const created = await createInquiry(client, {
      authorId: user.id,
      category: input.category,
      title: input.title,
      bodyMd: input.bodyMd,
      isPrivate: input.isPrivate,
    });
    runAfterResponse(
      notifyStaffNewInquiry({
        inquiryId: created.inquiryId,
        displayNo: created.displayNo,
        category: input.category,
        title: input.title,
        authorId: user.id,
      }),
    );
    return redirect(`/lecture/support/${created.inquiryId}`);
  }

  // 이하 공통 — 대상 문의 로드(RLS 가시성). 없으면 권한 없음/삭제됨.
  const inquiry = await getInquiryDetail(client, input.inquiryId);
  if (!inquiry) return data({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
  const isAuthor = inquiry.authorId === user.id;

  if (input.intent === "update") {
    if (!isAuthor || inquiry.status !== "open") {
      return data(
        { error: "답변 전 본인 문의만 수정할 수 있습니다." },
        { status: 403 },
      );
    }
    await updateInquiry(client, input.inquiryId, {
      category: input.category,
      title: input.title,
      bodyMd: input.bodyMd,
      isPrivate: input.isPrivate,
    });
    return data({ ok: true as const });
  }

  if (input.intent === "reply") {
    if (!isStaff && !isAuthor) {
      return data({ error: "답글 권한이 없습니다." }, { status: 403 });
    }
    await addReply(client, {
      inquiryId: input.inquiryId,
      authorId: user.id,
      role: isStaff ? "staff" : "student",
      bodyMd: input.bodyMd,
    });
    // staff 최초 답변 → 답변 완료 전환 + 작성자 알림.
    if (isStaff && inquiry.status === "open") {
      await markAnswered(client, input.inquiryId, user.id);
      runAfterResponse(
        notifyAuthorAnswered({
          inquiryId: inquiry.inquiryId,
          displayNo: inquiry.displayNo,
          title: inquiry.title,
          authorId: inquiry.authorId,
          answerExcerpt: input.bodyMd,
        }),
      );
    }
    return data({ ok: true as const });
  }

  if (input.intent === "delete") {
    if (!isStaff && !isAuthor) {
      return data({ error: "삭제 권한이 없습니다." }, { status: 403 });
    }
    await softDeleteInquiry(client, input.inquiryId);
    return redirect(isStaff ? "/admin/cs-inquiries" : "/lecture/support");
  }

  // close / reopen
  if (!isStaff && !isAuthor) {
    return data({ error: "권한이 없습니다." }, { status: 403 });
  }
  await setInquiryStatus(
    client,
    input.inquiryId,
    input.intent === "close" ? "closed" : "open",
  );
  return data({ ok: true as const });
}
