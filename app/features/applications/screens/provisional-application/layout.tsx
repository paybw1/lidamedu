/**
 * Provisional Application Screen
 *
 * 한국 가출원 신청을 위한 페이지입니다.
 */
import { Link, Outlet } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";

export const meta = () => {
  return [
    {
      title: `Provisional Application | ${import.meta.env.VITE_APP_NAME}`,
    },
  ];
};

export default function ProvisionalApplicationLayout() {
  return (
    <div className="w-full bg-[#f6f9fc]">
      <div className="mx-auto w-full max-w-[1200px] px-[5vw] pt-3">
        <div className="flex items-center justify-between pr-[5vw]">
          <span className="text-lg font-medium">Provisional application</span>
          <div className="flex gap-2">
            <Button variant="ghost" asChild>
              <Link to="applications/provisional-application/">Overview</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="applications/provisional-application/price">Price</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="applications/provisional-application/faq">FAQ</Link>
            </Button>

            <Button variant="ghost" asChild>
              <Link to="applications/provisional-application/guide">Guide</Link>
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
