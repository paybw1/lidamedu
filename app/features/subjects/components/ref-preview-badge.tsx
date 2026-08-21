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
  // 판례 — 판결요지 쟁점 단위: 제목(박스) + 내용.
  items?: Array<{ title: string; body: string }>;
  // 판례 — 목록 미수록(cases.list_visible=false)이면 [공부하러 가기]를 감춘다.
  listVisible?: boolean;
  // 참조 법령 조문 — 학습화면이 없다.
  studyDisabled?: boolean;
  error?: string;
}

export function RefPreviewBadge({
  kind,
  refId,
  label,
  studyHref,
  testId,
}: {
  kind: "article" | "case" | "reference";
  refId: string;
  label: string;
  /** 학습화면이 없는 참조(참조 법령 조문 등)는 넘기지 않는다 — 버튼을 내지 않는다. */
  studyHref?: string;
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
        {kind === "case" ? "판례" : "조문"} {label}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* 헤더(제목·X)·하단 버튼 고정, 본문만 스크롤 */}
        <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="pr-6 text-base leading-snug">
              {d?.heading ?? (kind === "article" ? `조문 ${label}` : `판례 ${label}`)}
            </DialogTitle>
          </DialogHeader>
          <div className="-mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
          {!d && fetcher.state !== "idle" ? (
            <p className="text-muted-foreground text-sm">불러오는 중…</p>
          ) : d?.error ? (
            <p className="text-muted-foreground text-sm">내용을 불러오지 못했습니다.</p>
          ) : d?.items?.length ? (
            // 판례 — 판결요지: 쟁점 제목(박스) + 내용.
            <div className="space-y-4">
              {d.items.map((it, i) => (
                <div key={i} className="space-y-2">
                  {it.title ? (
                    <div className="border-border bg-muted/30 rounded-lg border px-4 py-3">
                      <p className="text-foreground text-sm leading-relaxed font-medium">
                        {it.title}
                      </p>
                    </div>
                  ) : null}
                  {it.body ? (
                    <MarkdownView text={it.body} className="text-sm leading-[1.8]" />
                  ) : null}
                </div>
              ))}
            </div>
          ) : d?.bodyMd ? (
            kind === "article" ? (
              <div className="text-sm leading-[1.9] whitespace-pre-line">{d.bodyMd}</div>
            ) : (
              <MarkdownView text={d.bodyMd} className="text-sm leading-[1.8]" />
            )
          ) : d ? (
            <p className="text-muted-foreground text-sm">등록된 내용이 없습니다.</p>
          ) : null}
          </div>
          <div className="flex justify-end pt-1">
            {/* ★로딩 중에는 버튼을 내지 않는다 — 미수록 판례인지 알기 전에 눌리면
                목록에 없는 판례의 학습화면으로 이탈한다. */}
            {!studyHref || d?.studyDisabled ? (
              <span className="text-muted-foreground text-[11px]">
                참조 법령 — 여기서만 열람합니다
              </span>
            ) : kind === "case" && d?.listVisible === false ? (
              <span className="text-muted-foreground text-[11px]">
                목록 미수록 판례 — 여기서만 열람합니다
              </span>
            ) : kind === "case" && !d ? null : (
              <Button asChild size="sm" className="gap-1">
                <Link to={studyHref}>
                  공부하러 가기 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
