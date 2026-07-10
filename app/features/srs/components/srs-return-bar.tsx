// 암기 카드에서 조문/판례 학습과목 화면으로 넘어온 경우 표시되는 복귀 바.
//   URL 에 ?srsReturn=<암기카드 복귀 URL> 이 있을 때만 고정 pill 로 노출.
//   조문/판례 뷰어(article-viewer·case-viewer)에 마운트 — 실시간 포스트잇·하이라이트·
//   즐겨찾기 기록 후 원래 카드 위치로 돌아가기 위함.
import { ArrowLeftIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router";

export function SrsReturnBar() {
  const [params] = useSearchParams();
  const ret = params.get("srsReturn");
  // 내부 경로만 허용(오픈 리다이렉트 방지) — '/' 로 시작하고 '//' 아님.
  if (!ret || !ret.startsWith("/") || ret.startsWith("//")) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <Link
        to={ret}
        className="border-primary/40 bg-primary text-primary-foreground pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold shadow-lg transition-transform hover:scale-[1.02]"
      >
        <ArrowLeftIcon className="size-4" />
        암기 카드로 돌아가기
      </Link>
    </div>
  );
}
