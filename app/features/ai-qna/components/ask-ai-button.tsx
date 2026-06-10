// feat-9-004 잔여 — 조문/판례/문제 뷰어에서 AI Q&A 로 점프하는 공용 진입 버튼.
//
// /ai?anchor=<type>:<id>&q=<seed> 로 새 대화 시작. seed 가 있으면 자동 전송 (ai-chat 의 seed 자동 send).
// 베타 동안에는 작은 ghost/outline 버튼으로 표시. 기존 뷰어 헤더 액션 톤과 일치.

import { Link } from "react-router";
import { SparklesIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";

export type AskAiAnchorType = "article" | "case" | "problem";

interface AskAiButtonProps {
  anchorType: AskAiAnchorType;
  anchorId: string;
  /** 자동 전송할 시드 질문(옵션). 미설정 시 사용자가 직접 입력. */
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
  label = "AI에게 묻기",
}: AskAiButtonProps) {
  const params = new URLSearchParams();
  params.set("anchor", `${anchorType}:${anchorId}`);
  if (seed) params.set("q", seed);
  const href = `/ai?${params.toString()}`;
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
