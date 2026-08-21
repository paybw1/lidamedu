// 시간·분 2칸 입력 → 숨김 필드에 '분'으로 합산해 제출한다(feat-7-048 D1).
// DB·계산은 전 구간 분 정수 그대로다 — 시/분은 입력창과 표시에서만 쓴다.
import { useState } from "react";

import { Input } from "~/core/components/ui/input";
import { cn } from "~/core/lib/utils";
import { joinMinutes, splitMinutes } from "~/features/study-plans/labels";

export const MAX_DAILY_MINUTES = 1440;

export function MinutesField({
  label,
  name,
  defaultMinutes,
  required = false,
  className,
}: {
  label: string;
  name: string;
  defaultMinutes: number | null;
  /**
   * 0분 제출을 막는다. 숨김 필드를 비워 보내 **서버 검증에서 걸리게** 한다 —
   * 두 칸(시간·분) 각각에 required 를 걸면 "5시간 0분"에도 0 을 타이핑해야 한다.
   */
  required?: boolean;
  className?: string;
}) {
  const init = splitMinutes(defaultMinutes);
  const [hours, setHours] = useState(init.hours === "" ? "" : String(init.hours));
  const [mins, setMins] = useState(init.mins === "" ? "" : String(init.mins));
  const total = Math.min(joinMinutes(hours, mins), MAX_DAILY_MINUTES);
  return (
    <div className={className}>
      <label className="text-muted-foreground text-[11px]">
        {label}
        {required ? " *" : ""}
      </label>
      <div className="mt-0.5 flex items-center gap-1">
        <Input
          type="number"
          min={0}
          max={24}
          inputMode="numeric"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={cn("h-8 w-12 px-1.5 text-center text-xs tabular-nums")}
          aria-label={`${label} 시간`}
        />
        <span className="text-muted-foreground text-[11px]">시간</span>
        <Input
          type="number"
          min={0}
          max={59}
          inputMode="numeric"
          value={mins}
          onChange={(e) => setMins(e.target.value)}
          className={cn("h-8 w-12 px-1.5 text-center text-xs tabular-nums")}
          aria-label={`${label} 분`}
        />
        <span className="text-muted-foreground text-[11px]">분</span>
      </div>
      {required && total === 0 ? (
        <p className="mt-0.5 text-[11px] text-rose-600">시간을 입력하세요</p>
      ) : null}
      <input
        type="hidden"
        name={name}
        value={required && total === 0 ? "" : total}
      />
    </div>
  );
}
