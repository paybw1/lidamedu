// 통합 코멘트 패널 — 조문/판례/문제 공용.
// staff 작성, 학생 read-only. 다중 코멘트 + 핀 + 수정/삭제.
// feat-8-022: 코멘트는 두 형태 — 텍스트형(anchor=null) / 하이라이트형(anchor!=null).
//   하이라이트형은 본문 발췌(label)를 색 박스로, 메모(body_md)를 그 아래에 보인다.
//   패널의 작성 폼은 텍스트형만 — 하이라이트형은 본문 선택 툴바에서 작성한다.

import {
  EditIcon,
  EyeIcon,
  HighlighterIcon,
  MessageSquarePlusIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  UnderlineIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";
import type {
  CommentHighlightColor,
  CommentTargetType,
  ContentComment,
} from "~/features/comments/queries.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

// 하이라이트형 코멘트 발췌 박스 색 — <mark> 스타일.
const ANCHOR_MARK_CLASS: Record<CommentHighlightColor, string> = {
  green:
    "border-emerald-300 bg-emerald-100/80 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-100",
  yellow:
    "border-amber-300 bg-amber-100/80 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100",
  red: "border-rose-300 bg-rose-100/80 text-rose-900 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-100",
  blue: "border-sky-300 bg-sky-100/80 text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100",
};

interface CommentsPanelProps {
  targetType: CommentTargetType;
  targetId: string;
  comments: ContentComment[];
  /** staff 인지 (작성 가능 여부) */
  isStaff: boolean;
  /** 현재 사용자 id — 자기 코멘트 수정/삭제 권한 판정 */
  currentUserId: string | null;
  /** admin 인지 — 모든 코멘트 수정/삭제 가능 */
  isAdmin: boolean;
  /** 빈 상태 안내 텍스트 (기본: "아직 코멘트가 없습니다") */
  emptyHint?: string;
}

export function CommentsPanel({
  targetType,
  targetId,
  comments,
  isStaff,
  currentUserId,
  isAdmin,
  emptyHint = "아직 등록된 코멘트가 없습니다",
}: CommentsPanelProps) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-2" data-testid={`comments-${targetType}-${targetId}`}>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          코멘트 · 평석 ({comments.length})
        </p>
        {isStaff ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setCreating((c) => !c)}
          >
            <MessageSquarePlusIcon className="size-3" />
            {creating ? "취소" : "코멘트 추가"}
          </Button>
        ) : null}
      </div>

      {/* 작성 폼은 텍스트형 코멘트 전용 — 하이라이트형은 본문 선택 툴바에서 작성. */}
      {creating && isStaff ? (
        <>
          <CommentForm
            targetType={targetType}
            targetId={targetId}
            mode="create"
            isAnchored={false}
            onDone={() => setCreating(false)}
          />
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            본문 구간에 앵커되는 <strong>하이라이트형 코멘트</strong>는 본문에서
            텍스트를 선택한 뒤 툴바의 [코멘트] 버튼으로 작성하세요.
          </p>
        </>
      ) : null}

      {comments.length === 0 && !creating ? (
        <p className="text-muted-foreground text-xs italic">{emptyHint}</p>
      ) : null}

      <ul className="space-y-2">
        {comments.map((c) => (
          <CommentRow
            key={c.commentId}
            comment={c}
            canEdit={
              isAdmin || (currentUserId !== null && c.authorId === currentUserId)
            }
            isAdmin={isAdmin}
          />
        ))}
      </ul>
    </div>
  );
}

function CommentRow({
  comment,
  canEdit,
  isAdmin,
}: {
  comment: ContentComment;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";
  const anchored = comment.anchor !== null;

  return (
    <li
      className={cn(
        "rounded-md border bg-card px-3 py-2",
        comment.isPinned && "border-amber-300 bg-amber-50/40",
      )}
      data-testid={`comment-${comment.commentId}`}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px]">
          {comment.isPinned ? (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]"
            >
              <PinIcon className="mr-1 size-3" />
              고정
            </Badge>
          ) : null}
          {anchored ? (
            <Badge
              variant="outline"
              className="border-primary/30 bg-primary/10 text-primary text-[10px]"
            >
              <HighlighterIcon className="mr-1 size-3" />
              본문 하이라이트
            </Badge>
          ) : null}
          <span className="font-semibold">
            {comment.authorName ?? "(작성자 없음)"}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {comment.updatedAt.slice(0, 10)}
          </span>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            {isAdmin ? (
              <fetcher.Form method="post" action="/api/comments/comment" className="inline">
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="commentId" value={comment.commentId} />
                <input
                  type="hidden"
                  name="isPinned"
                  value={comment.isPinned ? "false" : "true"}
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[10px]"
                  disabled={submitting}
                  title={comment.isPinned ? "고정 해제" : "고정"}
                >
                  {comment.isPinned ? (
                    <PinOffIcon className="size-3" />
                  ) : (
                    <PinIcon className="size-3" />
                  )}
                </Button>
              </fetcher.Form>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => setEditing((e) => !e)}
              disabled={submitting}
            >
              <EditIcon className="size-3" />
            </Button>
            <fetcher.Form method="post" action="/api/comments/comment" className="inline">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="commentId" value={comment.commentId} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px] text-rose-600 hover:text-rose-700"
                disabled={submitting}
                onClick={(e) => {
                  if (!confirm("이 코멘트를 삭제하시겠습니까?")) {
                    e.preventDefault();
                  }
                }}
              >
                <Trash2Icon className="size-3" />
              </Button>
            </fetcher.Form>
          </div>
        ) : null}
      </div>

      {/* 하이라이트형: 본문 발췌를 색 박스로 노출. */}
      {anchored && comment.anchor ? (
        <blockquote
          className={cn(
            "mb-1.5 rounded-sm border-l-4 px-2 py-1 text-xs leading-relaxed",
            ANCHOR_MARK_CLASS[comment.anchor.color],
          )}
        >
          <mark className="bg-transparent text-inherit">
            {comment.anchor.label ?? "(발췌 없음)"}
          </mark>
        </blockquote>
      ) : null}

      {editing ? (
        <CommentForm
          targetType={comment.targetType}
          targetId={comment.targetId}
          mode="update"
          commentId={comment.commentId}
          initialBodyMd={comment.bodyMd}
          isAnchored={anchored}
          onDone={() => setEditing(false)}
        />
      ) : comment.bodyMd && comment.bodyMd.trim().length > 0 ? (
        <MarkdownView text={comment.bodyMd} className="text-sm" />
      ) : anchored ? (
        <p className="text-muted-foreground text-xs italic">
          메모 없는 하이라이트 코멘트
        </p>
      ) : null}
    </li>
  );
}

