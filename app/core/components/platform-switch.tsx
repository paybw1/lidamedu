// 브랜드 옆 플랫폼 세그먼트 스위처 — 학습 플랫폼 ↔ 강의 플랫폼.
// 활성 판별은 pathname(URL 권위). 두 칸 모두 항상 노출(드롭다운 아님) — 두 제품이 동등.
import { Link, useLocation } from "react-router";

import { cn } from "~/core/lib/utils";
import {
  PLATFORMS,
  PLATFORM_ORDER,
  getActivePlatform,
} from "~/core/lib/platforms";

export function PlatformSwitch({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const active = getActivePlatform(pathname);
  return (
    <div
      role="tablist"
      aria-label="플랫폼 선택"
      className={cn(
        "bg-muted/60 inline-flex items-center gap-0.5 rounded-full p-0.5 text-xs font-medium",
        className,
      )}
    >
      {PLATFORM_ORDER.map((id) => {
        const p = PLATFORMS[id];
        const isActive = active === id;
        return (
          <Link
            key={id}
            to={p.home}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "rounded-full px-2.5 py-1 whitespace-nowrap transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
