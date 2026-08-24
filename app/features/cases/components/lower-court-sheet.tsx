// feat-2-035 — 원심(하급심) 판결문 열람 배지 + 시트. **운영자 전용**.
//
// 도식의 사실관계가 어디서 왔는지 원문으로 확인하는 용도. 학생에게는 보이지 않는다 —
// 저작물 전문이고 학습 콘텐츠가 아니라서, RLS(case_lower_courts staff 전용)가
// 데이터 단계에서 막고 화면은 데이터가 없으면 배지를 그리지 않는다.
import {
  DownloadIcon,
  GavelIcon,
  PrinterIcon,
  ScrollTextIcon,
} from "lucide-react";
import { Link } from "react-router";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import {
  type LowerCourtFile,
  formatFileSize,
  lowerCourtFileHref,
} from "~/features/cases/lib/lower-court";
import { reflowJudgmentText } from "~/features/cases/lib/lower-court-text";

export interface LowerCourtView {
  sourceRef: string | null;
  lowerCourt: string | null;
  lowerCaseNumber: string | null;
  charCount: number;
  bodyText: string;
  /** 업로드 원본. 2026-08-24 이전 적재분은 원본을 버렸기 때문에 비어 있다. */
  files: LowerCourtFile[];
}

export function LowerCourtSheet({
  lower,
  caseId,
}: {
  lower: LowerCourtView;
  /** 인쇄(PDF 저장) 화면 링크용. */
  caseId: string;
}) {
  const label =
    lower.sourceRef ??
    [lower.lowerCourt, lower.lowerCaseNumber].filter(Boolean).join(" ") ??
    "원심 판결문";

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          title="원심 판결문 원문 보기 (운영자 전용)"
          className="border-border text-muted-foreground hover:bg-muted inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors"
        >
          <GavelIcon className="size-3.5" />
          원심 판결문
          <span className="text-muted-foreground/70">운영자</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-[720px]"
      >
        <SheetHeader className="border-border bg-background sticky top-0 z-10 border-b px-4 py-3">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <ScrollTextIcon className="text-link size-4" />
            원심 판결문
            <span className="text-muted-foreground font-mono text-xs font-normal">
              {label}
            </span>
          </SheetTitle>
          <p className="text-muted-foreground text-[11px]">
            도식의 사실관계 근거 · {lower.charCount.toLocaleString("ko-KR")}자 ·
            운영자에게만 보입니다
          </p>
          <Link
            to={`/admin/cases/lower-court/${caseId}/print`}
            target="_blank"
            rel="noreferrer"
            className="border-border text-muted-foreground hover:bg-muted mt-1 inline-flex h-7 w-fit items-center gap-1 rounded-full border px-3 text-[11px] font-semibold"
          >
            <PrinterIcon className="size-3" /> 인쇄 · PDF로 저장
          </Link>
          {/* ★원본이 있으면 그걸 먼저 준다 — 위 인쇄본은 추출 텍스트를 다시 그린 것이라
              원본 판결문 서식(표·서명란)이 남아 있지 않다. */}
          {lower.files.map((f, i) => (
            <a
              key={f.path}
              href={lowerCourtFileHref(caseId, i)}
              className="border-border text-muted-foreground hover:bg-muted mt-1 inline-flex h-7 w-fit items-center gap-1 rounded-full border px-3 text-[11px] font-semibold"
            >
              <DownloadIcon className="size-3" />
              원본 내려받기
              <span className="text-muted-foreground/70 font-normal">
                {f.name}
                {formatFileSize(f.size) ? ` · ${formatFileSize(f.size)}` : ""}
              </span>
            </a>
          ))}
        </SheetHeader>
        {/* ★평문 그대로 그리면 PDF 추출본의 줄바꿈 때문에 한 문장이 조각나 보인다
            (원장 보고 2026-08-24) — 문단을 복원해 그린다. */}
        <div className="space-y-2.5 px-4 py-4">
          {reflowJudgmentText(lower.bodyText).map((para, i) => (
            <p
              key={i}
              className="text-foreground text-[13px] leading-[1.85] [overflow-wrap:break-word] break-keep"
            >
              {para}
            </p>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
