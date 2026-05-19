// 커뮤니티 글 상세 + 댓글 — `/community/:board/:postId`. feat-6-002.
import {
  MessageSquareIcon,
  PencilIcon,
  PinIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, redirect, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { CommunityShell } from "~/features/community/components/community-shell";
import { Chip, relativeKo } from "~/features/community/components/community-ui";

import {
  BOARD_LABEL,
  communityBoardSchema,
  type CommunityComment,
  type CommunityPostDetail,
} from "../labels";
import { getPost, listComments } from "../queries.server";

import type { Route } from "./+types/community-post-detail";

export const meta: Route.MetaFunction = ({ data: loaderData }) => [
  {
    title: `${loaderData ? loaderData.post.title : "커뮤니티"} | Lidam Patent Attorney Academy`,
  },
];

export async function loader({ request, params }: Route.LoaderArgs) {
  const boardParse = communityBoardSchema.safeParse(params.board);
  if (!boardParse.success || !params.postId) {
    throw data("글을 찾을 수 없습니다", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    throw redirect("/login");
  }

  const post = await getPost(client, params.postId);
  if (!post || post.board !== boardParse.data) {
    throw data("글을 찾을 수 없습니다", { status: 404 });
  }
  const comments = await listComments(client, post.postId);

  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", user.id)
    .maybeSingle();

  return {
    post,
    comments,
    currentUserId: user.id,
    isManager: roleAtLeast(profile?.role, "manager"),
  };
}

export default function CommunityPostDetail({
  loaderData,
}: Route.ComponentProps) {
  const { post, comments, currentUserId, isManager } = loaderData;
  const isAuthor = post.author?.id === currentUserId;
  const isStudy = post.board === "study";

  return (
    <CommunityShell
      category="community"
      title={BOARD_LABEL[post.board]}
      backLink={{ to: `/community/${post.board}`, label: BOARD_LABEL[post.board] }}
      width="narrow"
    >
      <article className="border-border bg-card mb-3.5 rounded-2xl border p-5 shadow-sm md:p-6">
        {post.isPinned || isStudy ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {post.isPinned ? (
              <Chip tone="primary">
                <PinIcon className="size-2.5" /> 고정
              </Chip>
            ) : null}
            {isStudy ? (
              <Chip tone={post.closedAt ? "neutral" : "emerald"}>
                {post.closedAt ? "모집 마감" : "모집 중"}
              </Chip>
            ) : null}
          </div>
        ) : null}
        <h2 className="text-[22px] leading-snug font-extrabold tracking-tight">
          {post.title}
        </h2>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold">
            {(post.author?.name ?? "?").slice(0, 1)}
          </span>
          <span className="text-[13px] font-bold">
            {post.author?.name ?? "알 수 없음"}
          </span>
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {new Date(post.createdAt).toLocaleString("ko-KR")}
          </span>
        </div>
        <p className="text-foreground/85 mt-3.5 text-[15px] leading-[1.85] whitespace-pre-line">
          {post.bodyMd}
        </p>
      </article>

      {isAuthor || isManager ? (
        <PostActions
          post={post}
          isAuthor={isAuthor}
          isManager={isManager}
          isStudy={isStudy}
        />
      ) : null}

      <CommentSection
        postId={post.postId}
        comments={comments}
        currentUserId={currentUserId}
        isManager={isManager}
      />
    </CommunityShell>
  );
}

function PostActions({
  post,
  isAuthor,
  isManager,
  isStudy,
}: {
  post: CommunityPostDetail;
  isAuthor: boolean;
  isManager: boolean;
  isStudy: boolean;
}) {
  const pinFetcher = useFetcher();
  const closeFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border-border bg-card mb-3.5 flex flex-wrap items-center gap-2 rounded-2xl border p-3 shadow-sm">
      {isAuthor ? (
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link
            to={`/community/${post.board}/${post.postId}/edit`}
            viewTransition
          >
            <PencilIcon className="size-3.5" /> 수정
          </Link>
        </Button>
      ) : null}

      {isStudy ? (
        <closeFetcher.Form method="post" action="/api/community/post">
          <input type="hidden" name="intent" value="close" />
          <input type="hidden" name="postId" value={post.postId} />
          <input
            type="hidden"
            name="closed"
            value={post.closedAt ? "false" : "true"}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={closeFetcher.state !== "idle"}
          >
            {post.closedAt ? "모집 재개" : "모집 마감"}
          </Button>
        </closeFetcher.Form>
      ) : null}

      {isManager ? (
        <pinFetcher.Form method="post" action="/api/community/post">
          <input type="hidden" name="intent" value="pin" />
          <input type="hidden" name="postId" value={post.postId} />
          <input
            type="hidden"
            name="pinned"
            value={post.isPinned ? "false" : "true"}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={pinFetcher.state !== "idle"}
          >
            <PinIcon className="size-3.5" />
            {post.isPinned ? "고정 해제" : "고정"}
          </Button>
        </pinFetcher.Form>
      ) : null}

      <div className="ml-auto">
        {confirmDelete ? (
          <deleteFetcher.Form
            method="post"
            action="/api/community/post"
            className="flex items-center gap-1.5"
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="postId" value={post.postId} />
            <span className="text-muted-foreground text-xs">삭제할까요?</span>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              className="rounded-full"
              disabled={deleteFetcher.state !== "idle"}
            >
              삭제
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => setConfirmDelete(false)}
            >
              취소
            </Button>
          </deleteFetcher.Form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full text-rose-600 dark:text-rose-400"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon className="size-3.5" /> 삭제
          </Button>
        )}
      </div>
    </div>
  );
}

