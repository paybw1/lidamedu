/**
 * National Phase Overview Page
 *
 * 국제출원 국내단계 개요 페이지입니다.
 */
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";

export default function Overview() {
  return (
    <div className="pb-40">
      <div className="mt-20 flex h-full w-full flex-row pb-10">
        <div className="prose prose-sm dark:prose-invert flex w-[60%] flex-col gap-10">
          <h1 className="scroll-m-20 text-6xl leading-tight font-bold tracking-tighter text-balance text-[#0a2540]">
            국제출원 국내단계 진입으로
            <br />
            글로벌 특허 확보
          </h1>
          <h4 className="scroll-m-20 text-lg font-normal tracking-tight text-balance text-[#586879]">
            PCT 국제출원을 통해 원하는 국가에서 특허를 받기 위한 국내단계 진입을
            간편하게 처리하세요. 전문적인 서비스로 안전하고 효율적으로 글로벌
            특허권을 확보할 수 있습니다.
          </h4>
        </div>
        <div className="w-[40%]"></div>
      </div>
      <div>
        <Button
          variant="default"
          asChild
          className="group-hover:bg-primary/90 h-8 rounded-full px-6 text-base font-semibold transition-colors"
        >
          <Link
            to="start"
            className="bg-primary text-primary-foreground ring-offset-background hover:bg-primary/90 focus-visible:ring-ring inline-flex h-10 items-center justify-center rounded-md px-8 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
          >
            시작하기
          </Link>
        </Button>
      </div>
    </div>
  );
}
