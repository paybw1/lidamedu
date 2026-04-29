import { HeartIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";

import type {
  AnnotationTargetType,
  BookmarkRecord,
  BookmarkStepLevel,
} from "../labels";

export function BookmarkStars({
  targetType,
  targetId,
  initial,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  initial: BookmarkRecord | null;
}) {
  const ratingFetcher = useFetcher();

  // 평점 클릭 직후의 낙관적 값. fetcher.formData 가 사라질 때까지(=action 완료 후 revalidation) 유지.
  const submittedStars =
    ratingFetcher.formData?.get("intent") === "rating"
      ? Number(ratingFetcher.formData.get("starLevel"))
      : null;
  const stars = submittedStars ?? initial?.starLevel ?? 0;
  const lastUpdated = initial?.updatedAt ?? null;

  const handleStarClick = (level: number) => {
    // 같은 단계 다시 클릭 → 한 단계 내림. 0 까지 가능.
    const next = stars === level ? level - 1 : level;
    const fd = new FormData();
    fd.set("intent", "rating");
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fd.set("starLevel", String(next));
    ratingFetcher.submit(fd, {
      method: "post",
      action: "/api/annotations/bookmark",
    });
  };

  const isSubmitting = ratingFetcher.state !== "idle";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          ♡ 0~5 단계 평점. 단계마다 메모를 누적할 수 있습니다.
        </p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => handleStarClick(level)}
              disabled={isSubmitting}
              aria-label={`${level}단계 즐겨찾기`}
              aria-pressed={stars >= level}
              className={cn(
                "transition-transform disabled:opacity-50",
                stars >= level
                  ? "text-rose-500 hover:scale-110"
                  : "text-muted-foreground hover:text-rose-400",
              )}
            >
              <HeartIcon
                className={cn("size-5", stars >= level && "fill-current")}
              />
            </button>
          ))}
          <span className="text-muted-foreground ml-2 text-xs tabular-nums">
            {stars} / 5
          </span>
        </div>
        {lastUpdated ? (
          <p className="text-muted-foreground text-[11px]">
            최근 갱신 {new Date(lastUpdated).toLocaleDateString("ko-KR")}
          </p>
        ) : null}
      </div>

      {stars > 0 ? (
        <ul className="space-y-2">
          {Array.from({ length: stars }, (_, i) => i + 1).map((level) => {
            const key = String(level) as "1" | "2" | "3" | "4" | "5";
            return (
              <BookmarkStepRow
                key={level}
                targetType={targetType}
                targetId={targetId}
                level={level as BookmarkStepLevel}
                initialNote={initial?.stepNotes?.[key] ?? null}
              />
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">
          하트를 눌러 평점을 매기면 단계별 메모를 추가할 수 있어요.
        </p>
      )}
    </div>
  );
}

function BookmarkStepRow({
  targetType,
  targetId,
  level,
  initialNote,
}: {
  targetType: AnnotationTargetType;
  targetId: string;
  level: BookmarkStepLevel;
  initialNote: string | null;
}) {
  const fetcher = useFetcher();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNote ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // editing 진입 시 textarea 포커스
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // 액션 성공 후 편집 모드 종료
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

  // 낙관적 표시: 제출 중인 값이 있으면 그것을 우선 사용
  const submittingNote =
    fetcher.formData?.get("intent") === "step"
      ? String(fetcher.formData.get("stepNote") ?? "")
      : null;
  const displayNote =
    submittingNote !== null
      ? submittingNote.length > 0
        ? submittingNote
        : null
      : initialNote;

  const submit = (value: string) => {
    const fd = new FormData();
    fd.set("intent", "step");
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fd.set("stepLevel", String(level));
    fd.set("stepNote", value);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/annotations/bookmark",
    });
  };

  const isSubmitting = fetcher.state !== "idle";

  return (
    <li className="bg-muted/30 group rounded-md border p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span
          className="text-rose-500"
          aria-label={`${level}단계 메모`}
        >
          {Array.from({ length: level }).map((_, i) => (
            <HeartIcon key={i} className="inline size-3 fill-current" />
          ))}
        </span>
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(displayNote ?? "");
                setEditing(true);
              }}
              className="text-primary text-xs hover:underline"
            >
              {displayNote ? "수정" : "추가"}
            </button>
          ) : null}
          {!editing && displayNote ? (
            <button
              type="button"
              aria-label={`${level}단계 메모 삭제`}
              onClick={() => submit("")}
              disabled={isSubmitting}
              className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <>
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`${level}단계 메모`}
            rows={3}
            className="text-sm"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(displayNote ?? "");
                setEditing(false);
              }}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={() => submit(draft)}
              disabled={isSubmitting}
            >
              저장
            </Button>
          </div>
        </>
      ) : displayNote ? (
        <p className="text-sm whitespace-pre-line">{displayNote}</p>
      ) : (
        <p className="text-muted-foreground text-xs">메모 없음</p>
      )}
    </li>
  );
}