function CommentSection({
  postId,
  comments,
  currentUserId,
  isManager,
}: {
  postId: string;
  comments: CommunityComment[];
  currentUserId: string;
  isManager: boolean;
}) {
  return (
    <section className="border-border bg-card rounded-2xl border p-5 shadow-sm md:p-6">
      <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
        <MessageSquareIcon className="size-4" /> 댓글 {comments.length}
      </h3>

      {comments.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.commentId}
              comment={comment}
              canDelete={comment.author?.id === currentUserId || isManager}
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-4 text-[13px]">
          첫 댓글을 남겨보세요.
        </p>
      )}

      <CommentForm postId={postId} />
    </section>
  );
}

function CommentItem({
  comment,
  canDelete,
}: {
  comment: CommunityComment;
  canDelete: boolean;
}) {
  const fetcher = useFetcher();
  // 삭제 제출 중에는 낙관적으로 숨긴다 (성공 시 revalidate 로 사라짐).
  if (fetcher.state !== "idle") return null;

  return (
    <li className="border-border border-b pb-3 last:border-0 last:pb-0">
      <div className="flex items-center gap-2">
        <span className="bg-muted inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold">
          {(comment.author?.name ?? "?").slice(0, 1)}
        </span>
        <span className="text-[13px] font-bold">
          {comment.author?.name ?? "알 수 없음"}
        </span>
        <span className="text-muted-foreground text-[11px] tabular-nums">
          {relativeKo(comment.createdAt)}
        </span>
        {canDelete ? (
          <fetcher.Form
            method="post"
            action="/api/community/comment"
            className="ml-auto"
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="commentId" value={comment.commentId} />
            <button
              type="submit"
              className="text-muted-foreground hover:text-rose-600 text-[11px] font-medium dark:hover:text-rose-400"
            >
              삭제
            </button>
          </fetcher.Form>
        ) : null}
      </div>
      <p className="text-foreground/85 mt-1.5 text-sm leading-relaxed whitespace-pre-line">
        {comment.bodyMd}
      </p>
    </li>
  );
}

function CommentForm({ postId }: { postId: string }) {
  const fetcher = useFetcher();
  const [body, setBody] = useState("");
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    const result = fetcher.data;
    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      result.ok === true
    ) {
      setBody("");
    }
  }, [fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      action="/api/community/comment"
      className="border-border mt-4 border-t pt-4"
    >
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="postId" value={postId} />
      <Textarea
        name="bodyMd"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="댓글을 입력하세요"
        rows={3}
        maxLength={5000}
        className="text-sm leading-relaxed"
        required
      />
      <div className="mt-2 flex justify-end">
        <Button
          type="submit"
          size="sm"
          className="rounded-full"
          disabled={isSubmitting || !body.trim()}
        >
          댓글 등록 <SendIcon className="size-3.5" />
        </Button>
      </div>
    </fetcher.Form>
  );
}
