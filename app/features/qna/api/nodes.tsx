// GET /api/qna/nodes?subject=patent — 과목의 체계도 노드 목록(예상문제/쟁점 대상 선택용).
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import { listSubjectNodes } from "../lib/target-resolve.server";

import type { Route } from "./+types/nodes";

const schema = z.object({ subject: z.string().min(1) });

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false as const, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const parsed = schema.safeParse({ subject: url.searchParams.get("subject") });
  if (!parsed.success) {
    return data({ ok: false as const, nodes: [] }, { status: 400 });
  }
  const nodes = await listSubjectNodes(client, parsed.data.subject);
  return data({ ok: true as const, nodes });
}
