// 브랜드 옆 플랫폼 세그먼트 스위처 — 학습 플랫폼 ↔ 강의 플랫폼.
// 활성 판별은 pathname(URL 권위). 두 칸 모두 항상 노출(드롭다운 아님) — 두 제품이 동등.
// 배색: 활성 = 블루 필(그라데이션), 비활성 = 뮤티드 + 블루 호버.
import { BookOpenIcon, MonitorPlayIcon } from "lucide-react";
import { Link, useLocation } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  PLATFORMS,
  PLATFORM_ORDER,
  type PlatformId,
  getActivePlatform,
} from "~/core/lib/platforms";

const ICONS: Record<PlatformId, typeof BookOpenIcon> = {
  study: BookOpenIcon,
  lecture: MonitorPlayIcon,
};

export function PlatformSwitch({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const active = getActivePlatform(pathname);
  return (
    <div
      role="tablist"
      aria-label="플랫폼 선택"
      className={cn(
        "bg-muted/70 ring-border/50 inline-flex items-center gap-1 rounded-full p-1 text-[12px] font-semibold ring-1",
        className,
      )}
    >
      {PLATFORM_ORDER.map((id) => {
        const p = PLATFORMS[id];
        const Icon = ICONS[id];
        const isActive = active === id;
        return (
          <Link
            key={id}
            to={p.home}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 whitespace-nowrap transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-primary/25 shadow-sm"
                : "text-muted-foreground hover:text-primary hover:bg-primary/10",
            )}
          >
            <Icon className="size-3" />
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
