// feat-6-008 스터디 join/leave API.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import { getPost } from "../queries.server";
import { joinStudy, leaveStudy } from "../study-members.server";

import type { Route } from "./+types/study-join";

const Schema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("join"), postId: z.string().uuid() }),
  z.object({ intent: z.literal("leave"), postId: z.string().uuid() }),
]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "unauthorized" }, { status: 401 });

  const parsed = Schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input" },
      { status: 400 },
    );
  }

  const post = await getPost(client, parsed.data.postId);
  if (!post) return data({ ok: false, error: "not-found" }, { status: 404 });
  if (post.board !== "study") {
    return data({ ok: false, error: "not-study-board" }, { status: 400 });
  }

  if (parsed.data.intent === "join") {
    if (post.closedAt) {
      return data({ ok: false, error: "closed" }, { status: 400 });
    }
    const result = await joinStudy(
      client,
      parsed.data.postId,
      user.id,
      post.maxMembers ?? null,
    );
    if (!result.ok) {
      return data({ ok: false, error: result.error }, { status: 400 });
    }
    return data({ ok: true });
  }

  const result = await leaveStudy(client, parsed.data.postId, user.id);
  if (!result.ok) {
    return data({ ok: false, error: result.error }, { status: 400 });
  }
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
