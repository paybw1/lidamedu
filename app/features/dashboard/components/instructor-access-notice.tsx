// feat-7-040 P0 — 강사 열람 투명성 고지. 약관 제7조 ⑤("서비스 화면을 통해 고지")를
// 참으로 만드는 학생 대면 배너. ★지도형 과정(cohort) 멤버에게만 노출 — 약관 제7조 ⑥이
// 미등록자를 열람 대상에서 제외하므로, 담당 강사가 없는 자습 사용자에게 띄우면 거짓 고지.
// 노출 여부(isCohortMember) 판정은 호출부에서 — 이 컴포넌트는 표시만.

import { EyeIcon } from "lucide-react";
import { Link } from "react-router";

export function InstructorAccessNotice() {
  return (
    <div className="border-border bg-muted/40 text-muted-foreground mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs leading-relaxed">
      <EyeIcon className="text-link mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="text-foreground font-semibold">담당 강사·운영자</span>가
        학습 지도 목적으로 회원님의 학습현황(진도·정답률·약점·복습·응시결과 등)을
        열람합니다.{" "}
        <Link to="/legal/terms-of-service" className="text-link underline">
          이용약관 제7조
        </Link>
        에 따른 안내입니다.
      </p>
    </div>
  );
}
