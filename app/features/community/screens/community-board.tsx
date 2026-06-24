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

import {
  type PasserSummary,
  listPasserSummaries,
} from "~/features/exam-results/analytics.server";

import { BOARD_ICON } from "../components/board-icon";
import { BOARD_DESC, BOARD_LABEL, communityBoardSchema } from "../labels";
import { type PopularPostItem, listPopularPosts } from "../popular.server";
import { listPosts } from "../queries.server";

import type { Route } from "./+types/community-board";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: `${loaderData ? BOARD_LABEL[loaderData.board] : "커뮤니티"} | 리담변리사학원`,
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

  // feat-6-006 — review 보드는 합격 후기 필터 추가.
  const yearRaw = url.searchParams.get("year");
  const roundRaw = url.searchParams.get("round");
  const yearFilter =
    yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  const roundFilter: "first" | "second" | null =
    roundRaw === "first" || roundRaw === "second" ? roundRaw : null;

  const [result, popular, passerSummaries] = await Promise.all([
    listPosts(client, {
      board: boardParse.data,
      query,
      page,
      pageSize: 20,
      userId: user.id,
    }),
    listPopularPosts(client, { board: boardParse.data, days: 7, limit: 3 }),
    boardParse.data === "review"
      ? listPasserSummaries({
          year: yearFilter,
          round: roundFilter,
          limit: 20,
          // 학생/일반 사용자 화면 — 합성 후기 노출 금지.
          excludeSynthetic: true,
        })
      : Promise.resolve([] as PasserSummary[]),
  ]);
  return {
    board: boardParse.data,
    posts: result.items,
    popular,
    passerSummaries,
    passerFilters: { year: yearFilter, round: roundFilter },
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    query,
    currentUserId: user.id,
  };
}

export default function CommunityBoard({ loaderData }: Route.ComponentProps) {
  const {
    board,
    posts,
    popular,
    passerSummaries,
    passerFilters,
    total,
    page,
    pageSize,
    query,
    currentUserId,
  } = loaderData;
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
      {/* feat-6-006 — review 보드: 합격자 후기 섹션 */}
      {board === "review" ? (
        <PasserSummariesSection
          items={passerSummaries}
          filters={passerFilters}
        />
      ) : null}

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

// ─── feat-6-006 합격자 후기 통합 ───

function PasserSummariesSection({
  items,
  filters,
}: {
  items: PasserSummary[];
  filters: { year: number | null; round: "first" | "second" | null };
}) {
  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];
  return (
    <section className="mb-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
          공식 합격자 후기
        </p>
        <Form method="get" className="flex items-center gap-2 text-[11px]">
          <select
            name="year"
            defaultValue={filters.year ? String(filters.year) : ""}
            className="border-input bg-background focus:border-primary h-7 rounded-md border px-2 text-[11px] outline-none"
          >
            <option value="">전체 연도</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            name="round"
            defaultValue={filters.round ?? ""}
            className="border-input bg-background focus:border-primary h-7 rounded-md border px-2 text-[11px] outline-none"
          >
            <option value="">전체 차수</option>
            <option value="first">1차</option>
            <option value="second">2차</option>
          </select>
          <Button type="submit" size="sm" variant="outline" className="h-7">
            적용
          </Button>
        </Form>
      </div>
      {items.length === 0 ? (
        <div className="border-border bg-muted/30 text-muted-foreground rounded-xl border border-dashed py-6 text-center text-xs">
          조건에 맞는 공식 합격 후기가 없습니다.
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.slice(0, 6).map((s) => (
            <li key={s.resultId}>
              <div className="border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-700/40 dark:bg-emerald-950/20 rounded-xl border p-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Chip tone="emerald">합격</Chip>
                  <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                    {s.examYear} · {s.examRound === "first" ? "1차" : "2차"}
                  </span>
                  {s.scoreBucket ? (
                    <Chip tone="primary">{s.scoreBucket}</Chip>
                  ) : null}
                  {s.verified ? <Chip tone="outline">인증</Chip> : null}
                </div>
                <p className="text-foreground/85 line-clamp-3 text-[12.5px] leading-relaxed whitespace-pre-line">
                  {s.summaryMd}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 ? (
        <p className="text-muted-foreground mt-2 text-right text-[11px]">
          전체 {items.length}건 — 필터 좁혀 확인
        </p>
      ) : null}
    </section>
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
