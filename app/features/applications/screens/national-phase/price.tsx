/**
 * National Phase Price Page
 *
 * 국제출원 국내단계 비용 안내 페이지입니다.
 */
import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";

export default function Price() {
  return (
    <div className="pb-70">
      <div className="mt-9 flex h-full w-full flex-col gap-5 pb-20">
        <div className="prose prose-sm dark:prose-invert mb-15 flex flex-col gap-10">
          <h1 className="scroll-m-20 text-6xl leading-tight font-bold tracking-tighter text-balance text-[#0a2540]">
            <p>국제출원 국내단계</p>
            <p>요금 안내</p>
          </h1>
        </div>
        <div className="flex flex-row justify-center gap-5">
          <Card className="group flex w-[50%] flex-row rounded-md bg-white p-1 transition-shadow duration-300 hover:shadow-lg">
            <div className="flex w-[50%] flex-col">
              <CardHeader className="pt-5">
                <CardTitle className="pb-3 text-xl text-[#0a2540]">
                  기본 신청
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-sm text-[#586879]">
                  국제출원 국내단계 진입을 위한 기본 서비스
                </p>
                <p className="text-sm text-[#586879]">
                  완전한 출원서 작성 및 디지털 영수증 포함
                </p>
              </CardContent>
              <CardFooter className="pb-6">
                <Button
                  variant="default"
                  asChild
                  className="group-hover:bg-primary/90 h-8 rounded-full px-4 text-base font-medium transition-colors"
                >
                  <Link to="/applications/national-phase/start">
                    시작하기 &rarr;
                  </Link>
                </Button>
              </CardFooter>
            </div>
            <h2 className="flex w-[50%] items-center justify-center rounded-xs border-b bg-[#f6f9fc] text-center text-3xl font-medium tracking-tighter text-[#0a2540]">
              ₩290,000
            </h2>
          </Card>
          <Card className="group flex w-[50%] flex-row rounded-md bg-white p-1 transition-shadow duration-300 hover:shadow-lg">
            <div className="flex w-[50%] flex-col">
              <CardHeader className="pt-5">
                <CardTitle className="pb-3 text-xl text-[#0a2540]">
                  긴급 신청
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-sm text-[#586879]">
                  빠른 처리가 필요한 경우
                </p>
                <p className="text-sm text-[#586879]">3-5일 내 처리 보장</p>
              </CardContent>
              <CardFooter className="pb-6">
                <Button
                  variant="default"
                  asChild
                  className="group-hover:bg-primary/90 h-8 rounded-full px-4 text-base font-medium transition-colors"
                >
                  <Link to="/applications/national-phase/start">
                    시작하기 &rarr;
                  </Link>
                </Button>
              </CardFooter>
            </div>
            <h2 className="flex w-[50%] items-center justify-center rounded-xs border-b bg-[#f6f9fc] text-center text-3xl font-medium tracking-tighter text-[#0a2540]">
              ₩390,000
            </h2>
          </Card>
        </div>

        {/* 추가 정보 */}
        <div className="mx-auto mt-8 max-w-4xl">
          <Card className="group border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 transition-shadow duration-300 hover:shadow-lg">
            <CardContent className="p-6">
              <h3 className="mb-4 text-xl font-semibold text-[#0a2540]">
                포함된 서비스
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-[#586879]">
                    국제출원번호 확인
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-[#586879]">
                    국내단계 진입 요건 검토
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-[#586879]">
                    출원서 작성 및 제출
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-[#586879]">
                    수수료 납부 대행
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-[#586879]">
                    진행 상황 모니터링
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span className="text-sm text-[#586879]">
                    이메일 알림 서비스
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
