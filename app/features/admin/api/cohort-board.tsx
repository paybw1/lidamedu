// feat-6-010 반별 게시판 — 운영자 게시판 CRUD action. staff 가드 + RLS client 변이.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { writeScopeSchema } from "~/features/cohort-boards/labels";
import {
  createBoard,
  softDeleteBoard,
  updateBoard,
} from "~/features/cohort-boards/queries.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/cohort-board";

const cohortIdsSchema = z.array(z.string().uuid()).max(100);
function parseCohortIds(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed = cohortIdsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

const fieldsSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  writeScope: writeScopeSchema,
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  const role = await getStaffRole(client, user.id);
  if (!role)
    return data({ ok: false, error: "forbidden" }, { status: 403, headers });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "create" || intent === "update") {
    const parsed = fieldsSchema.safeParse({
      title: fd.get("title"),
      description: fd.get("description") || undefined,
      writeScope: fd.get("writeScope"),
    });
    if (!parsed.success)
      return data({ ok: false, error: "입력 오류" }, { status: 400, headers });
    const input = {
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      writeScope: parsed.data.writeScope,
      cohortIds: parseCohortIds(fd.get("cohortIds")),
    };
    if (intent === "create") {
      const res = await createBoard(client, role, user.id, input);
      return data(res, { headers });
    }
    const boardId = z.string().uuid().safeParse(fd.get("boardId"));
    if (!boardId.success)
      return data({ ok: false, error: "invalid board id" }, { status: 400, headers });
    const res = await updateBoard(client, role, user.id, boardId.data, input);
    return data(res, { headers });
  }

  if (intent === "delete") {
    const boardId = z.string().uuid().safeParse(fd.get("boardId"));
    if (!boardId.success)
      return data({ ok: false, error: "invalid board id" }, { status: 400, headers });
    const res = await softDeleteBoard(client, boardId.data);
    return data(res, { headers });
  }

  return data({ ok: false, error: "unknown intent" }, { status: 400, headers });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
