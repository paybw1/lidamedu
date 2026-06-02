// 학생 GS 응시 액션 — 답안지 페이지 단위 (1슬롯=1파일).
// intent: upload-page / remove-page / set-page-questions / confirm-page / submit.
// RLS + auth.uid() 로 본인 submission 검증.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { analyzeHandwriting } from "~/features/gs/lib/ocr.server";
import {
  checkOcrCap,
  notifyCapReachedOnce,
  recordOcrUsage,
} from "~/features/gs/lib/usage-tracker.server";
import {
  type GsAttachment,
  deleteSubmissionPage,
  getAttachmentSignedUrl,
  getGsRound,
  getOwnSubmission,
  listGsQuestions,
  listSubmissionPages,
  setPageLegibilityConfirmed,
  setPageQuestions,
  shiftPagesDown,
  submitOwnSubmission,
  swapSubmissionPages,
  upsertSubmissionPage,
} from "~/features/gs/queries.server";

import type { Route } from "./+types/take";

// GET — signed URL 반환 (미리보기 용). path query 필수, 본인 폴더만.
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  if (!path) return data({ error: "Missing path" }, { status: 400 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  // path 첫 폴더가 user_id 인지 검사 (RLS 도 추가 차단).
  const ownerId = path.split("/")[0];
  if (ownerId !== user.id) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const signed = await getAttachmentSignedUrl(client, path, 600);
  return data({ url: signed });
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_FILE_SIZE = 20 * 1024; // 20KB — 너무 작으면 썸네일/공백.

const uploadSchema = z.object({
  intent: z.literal("upload-page"),
  roundId: z.string().uuid(),
  pageNumber: z.coerce.number().int().min(1).max(100),
  width: z.coerce.number().int().min(0).optional(),
  height: z.coerce.number().int().min(0).optional(),
});

const removeSchema = z.object({
  intent: z.literal("remove-page"),
  roundId: z.string().uuid(),
  pageNumber: z.coerce.number().int().min(1).max(100),
});

const setQuestionsSchema = z.object({
  intent: z.literal("set-page-questions"),
  roundId: z.string().uuid(),
  pageNumber: z.coerce.number().int().min(1).max(100),
  // 콤마로 구분된 questionId 리스트. 빈 문자열이면 매핑 제거.
  questionIds: z.string().optional(),
});

const confirmSchema = z.object({
  intent: z.literal("confirm-page"),
  roundId: z.string().uuid(),
  pageNumber: z.coerce.number().int().min(1).max(100),
  confirmed: z.union([z.literal("true"), z.literal("false")]),
});

const submitSchema = z.object({
  intent: z.literal("submit"),
  roundId: z.string().uuid(),
});

const swapSchema = z.object({
  intent: z.literal("swap-pages"),
  roundId: z.string().uuid(),
  pageNumberA: z.coerce.number().int().min(1).max(100),
  pageNumberB: z.coerce.number().int().min(1).max(100),
});

const shiftSchema = z.object({
  intent: z.literal("shift-pages-down"),
  roundId: z.string().uuid(),
  fromPage: z.coerce.number().int().min(1).max(100),
});

function extOf(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    default:
      return "bin";
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  const ensureSubmission = async (roundId: string) => {
    const sub = await getOwnSubmission(client, user.id, roundId);
    if (!sub) {
      throw data({ error: "응시 시작이 필요합니다." }, { status: 400 });
    }
    if (sub.submittedAt) {
      throw data({ error: "이미 제출된 응시입니다." }, { status: 400 });
    }
    return sub;
  };

  if (intent === "upload-page") {
    const parsed = uploadSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      pageNumber: fd.get("pageNumber"),
      width: fd.get("width") ?? undefined,
      height: fd.get("height") ?? undefined,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);
    const round = await getGsRound(client, parsed.data.roundId);
    if (!round) return data({ error: "Round not found" }, { status: 404 });
    if (parsed.data.pageNumber > round.expectedPages) {
      return data(
        {
          error: `이 회차의 답안지는 최대 ${round.expectedPages} 페이지입니다.`,
        },
        { status: 400 },
      );
    }

    const file = fd.get("file");
    if (!(file instanceof File)) {
      return data({ error: "파일이 없습니다." }, { status: 400 });
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return data(
        { error: "허용되지 않은 형식 — JPG/PNG/WebP/PDF 만 가능합니다." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return data({ error: "파일이 10MB 를 초과합니다." }, { status: 400 });
    }
    if (file.size < MIN_FILE_SIZE) {
      return data(
        { error: "파일이 너무 작습니다(20KB 미만). 썸네일이 아닌 원본을 올려주세요." },
        { status: 400 },
      );
    }

    if (file.type.startsWith("image/")) {
      const w = parsed.data.width ?? 0;
      const h = parsed.data.height ?? 0;
      if (w < 600 || h < 600) {
        return data(
          {
            error: `이미지 해상도가 너무 낮습니다(${w}x${h}). 최소 600x600 이상 — 가급적 1200x1600 이상으로 촬영/스캔해 주세요.`,
          },
          { status: 400 },
        );
      }
    }

    // 기존 페이지가 있으면 storage 파일 제거.
    const existingPages = await listSubmissionPages(client, sub.submissionId);
    const existing = existingPages.find(
      (p) => p.pageNumber === parsed.data.pageNumber,
    );
    if (existing) {
      await client.storage.from("gs-answers").remove([existing.attachment.path]);
    }

    // 경로: {userId}/{roundId}/page-{nn}-{uuid}.{ext} — questionId 가 페이지 단위이므로 폴더에서 제외.
    const pageStr = String(parsed.data.pageNumber).padStart(2, "0");
    const fileId = crypto.randomUUID();
    const path = `${user.id}/${parsed.data.roundId}/page-${pageStr}-${fileId}.${extOf(file.type)}`;

    const arrayBuf = await file.arrayBuffer();
    const upload = await client.storage
      .from("gs-answers")
      .upload(path, arrayBuf, { contentType: file.type, upsert: false });
    if (upload.error) {
      return data(
        { error: `업로드 실패: ${upload.error.message}` },
        { status: 500 },
      );
    }

    // §2 — OCR cap preflight. 도달 시 OCR 만 skip (페이지 저장은 그대로 진행).
    // 학생 응시·제출은 OCR 과 무관하게 가능해야 함 (판독 자가확인이 게이트).
    const usageMeta = {
      roundId: parsed.data.roundId,
      submissionId: sub.submissionId,
      userId: user.id,
    };
    let ocr: Awaited<ReturnType<typeof analyzeHandwriting>> = null;
    let ocrSkippedReason: GsAttachment["ocrSkippedReason"] = undefined;
    if (file.type.startsWith("image/")) {
      const cap = await checkOcrCap();
      if (cap.blocked) {
        await recordOcrUsage({
          outcome: "skipped_cap",
          meta: usageMeta,
          reason: cap.reason,
        });
        runAfterResponse(notifyCapReachedOnce(cap));
        ocrSkippedReason = "cap";
      } else {
        // 한국어 손글씨 OCR — 이미지에 한해. PDF 는 미실행.
        ocr = await analyzeHandwriting(arrayBuf, file.type, usageMeta);
        if (!ocr && !process.env.GOOGLE_CLOUD_VISION_API_KEY) {
          // skipped_no_key 로 lib 가 이미 기록함 — 마킹만.
          ocrSkippedReason = "no_key";
        }
      }
    }

    const attachment: GsAttachment = {
      path,
      fileName: file.name,
      mime: file.type,
      size: file.size,
      width: parsed.data.width,
      height: parsed.data.height,
      createdAt: new Date().toISOString(),
    };
    if (ocr) {
      attachment.ocrText = ocr.text;
      attachment.ocrCharCount = ocr.charCount;
      attachment.ocrKoreanCharCount = ocr.koreanCharCount;
      attachment.ocrConfidence = ocr.confidence;
      attachment.ocrLevel = ocr.level;
      attachment.ocrCheckedAt = new Date().toISOString();
    } else if (ocrSkippedReason) {
      attachment.ocrSkippedReason = ocrSkippedReason;
    }
    await upsertSubmissionPage(
      client,
      sub.submissionId,
      parsed.data.pageNumber,
      attachment,
    );
    return data({ ok: true, attachment });
  }

  if (intent === "remove-page") {
    const parsed = removeSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      pageNumber: fd.get("pageNumber"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);

    const existingPages = await listSubmissionPages(client, sub.submissionId);
    const existing = existingPages.find(
      (p) => p.pageNumber === parsed.data.pageNumber,
    );
    if (existing) {
      await client.storage.from("gs-answers").remove([existing.attachment.path]);
      await deleteSubmissionPage(
        client,
        sub.submissionId,
        parsed.data.pageNumber,
      );
    }
    return data({ ok: true });
  }

  if (intent === "set-page-questions") {
    const parsed = setQuestionsSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      pageNumber: fd.get("pageNumber"),
      questionIds: fd.get("questionIds") ?? "",
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);

    const ids = (parsed.data.questionIds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // 회차에 속한 questionId 만 허용.
    if (ids.length > 0) {
      const questions = await listGsQuestions(client, parsed.data.roundId);
      const allowed = new Set(questions.map((q) => q.questionId));
      for (const id of ids) {
        if (!allowed.has(id)) {
          return data({ error: "잘못된 문항 ID" }, { status: 400 });
        }
      }
    }
    await setPageQuestions(client, sub.submissionId, parsed.data.pageNumber, ids);
    return data({ ok: true });
  }

  if (intent === "confirm-page") {
    const parsed = confirmSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      pageNumber: fd.get("pageNumber"),
      confirmed: fd.get("confirmed"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);
    await setPageLegibilityConfirmed(
      client,
      sub.submissionId,
      parsed.data.pageNumber,
      parsed.data.confirmed === "true",
    );
    return data({ ok: true });
  }

  if (intent === "swap-pages") {
    const parsed = swapSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      pageNumberA: fd.get("pageNumberA"),
      pageNumberB: fd.get("pageNumberB"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);
    if (parsed.data.pageNumberA === parsed.data.pageNumberB) {
      return data({ ok: true });
    }
    await swapSubmissionPages(
      client,
      sub.submissionId,
      parsed.data.pageNumberA,
      parsed.data.pageNumberB,
    );
    return data({ ok: true });
  }

  if (intent === "shift-pages-down") {
    const parsed = shiftSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      fromPage: fd.get("fromPage"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);
    const round = await getGsRound(client, parsed.data.roundId);
    if (!round) return data({ error: "Round not found" }, { status: 404 });
    // 가드: 마지막 페이지가 채워져 있으면 시프트 시 expected_pages 초과 → 차단.
    const pages = await listSubmissionPages(client, sub.submissionId);
    const maxFilled = pages.reduce((m, p) => Math.max(m, p.pageNumber), 0);
    if (maxFilled >= round.expectedPages) {
      return data(
        {
          error: `마지막 페이지(${round.expectedPages})가 채워져 있어 끼워넣기 시 페이지가 초과됩니다. 마지막 페이지를 비우거나 회차의 답안지 페이지 수를 늘려 주세요.`,
        },
        { status: 400 },
      );
    }
    if (parsed.data.fromPage > round.expectedPages) {
      return data({ error: "범위 밖 페이지" }, { status: 400 });
    }
    await shiftPagesDown(client, sub.submissionId, parsed.data.fromPage);
    return data({ ok: true });
  }

  if (intent === "submit") {
    const parsed = submitSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);

    // 검증: 1+ 페이지 업로드 + 페이지 수 ≤ expected_pages + 모든 페이지 자가확인.
    // 미매핑 문항은 차단 X — 자동 채점에서 0점 처리(학생이 일부만 풀고 제출 가능).
    const [round, pages] = await Promise.all([
      getGsRound(client, parsed.data.roundId),
      listSubmissionPages(client, sub.submissionId),
    ]);
    if (!round) {
      return data({ error: "회차 정보를 찾을 수 없습니다." }, { status: 404 });
    }
    if (pages.length === 0) {
      return data({ error: "답안지를 1페이지 이상 업로드해 주세요." }, { status: 400 });
    }
    if (pages.length > round.expectedPages) {
      return data(
        { error: `업로드 ${pages.length}페이지가 최대 ${round.expectedPages}페이지를 초과합니다.` },
        { status: 400 },
      );
    }
    for (const p of pages) {
      if (!p.legibilityConfirmed) {
        return data(
          { error: `페이지 ${p.pageNumber} 의 판독 가능 여부를 확인해 주세요.` },
          { status: 400 },
        );
      }
    }

    await submitOwnSubmission(client, sub.submissionId);
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
