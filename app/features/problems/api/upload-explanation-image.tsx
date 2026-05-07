// 운영자 — 해설 markdown 에디터에서 이미지 업로드.
// multipart 파일 받아서 problem-explanations 버킷에 업로드, public URL 반환.

import { data } from "react-router";
import { createHash } from "node:crypto";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/upload-explanation-image";

const BUCKET = "problem-explanations";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"];

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" } as const, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false, error: "Forbidden" } as const, { status: 403 });

  const fd = await request.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return data({ ok: false, error: "file 누락" } as const, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return data({ ok: false, error: "파일 크기 초과 (5MB)" } as const, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return data({ ok: false, error: `지원하지 않는 파일 형식: ${file.type}` } as const, { status: 400 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 32);
  const ext = mimeToExt(file.type);
  const objectName = `${hash}.${ext}`;

  // service_role 로 업로드 (storage RLS 우회 — staff 검증은 위에서 통과).
  const { error } = await adminClient.storage
    .from(BUCKET)
    .upload(objectName, buf, { contentType: file.type, upsert: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    return data({ ok: false, error: error.message } as const, { status: 500 });
  }
  const { data: urlData } = adminClient.storage.from(BUCKET).getPublicUrl(objectName);
  return { ok: true, url: urlData.publicUrl } as const;
}

function mimeToExt(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  return mime.split("/")[1] ?? "bin";
}
