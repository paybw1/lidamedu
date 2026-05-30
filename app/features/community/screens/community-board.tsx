// 커뮤니티 게시판 목록 — `/community/:board`. feat-6-002.
import {
  MessageSquarePlusIcon,
  PinIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react";
import { Form, Link, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { CommunityShell } from "~/features/community/components/community-shell";
import {
  Chip,
  EmptyState,
  relativeKo,
} from "~/features/community/components/community-ui";

import { BOARD_ICON } from "../components/board-icon";
import { BOARD_DESC, BOARD_LABEL, communityBoardSchema } from "../labels";
import { type PopularPostItem, listPopularPosts } from "../popular.server";
import { listPosts } from "../queries.server";

import type { Route } from "./+types/community-board";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: `${loaderData ? BOARD_LABEL[loaderData.board] : "커뮤니티"} | Lidam Patent Attorney Academy`,
  },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const boardParse = communityBoardSchema.safeParse(params.board);
  if (!boardParse.success) {
    throw data("게시판을 찾을 수 없습니다", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const [result, popular] = await Promise.all([
    listPosts(client, {
      board: boardParse.data,
      query,
      page,
      pageSize: 20,
      userId: user.id,
    }),
    listPopularPosts(client, { board: boardParse.data, days: 7, limit: 3 }),
  ]);
  return {
    board: boardParse.data,
    posts: result.items,
    popular,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    query,
    currentUserId: user.id,
  };
}

export default function CommunityBoard({ loaderData }: Route.ComponentProps) {
  const { board, posts, popular, total, page, pageSize, query, currentUserId } =
    loaderData;
  const Icon = BOARD_ICON[board];
  const filterActive = query.trim().length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <CommunityShell
      category={board}
      title={BOARD_LABEL[board]}
      desc={BOARD_DESC[board]}
      headerRight={
        <Button asChild size="sm" className="h-9 rounded-full">
          <Link to={`/community/${board}/new`} viewTransition>
            <MessageSquarePlusIcon className="size-4" /> 글쓰기
          </Link>
        </Button>
      }
    >
      {/* feat-6-003 — 이번 주 BEST */}
      {popular.length > 0 ? <PopularSection items={popular} board={board} /> : null}

      <Form
        method="get"
        className="border-border bg-card mb-3.5 flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm"
      >
        <div className="relative min-w-[200px] flex-1 basis-[240px] sm:max-w-[320px]">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={`${BOARD_LABEL[board]} 검색`}
            aria-label="게시글 검색"
            className="bg-muted/60 focus:bg-background focus:border-primary h-9 w-full rounded-full border border-transparent pr-3 pl-9 text-[13px] outline-none"
          />
        </div>
        <Button type="submit" size="sm" className="h-9 rounded-full">
          검색
        </Button>
      </Form>

      {posts.length === 0 ? (
        <EmptyState
          icon={filterActive ? SearchXIcon : Icon}
          tone={filterActive ? "subdued" : "neutral"}
          title={
            filterActive ? "조건에 맞는 글이 없습니다" : "아직 글이 없습니다"
          }
          body={
            filterActive
              ? "검색어를 바꿔 다시 찾아보세요."
              : "첫 글을 남겨 게시판을 열어보세요."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => {
            const isMine = post.author?.id === currentUserId;
            return (
              <li key={post.postId}>
                <Link
                  to={`/community/${board}/${post.postId}`}
                  viewTransition
                  className={cn(
                    "block rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                    post.isPinned
                      ? "border-primary/30 bg-primary/[0.04]"
                      : "border-border bg-card hover:border-primary/30",
                  )}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {post.isPinned ? (
                      <Chip tone="primary">
                        <PinIcon className="size-2.5" /> 고정
                      </Chip>
                    ) : null}
                    {board === "study" ? (
                      <Chip tone={post.closedAt ? "neutral" : "emerald"}>
                        {post.closedAt ? "모집 마감" : "모집 중"}
                      </Chip>
                    ) : null}
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
                    {post.likeCount > 0 ? ` · ♥ ${post.likeCount}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* feat-6 v2.1 — 페이지네이션 */}
      {totalPages > 1 ? (
        <nav
          className="mt-4 flex items-center justify-center gap-1"
          aria-label="페이지"
        >
          {page > 1 ? (
            <Link
              to={`/community/${board}?page=${page - 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className="border-border hover:bg-muted rounded-md border px-3 py-1 text-xs"
            >
              ← 이전
            </Link>
          ) : null}
          <span className="text-muted-foreground tabular-nums px-3 text-xs">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              to={`/community/${board}?page=${page + 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              className="border-border hover:bg-muted rounded-md border px-3 py-1 text-xs"
            >
              다음 →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </CommunityShell>
  );
}

// ─── feat-6-003 이번 주 BEST ───

function PopularSection({
  items,
  board,
}: {
  items: PopularPostItem[];
  board: string;
}) {
  return (
    <section className="mb-3.5">
      <p className="text-muted-foreground mb-2 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
        이번 주 화제 (7일)
      </p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {items.map((it, i) => (
          <li key={it.postId}>
            <Link
              to={`/community/${board}/${it.postId}`}
              viewTransition
              className="border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08] hover:border-primary block h-full rounded-xl border p-3 transition-colors"
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className="bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full text-[10px] font-extrabold">
                  {i + 1}
                </span>
                <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                  ♡{it.likeCount} · 💬{it.commentCount} · 👁{it.viewCount}
                </span>
              </div>
              <p className="line-clamp-2 text-sm font-bold leading-snug tracking-tight">
                {it.title}
              </p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                {it.authorName}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
