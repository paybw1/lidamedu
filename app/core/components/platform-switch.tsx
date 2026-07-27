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
  isPlatformNeutralPath,
} from "~/core/lib/platforms";

const ICONS: Record<PlatformId, typeof BookOpenIcon> = {
  study: BookOpenIcon,
  lecture: MonitorPlayIcon,
};

// ★현재 운영 중인 (구) 강의 플랫폼. 우리 강의 플랫폼(/lecture)은 개발 중이라, 학생이 강의
//   토글을 누르면 이 운영 사이트로 보낸다. staff 는 개발 중 /lecture 로 진입(내부).
const EXTERNAL_LECTURE_URL = "https://lidamedu.com";

export function PlatformSwitch({
  className,
  isStaff = false,
}: {
  className?: string;
  isStaff?: boolean;
}) {
  const { pathname } = useLocation();
  // 운영관리·인박스는 두 플랫폼 공용 — 어느 쪽도 활성 표시하지 않는다(전환처럼 보이지 않게).
  const neutral = isPlatformNeutralPath(pathname);
  const active = neutral ? null : getActivePlatform(pathname);
  const cls = (isActive: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-1 whitespace-nowrap transition-all duration-200",
      isActive
        ? "bg-primary text-primary-foreground shadow-primary/25 shadow-sm"
        : "text-muted-foreground hover:text-primary hover:bg-primary/10",
    );
  return (
    <div
      role="tablist"
      aria-label="플랫폼 선택"
      className={cn(
        "bg-muted/70 ring-border/50 inline-flex items-center gap-1 rounded-full p-1 text-[11px] font-semibold ring-1",
        className,
      )}
    >
      {PLATFORM_ORDER.map((id) => {
        const p = PLATFORMS[id];
        const Icon = ICONS[id];
        const isActive = active === id;
        // 학생의 '강의' = 외부 운영 사이트(개발 중 내부 플랫폼 대신). 그 외는 내부 라우팅.
        if (id === "lecture" && !isStaff) {
          return (
            <a
              key={id}
              href={EXTERNAL_LECTURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              role="tab"
              aria-selected={false}
              className={cls(false)}
            >
              <Icon className="size-2.5" />
              {p.label}
            </a>
          );
        }
        return (
          <Link
            key={id}
            to={p.home}
            role="tab"
            aria-selected={isActive}
            className={cls(isActive)}
          >
            <Icon className="size-2.5" />
            {p.label}
          </Link>
        );
      })}
    </div>
  );
}
