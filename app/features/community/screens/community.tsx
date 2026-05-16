// 커뮤니티 허브 — 게시판 준비 중 상태. loader 없음 (보드 데이터 모델 미정).
// 디자인 키트 lidam-community/CommunityPlaceholderScreen.

import { GraduationCapIcon, MessageSquareTextIcon, UsersIcon } from "lucide-react";
import type { ComponentType } from "react";

import { CommunityShell } from "~/features/community/components/community-shell";
import { Chip, EmptyState } from "~/features/community/components/community-ui";

import type { Route } from "./+types/community";

export const meta: Route.MetaFunction = () => [
  { title: "커뮤니티 | Lidam Patent Attorney Academy" },
];

interface AreaPreview {
  label: string;
  desc: string;
  Icon: ComponentType<{ className?: string }>;
}

// 곧 열릴 3개 영역 — 자유게시판 / 스터디 모집 / 합격 후기.
const UPCOMING_AREAS: AreaPreview[] = [
  {
    label: "자유게시판",
    desc: "수험 정보와 일상을 나누는 공간",
    Icon: MessageSquareTextIcon,
  },
  {
    label: "스터디 모집",
    desc: "함께 공부할 스터디원을 찾는 공간",
    Icon: UsersIcon,
  },
  {
    label: "합격 후기",
    desc: "합격자의 학습 전략과 경험담",
    Icon: GraduationCapIcon,
  },
];

export default function Community() {
  return (
    <CommunityShell
      category="community"
      title="커뮤니티"
      desc="수험생끼리 학습 자료와 후기를 나눌 수 있는 게시판은 준비 중입니다. 곧 만나요."
    >
      <EmptyState
        icon={UsersIcon}
        title="커뮤니티는 준비 중입니다"
        body="수험생끼리 학습 자료와 후기를 나눌 수 있는 게시판을 준비하고 있습니다. 곧 자유게시판 · 스터디 모집 · 합격 후기 세 영역으로 열립니다."
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {UPCOMING_AREAS.map((area) => (
          <div
            key={area.label}
            aria-disabled
            className="border-border bg-card pointer-events-none flex flex-col gap-2 rounded-2xl border p-4 opacity-70 select-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="bg-violet-500/15 text-violet-700 dark:text-violet-300 inline-flex size-9 items-center justify-center rounded-xl">
                <area.Icon className="size-4.5" />
              </span>
              <Chip tone="violet">준비 중</Chip>
            </div>
            <p className="text-[15px] font-bold tracking-tight">{area.label}</p>
            <p className="text-muted-foreground text-[13px] leading-relaxed">
              {area.desc}
            </p>
          </div>
        ))}
      </div>
    </CommunityShell>
  );
}
