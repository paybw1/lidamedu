// 커뮤니티 허브 — 게시판 3종 카드 + 각 최신글. feat-6-002.
import { MessageSquarePlusIcon, PinIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { CommunityShell } from "~/features/community/components/community-shell";
import { relativeKo } from "~/features/community/components/community-ui";

import { BOARD_ICON } from "../components/board-tabs";
import { BOARD_DESC, BOARD_LABEL, COMMUNITY_BOARDS } from "../labels";
import { listPosts } from "../queries.server";

import type { Route } from "./+types/community";

export const meta: Route.MetaFunction = () => [
  { title: "커뮤니티 | Lidam Patent Attorney Academy" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }
  const [free, study, review] = await Promise.all([
    listPosts(client, { board: "free", limit: 5 }),
    listPosts(client, { board: "study", limit: 5 }),
    listPosts(client, { board: "review", limit: 5 }),
  ]);
  return { postsByBoard: { free, study, review } };
}

export default function Community({ loaderData }: Route.ComponentProps) {
  const { postsByBoard } = loaderData;

  return (
    <CommunityShell
      category="community"
      title="커뮤니티"
      desc="수험생끼리 학습 자료와 후기를 나누는 게시판입니다 — 자유게시판 · 스터디 모집 · 합격 후기."
    >
      <div className="grid gap-4 md:grid-cols-3">
        {COMMUNITY_BOARDS.map((board) => {
          const Icon = BOARD_ICON[board];
          const posts = postsByBoard[board];
          return (
            <section
              key={board}
              className="border-border bg-card flex flex-col rounded-2xl border p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="bg-violet-500/15 text-violet-700 dark:text-violet-300 inline-flex size-9 shrink-0 items-center justify-center rounded-xl">
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[15px] font-bold tracking-tight">
                    {BOARD_LABEL[board]}
                  </h2>
                  <p className="text-muted-foreground truncate text-xs">
                    {BOARD_DESC[board]}
                  </p>
                </div>
              </div>

              <ul className="mt-3 flex flex-1 flex-col gap-0.5">
                {posts.length === 0 ? (
                  <li className="text-muted-foreground py-6 text-center text-[13px]">
                    아직 글이 없습니다
                  </li>
                ) : (
                  posts.map((post) => (
                    <li key={post.postId}>
                      <Link
                        to={`/community/${board}/${post.postId}`}
                        viewTransition
                        className="hover:bg-muted/60 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors"
                      >
                        {post.isPinned ? (
                          <PinIcon className="text-primary size-3 shrink-0" />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {post.title}
                        </span>
                        {post.commentCount > 0 ? (
                          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                            [{post.commentCount}]
                          </span>
                        ) : null}
                        <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                          {relativeKo(post.createdAt)}
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>

              <div className="border-border mt-3 flex items-center justify-between border-t pt-3">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full text-xs"
                >
                  <Link to={`/community/${board}`} viewTransition>
                    전체 보기
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="h-8 rounded-full text-xs"
                >
                  <Link to={`/community/${board}/new`} viewTransition>
                    <MessageSquarePlusIcon className="size-3.5" /> 글쓰기
                  </Link>
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </CommunityShell>
  );
}
