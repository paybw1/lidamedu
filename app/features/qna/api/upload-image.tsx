// Q&A 질문/추가 문답 이미지 업로드 — 로그인 사용자(학생 포함).
// multipart 파일을 qna-images(공개) 버킷에 업로드하고 public URL 반환 —
// 클라이언트가 본문 markdown 에 ![](url) 로 삽입한다.
// 경로 = <userId>/<sha256 해시>.<ext> — 업로더 추적 + 동일 파일 중복 저장 방지.

import { data } from "react-router";
import { createHash } from "node:crypto";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/upload-image";

const BUCKET = "qna-images";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
// SVG 제외 — 학생 업로드라 스크립트 내장 가능 형식은 받지 않는다.
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return data({ ok: false, error: "Unauthorized" } as const, { status: 401 });

  const fd = await request.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return data({ ok: false, error: "file 누락" } as const, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return data({ ok: false, error: "파일 크기 초과 (5MB)" } as const, {
      status: 400,
    });
  }
  if (!ALLOWED.includes(file.type)) {
    return data(
      { ok: false, error: `지원하지 않는 파일 형식: ${file.type}` } as const,
      { status: 400 },
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 32);
  const ext = file.type === "image/jpeg" ? "jpg" : (file.type.split("/")[1] ?? "bin");
  const objectName = `${user.id}/${hash}.${ext}`;

  // service_role 로 업로드 — 인증 게이트는 위에서 통과(스토리지 정책 별도 불요).
  const { error } = await adminClient.storage
    .from(BUCKET)
    .upload(objectName, buf, { contentType: file.type, upsert: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    return data({ ok: false, error: error.message } as const, { status: 500 });
  }
  const { data: urlData } = adminClient.storage
    .from(BUCKET)
    .getPublicUrl(objectName);
  return { ok: true, url: urlData.publicUrl } as const;
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
