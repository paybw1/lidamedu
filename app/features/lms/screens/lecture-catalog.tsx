// 강의 카탈로그(강의 플랫폼) — S2 에서 course/T-PASS 상품 목록 + 수강신청/구매 배선.
// 현재는 자리(placeholder): 판매 중 강의 상품이 아직 없음(상품 0건).
import { GraduationCapIcon } from "lucide-react";

export function meta() {
  return [{ title: "강의 카탈로그 | 리담변리사학원" }];
}

export default function LectureCatalog() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight">강의 카탈로그</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        영상 강의와 교재를 수강신청·구매합니다.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
        <GraduationCapIcon className="text-muted-foreground/50 size-10" />
        <p className="mt-4 text-sm font-medium">준비 중입니다</p>
        <p className="text-muted-foreground mt-1 max-w-sm text-sm">
          판매 중인 강의 상품이 아직 없습니다. 강의가 오픈되면 이곳에서 수강신청할
          수 있습니다.
        </p>
      </div>
    </div>
  );
}
