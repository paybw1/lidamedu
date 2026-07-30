// 조문·판례 팝업 배지 — 클릭 → 내용 팝업(lazy 로드) + [공부하러 가기] 학습화면 이동.
// 객관식 선지 해설의 조문/판례 칩과 시각 통일(기존 Link 칩의 tone 유지).
import { ArrowRightIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { MarkdownView } from "~/features/problems/components/markdown-view";

interface PreviewData {
  kind?: "article" | "case";
  heading?: string;
  title?: string | null;
  bodyMd?: string;
  error?: string;
}

export function RefPreviewBadge({
  kind,
  refId,
  label,
  studyHref,
  testId,
}: {
  kind: "article" | "case";
  refId: string;
  label: string;
  studyHref: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher<PreviewData>();
  useEffect(() => {
    if (open && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/api/problems/ref-preview?type=${kind}&id=${refId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const d = fetcher.data;
  const tone =
    kind === "article"
      ? "border-primary/30 bg-primary/10 text-link hover:bg-primary/20"
      : "border-violet-300/50 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-700/40 dark:bg-violet-950/30 dark:text-violet-300";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${tone}`}
      >
        {kind === "article" ? "조문" : "판례"} {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              {d?.heading ?? (kind === "article" ? `조문 ${label}` : `판례 ${label}`)}
            </DialogTitle>
          </DialogHeader>
          {d?.title ? (
            <div className="border-border bg-muted/30 -mt-1 rounded-lg border px-4 py-3">
              <p className="text-foreground text-sm leading-relaxed font-medium">
                {d.title}
              </p>
            </div>
          ) : null}
          {!d && fetcher.state !== "idle" ? (
            <p className="text-muted-foreground text-sm">불러오는 중…</p>
          ) : d?.error ? (
            <p className="text-muted-foreground text-sm">내용을 불러오지 못했습니다.</p>
          ) : d?.bodyMd ? (
            kind === "article" ? (
              <div className="text-sm leading-[1.9] whitespace-pre-line">{d.bodyMd}</div>
            ) : (
              <MarkdownView text={d.bodyMd} className="text-sm leading-[1.8]" />
            )
          ) : d ? (
            <p className="text-muted-foreground text-sm">등록된 내용이 없습니다.</p>
          ) : null}
          <div className="flex justify-end">
            <Button asChild size="sm" className="gap-1">
              <Link to={studyHref}>
                공부하러 가기 <ArrowRightIcon className="size-3.5" />
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
