// 조문·판례·문제 교차 이동용 back 버튼.
//   SPA 내부 이동 이력이 있으면(window.history.state.idx > 0) navigate(-1) 로 "이전으로"
//   — 출발 화면(조문/판례/문제 무엇이든)으로 정확히 복귀(연쇄 이동도 한 단계씩).
//   이력이 없으면(딥링크 첫 진입) listHref 가 있을 때만 목록 fallback 노출.
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { cn } from "~/core/lib/utils";

const CLS =
  "text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium transition-colors";

export function ViewerBackButton({
  listHref,
  listLabel,
  className,
}: {
  listHref?: string;
  listLabel?: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    // react-router 가 history.state.idx 로 스택 위치를 관리. >0 이면 내부 back 가능.
    const idx =
      (window.history.state as { idx?: number } | null)?.idx ?? 0;
    setCanGoBack(idx > 0);
  }, []);

  if (canGoBack) {
    return (
      <button
        type="button"
        onClick={() => navigate(-1)}
        className={cn(CLS, className)}
      >
        <ArrowLeftIcon className="size-3.5" />
        이전으로
      </button>
    );
  }
  if (listHref) {
    return (
      <Link to={listHref} viewTransition className={cn(CLS, className)}>
        <ArrowLeftIcon className="size-3.5" />
        {listLabel ?? "목록으로"}
      </Link>
    );
  }
  return null;
}
