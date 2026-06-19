// 학생 화면 페이지 헤더 — eyebrow + 제목 + 설명 + 우측 액션 슬롯.
// 화면마다 손조립하던 헤더를 단일화(제목 굵기·eyebrow·설명 톤 통일).
// 기준 = today.tsx: h1 = text-2xl font-semibold tracking-tight md:text-3xl, 설명 = text-ink-soft.
import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

import { AreaEyebrow, type AreaKey } from "./AreaEyebrow";
import { Eyebrow } from "./Eyebrow";

export function PageHeader({
  area,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  /** 영역 eyebrow — 지정 시 공용 AreaEyebrow(아이콘 + 영역명)로 렌더(권장). eyebrow 보다 우선. */
  area?: AreaKey;
  /** 커스텀 eyebrow 내용(아이콘 + 라벨). area 미지정 시에만 사용. 공용 Eyebrow 스타일로 감싼다. */
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 우측 정렬 액션(버튼 등). */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("mb-6 flex items-start justify-between gap-3", className)}
    >
      <div className="min-w-0">
        {area ? (
          <AreaEyebrow area={area} />
        ) : eyebrow ? (
          <Eyebrow>{eyebrow}</Eyebrow>
        ) : null}
        <h1 className="text-foreground mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="text-ink-soft mt-2 text-sm leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
