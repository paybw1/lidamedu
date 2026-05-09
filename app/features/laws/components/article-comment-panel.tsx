// 조문 코멘트/평석 패널 — staff 작성 / 학생 read-only.

import { Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import type { ArticleComment } from "~/features/laws/queries.server";

export function ArticleCommentPanel({
  articleId,
  initial,
  canEdit,
}: {
  articleId: string;
  initial: ArticleComment | null;
  canEdit: boolean;
}) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial?.bodyMd ?? "");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  // 액션 성공 → 편집 모드 종료.
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      typeof fetcher.data === "object" &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      setEditing(false);
    }
  }, [fetcher.state, fetcher.data]);

  const submitting = fetcher.state !== "idle";

  const handleSave = () => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("articleId", articleId);
    fd.set("bodyMd", draft);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/laws/article-comment",
    });
  };

  const handleDelete = () => {
    if (!confirm("이 코멘트를 삭제하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("articleId", articleId);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/laws/article-comment",
    });
  };

  if (editing) {
    return (
      <div className="space-y-2" data-testid="article-comment-panel">
        <Textarea
          ref={textRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="평석 / 학습 코멘트 (마크다운 지원)"
          rows={10}
          maxLength={10000}
          className="text-sm"
        />
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(initial?.bodyMd ?? "");
              setEditing(false);
            }}
          >
            취소
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={submitting || draft.trim().length === 0}
            data-testid="article-comment-save"
          >
            {submitting ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
    );
  }

  if (!initial) {
    return (
      <div className="space-y-2" data-testid="article-comment-panel">
        <p className="text-muted-foreground text-xs leading-relaxed">
          이 조문에 대한 코멘트가 아직 없습니다.
        </p>
        {canEdit ? (
          <Button
            size="sm"
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
            data-testid="article-comment-add"
          >
            코멘트 작성
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="article-comment-panel">
      <MarkdownView text={initial.bodyMd} />
      <div className="text-muted-foreground flex items-center justify-between gap-2 text-[11px]">
        <span>최근 갱신 {initial.updatedAt.slice(0, 10)}</span>
        {canEdit ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(initial.bodyMd);
                setEditing(true);
              }}
              className="text-primary hover:underline"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="hover:text-destructive"
              aria-label="코멘트 삭제"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
