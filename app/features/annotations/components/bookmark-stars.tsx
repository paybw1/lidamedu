import { HeartIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Textarea } from "~/core/components/ui/textarea";
import { cn } from "~/core/lib/utils";

import type {
  AnnotationTargetType,
  BookmarkRecord,
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
  const fetcher = useFetcher();
  const [stars, setStars] = useState(initial?.starLevel ?? 0);
  const [note, setNote] = useState(initial?.noteMd ?? "");
  const [showNote, setShowNote] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const lastUpdated = initial?.updatedAt ?? null;

  useEffect(() => {
    if (showNote) noteRef.current?.focus();
  }, [showNote]);

  const submit = (nextStars: number, nextNote: string) => {
    const fd = new FormData();
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fd.set("starLevel", String(nextStars));
    if (nextNote.trim()) fd.set("noteMd", nextNote);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/annotations/bookmark",
    });
  };

  const handleStarClick = (level: number) => {
    const next = stars === level ? level - 1 : level;
    setStars(next);
    setShowNote(true);
    submit(next, note);
  };

  const handleNoteSave = () => {
    submit(stars, note);
    setShowNote(false);
  };

  const isSubmitting = fetcher.state !== "idle";

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          ♡ 0~5 단계 평점 (클릭으로 토글)
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">즐겨찾기 메모</p>
          {!showNote ? (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="text-primary text-xs hover:underline"
            >
              {note ? "수정" : "추가"}
            </button>
          ) : null}
        </div>
        {showNote ? (
          <>
            <Textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="이 즐겨찾기에 대한 메모 (선택)"
              rows={3}
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setNote(initial?.noteMd ?? "");
                  setShowNote(false);
                }}
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={handleNoteSave}
                disabled={isSubmitting}
              >
                저장
              </Button>
            </div>
          </>
        ) : note ? (
          <p className="bg-muted/40 rounded-md p-2 text-xs whitespace-pre-line">
            {note}
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">메모 없음</p>
        )}
      </div>
    </div>
  );
}