interface CommentFormProps {
  targetType: CommentTargetType;
  targetId: string;
  mode: "create" | "update";
  commentId?: string;
  /** 수정 대상 코멘트의 기존 메모. 하이라이트형은 null 일 수 있다. */
  initialBodyMd?: string | null;
  /** 하이라이트형 코멘트인지 — 메모를 비워둘 수 있다 (required 해제). */
  isAnchored: boolean;
  onDone: () => void;
}

function CommentForm({
  targetType,
  targetId,
  mode,
  commentId,
  initialBodyMd,
  isAnchored,
  onDone,
}: CommentFormProps) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const submitting = fetcher.state !== "idle";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBodyMd ?? "");
  const [previewing, setPreviewing] = useState(false);

  // 성공 시 onDone 호출
  if (fetcher.data?.ok && !submitting) {
    setTimeout(() => onDone(), 0);
  }

  // textarea 의 현재 선택 영역을 open/close 태그로 감싼다.
  // 선택 영역이 비어 있으면 placeholder("강조") 를 삽입하고 그 부분을 다시 선택해
  // 사용자가 바로 이어서 타이핑하도록 한다.
  function wrapSelection(open: string, close: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const before = body.slice(0, start);
    const selectedRaw = body.slice(start, end);
    const placeholder = "강조";
    const selected = selectedRaw.length > 0 ? selectedRaw : placeholder;
    const after = body.slice(end);
    const next = `${before}${open}${selected}${close}${after}`;
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const ns = start + open.length;
      const ne = ns + selected.length;
      ta.setSelectionRange(ns, ne);
    });
  }

  return (
    <fetcher.Form
      method="post"
      action="/api/comments/comment"
      className="space-y-2 rounded-md border bg-muted/30 p-2"
      onSubmit={(e) => {
        // 하이라이트형 코멘트를 빈 메모로 수정 — 바꿀 내용이 없으므로 그냥 닫는다.
        if (mode === "update" && isAnchored && body.trim().length === 0) {
          e.preventDefault();
          onDone();
        }
      }}
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "create" ? (
        <>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
        </>
      ) : (
        <input type="hidden" name="commentId" value={commentId} />
      )}

      <div className="flex flex-wrap items-center gap-1 border-b pb-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => wrapSelection("<mark>", "</mark>")}
          disabled={previewing || submitting}
          title="선택한 텍스트에 노란 형광펜 강조"
        >
          <HighlighterIcon className="mr-1 size-3" />
          하이라이트
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => wrapSelection("<u>", "</u>")}
          disabled={previewing || submitting}
          title="선택한 텍스트에 밑줄"
        >
          <UnderlineIcon className="mr-1 size-3" />
          밑줄
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2 text-xs"
          onClick={() => setPreviewing((p) => !p)}
          disabled={submitting}
          title="입력한 마크다운/강조 결과 미리보기"
        >
          <EyeIcon className="mr-1 size-3" />
          {previewing ? "편집" : "미리보기"}
        </Button>
      </div>

      <Textarea
        ref={textareaRef}
        name="bodyMd"
        rows={5}
        // 하이라이트형 코멘트는 메모가 없을 수 있어 required 해제.
        required={!isAnchored}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          isAnchored
            ? "하이라이트 설명 메모 (선택). Markdown · <mark> · <u> 지원"
            : "코멘트 / 평석을 입력하세요. 텍스트를 선택한 뒤 [하이라이트] / [밑줄] 버튼을 눌러 강조할 수 있습니다. (Markdown · <mark> · <u> 지원)"
        }
        className={cn("font-mono text-sm", previewing && "hidden")}
      />
      {previewing ? (
        <div className="bg-card min-h-24 rounded-md border p-2">
          {body.trim() ? (
            <MarkdownView text={body} className="text-sm" />
          ) : (
            <p className="text-muted-foreground text-xs italic">
              미리보기할 내용이 없습니다
            </p>
          )}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        {fetcher.data?.error ? (
          <p className="text-xs text-rose-600">{fetcher.data.error}</p>
        ) : (
          <span />
        )}
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDone}
            disabled={submitting}
          >
            취소
          </Button>
          <Button type="submit" size="sm" disabled={submitting}>
            {mode === "create" ? "등록" : "저장"}
          </Button>
        </div>
      </div>
    </fetcher.Form>
  );
}
