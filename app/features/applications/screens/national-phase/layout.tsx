/**
 * National Phase Application Screen
 *
 * 국제출원 국내단계 신청을 위한 페이지입니다.
 */
import { Link, Outlet } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";

export const meta = () => {
  return [
    {
      title: `국제출원 국내단계 | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

export default function NationalPhaseLayout() {
  return (
    <div className="w-full bg-[#f6f9fc]">
      <div className="mx-auto w-full max-w-[1200px] px-[5vw] pt-3">
        <div className="flex items-center justify-between pr-[5vw]">
          <span className="text-lg font-medium">국제출원 국내단계</span>
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link to="applications/national-phase/">개요</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="applications/national-phase/price">요금</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="applications/national-phase/faq">자주 묻는 질문</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="applications/national-phase/guide">가이드</Link>
            </Button>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1200px] px-[5vw] py-6">
        <Outlet />
      </div>
    </div>
  );
}
