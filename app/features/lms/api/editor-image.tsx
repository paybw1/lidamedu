// feat-11-006 Phase 3 — HTML 에디터 이미지 업로드 엔드포인트. staff 전용.
//   본문 에디터에서 붙여넣기·업로드한 이미지를 landing-banners 버킷에 저장하고 공개 URL 반환.
import { randomUUID } from "node:crypto";

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/editor-image";

const MAX_SIZE = 8 * 1024 * 1024; // 8MB
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role || !(await hasDutyAccess("lms_video_admin", user.id, role)))
    return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0)
    return data({ error: "파일을 선택해 주세요." }, { status: 400 });
  if (file.size > MAX_SIZE)
    return data({ error: "이미지는 8MB 이하만 올릴 수 있습니다." }, { status: 400 });
  const ext = (file.name.includes(".") ? file.name.split(".").pop()! : "").toLowerCase();
  if (!IMAGE_EXTS.has(ext))
    return data({ error: "이미지 파일만 업로드할 수 있습니다." }, { status: 400 });

  const path = `editor-images/${randomUUID()}.${ext}`;
  const { error: upErr } = await adminClient.storage
    .from("landing-banners")
    .upload(path, file, { contentType: file.type || undefined });
  if (upErr) return data({ error: `업로드 실패: ${upErr.message}` }, { status: 400 });
  const url = adminClient.storage.from("landing-banners").getPublicUrl(path).data
    .publicUrl;
  return data({ ok: true as const, url });
}
