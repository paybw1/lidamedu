// feat-6-010 반별 게시판 — 게시판 글 목록. write_scope 에 따라 글쓰기 노출(실차단은 RLS).
import { FileTextIcon, MessageSquarePlusIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  Chip,
  EmptyState,
  relativeKo,
} from "~/features/community/components/community-ui";

import { CohortBoardShell } from "../components/cohort-board-shell";
import { WRITE_SCOPE_SHORT } from "../labels";
import {
  canWriteBoard,
  getBoardMeta,
  listBoardPosts,
} from "../queries.server";

import type { Route } from "./+types/cohort-board-detail";

export const meta: Route.MetaFunction = ({ data: d }) => [
  {
    title: `${d?.board.title ?? "반별 게시판"} | Lidam Patent Attorney Academy`,
  },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const boardId = params.boardId;
  if (!boardId) throw data("게시판을 찾을 수 없습니다", { status: 404 });
  const board = await getBoardMeta(client, boardId);
  if (!board) throw data("게시판을 찾을 수 없습니다", { status: 404 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const [posts, canWrite] = await Promise.all([
    listBoardPosts(client, boardId, { page }),
    canWriteBoard(client, boardId, user.id),
  ]);
  return {
    board,
    posts: posts.items,
    total: posts.total,
    page: posts.page,
    pageSize: posts.pageSize,
    canWrite,
    currentUserId: user.id,
  };
}

export default function CohortBoardDetail({
  loaderData,
}: Route.ComponentProps) {
  const { board, posts, total, page, pageSize, canWrite, currentUserId } =
    loaderData;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <CohortBoardShell
      title={board.title}
      desc={
        board.description ??
        (board.writeScope === "staff" ? "공지형 게시판" : "소통형 게시판")
      }
      backLink={{ to: "/cohort-boards", label: "반별 게시판" }}
      headerRight={
        canWrite ? (
          <Button asChild size="sm" className="h-9 rounded-full">
            <Link to={`/cohort-boards/${board.boardId}/new`} viewTransition>
              <MessageSquarePlusIcon className="size-4" /> 글쓰기
            </Link>
          </Button>
        ) : (
          <Chip tone="amber">{WRITE_SCOPE_SHORT[board.writeScope]} · 강사만 작성</Chip>
        )
      }
    >
      {posts.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          tone="neutral"
          title="아직 글이 없습니다"
          body={
            canWrite
              ? "첫 글을 남겨 게시판을 열어보세요."
              : "등록된 글이 없습니다."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => {
            const isMine = post.author?.profileId === currentUserId;
            return (
              <li key={post.postId}>
                <Link
                  to={`/cohort-boards/${board.boardId}/${post.postId}`}
                  viewTransition
                  className={cn(
                    "block rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                    post.isPinned
                      ? "border-primary/30 bg-primary/[0.04]"
                      : "border-border bg-card hover:border-primary/30",
                  )}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {post.isPinned ? <Chip tone="primary">고정</Chip> : null}
                    {isMine ? <Chip tone="outline">내 글</Chip> : null}
                    <span className="text-muted-foreground ml-auto text-[11px] font-medium tabular-nums">
                      {relativeKo(post.createdAt)}
                    </span>
                  </div>
                  <p className="text-[15px] leading-snug font-bold tracking-tight">
                    {post.title}
                  </p>
                  <p className="text-muted-foreground mt-1 text-[13px]">
                    {post.author?.name ?? "알 수 없음"}
                    {post.commentCount > 0 ? ` · 댓글 ${post.commentCount}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav
          className="mt-4 flex items-center justify-center gap-1"
          aria-label="페이지"
        >
          {page > 1 ? (
            <Link
              to={`/cohort-boards/${board.boardId}?page=${page - 1}`}
              className="border-border hover:bg-muted rounded-md border px-3 py-1 text-xs"
            >
              ← 이전
            </Link>
          ) : null}
          <span className="text-muted-foreground px-3 text-xs tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              to={`/cohort-boards/${board.boardId}?page=${page + 1}`}
              className="border-border hover:bg-muted rounded-md border px-3 py-1 text-xs"
            >
              다음 →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </CohortBoardShell>
  );
}
