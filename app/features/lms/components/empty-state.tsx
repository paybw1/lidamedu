// 빈 상태 — 「데이터 없음」이 아니라 **다음 행동 제시** (feat-11-012 P6-c).
//
// ★고치기 전 증상은 문구가 아니라 **구조**였다. 공용 껍데기(MyPagePlaceholder)가
//   「곧 제공될 예정입니다」를 덧붙이고 **화면을 헤더째 갈아치웠다.** 그래서 증명서·결제내역·
//   쿠폰 세 화면은 데이터가 0건이면 ① 제목이 사라지고 ② 이미 동작하는 기능이 「아직 안 열린
//   기능」으로 보이고 ③ 갈 곳이 「홈으로」 하나뿐이었다. 세 가지 다 사실이 아니다.
//
// ★그래서 계약을 바꾼다 — **헤더는 항상 그리고, 본문 자리에만** 이 부품을 둔다.
//   그리고 화면마다 **다음 행동 링크**를 받는다(그게 이 부품의 존재 이유다).
// ★학습 플랫폼에 같은 계약의 부품(core/components/student/EmptyState)이 있지만 들여오지
//   않는다 — 그쪽 컨테이너(Surface)와 색 토큰(text-ink-*)까지 딸려 와 표기 통일이
//   레이아웃 변경으로 번진다. 계약만 가져오고 껍데기는 강의 플랫폼 것을 쓴다.

import type { ReactNode } from "react";

import { Link } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";

export interface EmptyAction {
  label: string;
  to: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** 다음 행동. 첫째가 주 행동(채운 버튼), 나머지는 보조. */
  actions?: readonly EmptyAction[];
  className?: string;
}) {
  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center px-6 py-12 text-center">
        {icon ? (
          <div className="bg-muted text-muted-foreground mb-4 flex size-12 items-center justify-center rounded-2xl">
            {icon}
          </div>
        ) : null}
        <h2 className="text-[15px] font-bold tracking-tight text-balance">
          {title}
        </h2>
        {description ? (
          <p className="text-muted-foreground mx-auto mt-2 max-w-md text-[13px] leading-relaxed">
            {description}
          </p>
        ) : null}
        {actions && actions.length > 0 ? (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {actions.map((a, i) => (
              <Button
                key={a.to}
                asChild
                size="sm"
                variant={i === 0 ? "default" : "outline"}
              >
                <Link to={a.to}>{a.label}</Link>
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
