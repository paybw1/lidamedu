// 학생 GS 응시 액션 — 첨부 업로드 / 삭제 / 판독 자가확인 / 제출.
// intent 로 분기. 모두 본인 submission 에 대해서만 (RLS + auth.uid() 검사).

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  appendAttachment,
  getAttachmentSignedUrl,
  getOwnSubmission,
  listAnswersForSubmission,
  listGsQuestions,
  removeAttachment,
  setLegibilityConfirmed,
  submitOwnSubmission,
  type GsAttachment,
} from "~/features/gs/queries.server";
import { analyzeHandwriting } from "~/features/gs/lib/ocr.server";

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
const MAX_FILES_PER_QUESTION = 6;

const attachSchema = z.object({
  intent: z.literal("upload"),
  roundId: z.string().uuid(),
  questionId: z.string().uuid(),
  width: z.coerce.number().int().min(0).optional(),
  height: z.coerce.number().int().min(0).optional(),
});

const removeSchema = z.object({
  intent: z.literal("remove"),
  roundId: z.string().uuid(),
  questionId: z.string().uuid(),
  path: z.string().min(1),
});

const confirmSchema = z.object({
  intent: z.literal("confirm"),
  roundId: z.string().uuid(),
  questionId: z.string().uuid(),
  confirmed: z.union([z.literal("true"), z.literal("false")]),
});

const submitSchema = z.object({
  intent: z.literal("submit"),
  roundId: z.string().uuid(),
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

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  // 본인 submission 검증 helper
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

  if (intent === "upload") {
    const parsed = attachSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      questionId: fd.get("questionId"),
      width: fd.get("width") ?? undefined,
      height: fd.get("height") ?? undefined,
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);

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

    // 답안당 첨부 상한.
    const answers = await listAnswersForSubmission(client, sub.submissionId);
    const cur = answers.find((a) => a.questionId === parsed.data.questionId);
    if ((cur?.attachments.length ?? 0) >= MAX_FILES_PER_QUESTION) {
      return data(
        { error: `한 문항에 최대 ${MAX_FILES_PER_QUESTION}개까지 업로드할 수 있습니다.` },
        { status: 400 },
      );
    }

    // 이미지 해상도 검사 — 클라이언트가 width/height 전송. 미전송이면 PDF 로 간주.
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

    // 경로: {userId}/{roundId}/{questionId}/{uuid}.{ext}
    const ext = (() => {
      switch (file.type) {
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
    })();
    const fileId = crypto.randomUUID();
    const path = `${user.id}/${parsed.data.roundId}/${parsed.data.questionId}/${fileId}.${ext}`;

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

    // 한국어 손글씨 OCR 검사 — 이미지에 한해. API 키 미설정/실패 시 null → 미검사로 표시.
    const ocr = await analyzeHandwriting(arrayBuf, file.type);

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
    }
    await appendAttachment(
      client,
      sub.submissionId,
      parsed.data.questionId,
      attachment,
    );
    // 첨부가 바뀌면 자가확인 리셋 — 새 파일이라 다시 봐야 함.
    await setLegibilityConfirmed(
      client,
      sub.submissionId,
      parsed.data.questionId,
      false,
    );
    return data({ ok: true, attachment });
  }

  if (intent === "remove") {
    const parsed = removeSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      questionId: fd.get("questionId"),
      path: fd.get("path"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);
    // 파일 + 메타 동시 제거.
    await client.storage.from("gs-answers").remove([parsed.data.path]);
    await removeAttachment(
      client,
      sub.submissionId,
      parsed.data.questionId,
      parsed.data.path,
    );
    await setLegibilityConfirmed(
      client,
      sub.submissionId,
      parsed.data.questionId,
      false,
    );
    return data({ ok: true });
  }

  if (intent === "confirm") {
    const parsed = confirmSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
      questionId: fd.get("questionId"),
      confirmed: fd.get("confirmed"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);
    await setLegibilityConfirmed(
      client,
      sub.submissionId,
      parsed.data.questionId,
      parsed.data.confirmed === "true",
    );
    return data({ ok: true });
  }

  if (intent === "submit") {
    const parsed = submitSchema.safeParse({
      intent,
      roundId: fd.get("roundId"),
    });
    if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
    const sub = await ensureSubmission(parsed.data.roundId);

    // 검증: 모든 문제에 첨부가 1개 이상 + 모든 답안에 자가확인 = true.
    const [questions, answers] = await Promise.all([
      listGsQuestions(client, parsed.data.roundId),
      listAnswersForSubmission(client, sub.submissionId),
    ]);
    const answerByQ = new Map(answers.map((a) => [a.questionId, a]));
    for (const q of questions) {
      const a = answerByQ.get(q.questionId);
      if (!a || a.attachments.length === 0) {
        return data(
          { error: `문항 "${q.title ?? "본문"}" 에 답안 파일이 없습니다.` },
          { status: 400 },
        );
      }
      if (!a.legibilityConfirmed) {
        return data(
          {
            error: `문항 "${q.title ?? "본문"}" 의 판독 가능 여부를 확인해 주세요.`,
          },
          { status: 400 },
        );
      }
    }

    await submitOwnSubmission(client, sub.submissionId);
    return data({ ok: true });
  }

  return data({ error: "Unknown intent" }, { status: 400 });
}
