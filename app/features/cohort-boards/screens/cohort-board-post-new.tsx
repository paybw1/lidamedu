// feat-6-010 반별 게시판 — 글 작성/수정. /cohort-boards/:boardId/new · /cohort-boards/:boardId/:postId/edit.
import { SendIcon } from "lucide-react";
import { useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";

import { CohortBoardShell } from "../components/cohort-board-shell";
import { canWriteBoard, getBoardMeta, getBoardPost } from "../queries.server";

import type { Route } from "./+types/cohort-board-post-new";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: `${d?.mode === "edit" ? "글 수정" : "새 글 작성"} | Lidam Patent Attorney Academy`,
  },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const { boardId, postId } = params;
  if (!boardId) throw data("게시판을 찾을 수 없습니다", { status: 404 });
  const board = await getBoardMeta(client, boardId);
  if (!board) throw data("게시판을 찾을 수 없습니다", { status: 404 });

  if (postId) {
    const post = await getBoardPost(client, postId);
    if (!post || post.boardId !== boardId)
      throw data("글을 찾을 수 없습니다", { status: 404 });
    if (post.author?.profileId !== user.id)
      throw data("수정 권한이 없습니다", { status: 403 });
    return { mode: "edit" as const, board, post };
  }

  // 새 글 — RLS 와 동일 판정으로 작성 권한 사전 가드(실차단은 insert RLS).
  const canWrite = await canWriteBoard(client, boardId, user.id);
  if (!canWrite) throw data("작성 권한이 없습니다", { status: 403 });
  return { mode: "create" as const, board, post: null };
}

export default function CohortBoardPostNew({
  loaderData,
}: Route.ComponentProps) {
  const { mode, board, post } = loaderData;
  const isEdit = mode === "edit";
  const fetcher = useFetcher();
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.bodyMd ?? "");

  const isSubmitting = fetcher.state !== "idle";
  const failed =
    fetcher.state === "idle" &&
    fetcher.data &&
    typeof fetcher.data === "object" &&
    "ok" in fetcher.data &&
    fetcher.data.ok === false;
  const cancelHref =
    isEdit && post
      ? `/cohort-boards/${board.boardId}/${post.postId}`
      : `/cohort-boards/${board.boardId}`;

  return (
    <CohortBoardShell
      title={isEdit ? "글 수정" : "새 글 작성"}
      desc={board.title}
      backLink={{ to: cancelHref, label: board.title }}
      width="narrow"
    >
      <div className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
        <fetcher.Form method="post" action="/api/cohort-board/post">
          <input
            type="hidden"
            name="intent"
            value={isEdit ? "update" : "create"}
          />
          {isEdit && post ? (
            <input type="hidden" name="postId" value={post.postId} />
          ) : (
            <input type="hidden" name="boardId" value={board.boardId} />
          )}

          <label className="block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              제목
            </span>
            <Input
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="text-muted-foreground mb-1.5 block font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
              내용
            </span>
            <Textarea
              name="bodyMd"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="내용을 입력하세요"
              rows={12}
              maxLength={20000}
              className="text-sm leading-relaxed"
              required
            />
          </label>

          {failed ? (
            <p className="mt-3 text-[13px] font-medium text-rose-600 dark:text-rose-400">
              저장에 실패했습니다. 입력 내용을 확인해 주세요.
            </p>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              type="button"
              className="rounded-full"
            >
              <Link to={cancelHref} viewTransition>
                취소
              </Link>
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-full"
              disabled={isSubmitting || !title.trim() || !body.trim()}
            >
              {isEdit ? "수정 완료" : "등록"} <SendIcon className="size-3.5" />
            </Button>
          </div>
        </fetcher.Form>
      </div>
    </CohortBoardShell>
  );
}
