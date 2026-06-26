// 조문/판례/문제 뷰어에서 통합 Q&A 작성으로 점프하는 공용 진입 버튼.
//
// (Phase 5 진입 통합) 과거엔 /ai 챗으로 갔으나, 이제 통합 Q&A 새 질문 작성으로 연결한다.
// → /qna/new?targetType=<type>&targetId=<id>(&seed=<초안>). 제출 시 AI가 즉답하고 강사가 확인.
// seed 가 있으면 본문에 초안으로 프리필(자동 전송은 안 함 — 사용자가 다듬어 등록).

import { Link } from "react-router";
import { SparklesIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

export type AskAiAnchorType = "article" | "case" | "problem";

interface AskAiButtonProps {
  anchorType: AskAiAnchorType;
  anchorId: string;
  /** 본문에 프리필할 초안 질문(옵션). 미설정 시 사용자가 직접 입력. */
  seed?: string;
  size?: "sm" | "icon";
  variant?: "ghost" | "outline";
  className?: string;
  label?: string;
}

export function AskAiButton({
  anchorType,
  anchorId,
  seed,
  size = "sm",
  variant = "ghost",
  className,
  label = "질문하기",
}: AskAiButtonProps) {
  const params = new URLSearchParams();
  params.set("targetType", anchorType);
  params.set("targetId", anchorId);
  if (seed) params.set("seed", seed);
  const href = `/qna/new?${params.toString()}`;
  return (
    <Button
      asChild
      size={size}
      variant={variant}
      className={cn("h-9 gap-1.5 rounded-full px-3 text-xs sm:h-7", className)}
    >
      <Link to={href}>
        <SparklesIcon className="size-3" />
        {label}
      </Link>
    </Button>
  );
}
