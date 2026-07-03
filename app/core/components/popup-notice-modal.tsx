// 팝업 공지 모달 — 운영자가 /admin/popup-notices 에서 만든 활성 공지를 표시.
// 노출 필터(활성+기간)는 서버 RLS 가 담당, 이 컴포넌트는 표시·닫기 상태만 소유.
// "오늘 하루 보지 않기"는 localStorage(공지별, 자정까지)로 기억 — 세션/기기 단위 UI 상태.

import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { MarkdownView } from "~/features/problems/components/markdown-view";

import { Button } from "./ui/button";

// 표시에 필요한 필드만 — 소스는 popup-notices.server 의 PopupNotice(loader 로 직렬화 전달).
export interface PopupNoticeDisplay {
  noticeId: string;
  title: string;
  bodyMd: string;
  imageUrl: string | null;
  youtubeUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
}

// 유튜브 영상 ID 추출 — watch?v= / youtu.be/ / shorts/ / embed/ 수용.
function extractYoutubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      url,
    );
  return m?.[1] ?? null;
}

const STORAGE_PREFIX = "popupNoticeHiddenUntil:";

function hiddenUntilMs(noticeId: string): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_PREFIX + noticeId) ?? 0);
  } catch {
    return 0;
  }
}

function hideToday(noticeId: string): void {
  const end = new Date();
  end.setHours(24, 0, 0, 0); // 오늘 자정까지
  try {
    window.localStorage.setItem(STORAGE_PREFIX + noticeId, String(end.getTime()));
  } catch {
    // localStorage 불가(프라이빗 모드 등) — 이번 렌더에서만 닫힘.
  }
}

export function PopupNoticeModal({
  notices,
}: {
  notices: PopupNoticeDisplay[];
}) {
  // SSR 시점엔 localStorage 를 모름 → mount 후 필터 (hydration mismatch 방지).
  const [visible, setVisible] = useState<PopupNoticeDisplay[]>([]);
  useEffect(() => {
    const now = Date.now();
    setVisible(notices.filter((n) => hiddenUntilMs(n.noticeId) < now));
  }, [notices]);

  const current = visible[0];
  if (!current) return null;

  const closeCurrent = (hide: boolean) => {
    if (hide) hideToday(current.noticeId);
    else {
      // 단순 닫기도 이 세션에선 다시 안 뜨게 짧게(10분) 기억 — 페이지 이동마다 재등장 방지.
      try {
        window.localStorage.setItem(
          STORAGE_PREFIX + current.noticeId,
          String(Date.now() + 10 * 60 * 1000),
        );
      } catch {
        // 무시
      }
    }
    setVisible((v) => v.filter((n) => n.noticeId !== current.noticeId));
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label={current.title}
    >
      <div className="bg-card border-border w-full max-w-lg rounded-xl border shadow-xl">
        <div className="border-border/60 flex items-center justify-between gap-2 border-b px-5 py-3.5">
          <h2 className="text-[15px] font-bold tracking-tight">{current.title}</h2>
          <button
            type="button"
            onClick={() => closeCurrent(false)}
            aria-label="닫기"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          {current.imageUrl ? (
            current.linkUrl ? (
              <a href={current.linkUrl} aria-label={current.linkLabel || "자세히 보기"}>
                <img
                  src={current.imageUrl}
                  alt={current.title}
                  className="w-full rounded-lg"
                />
              </a>
            ) : (
              <img
                src={current.imageUrl}
                alt={current.title}
                className="w-full rounded-lg"
              />
            )
          ) : null}
          {current.youtubeUrl && extractYoutubeId(current.youtubeUrl) ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg">
              <iframe
                src={`https://www.youtube.com/embed/${extractYoutubeId(current.youtubeUrl)}`}
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
          ) : null}
          {current.bodyMd.trim() ? (
            <MarkdownView text={current.bodyMd} trusted={false} />
          ) : null}
        </div>
        <div className="border-border/60 flex items-center justify-between gap-2 border-t px-5 py-3">
          <button
            type="button"
            onClick={() => closeCurrent(true)}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          >
            오늘 하루 보지 않기
          </button>
          <div className="flex items-center gap-2">
            {/* 이미지 팝업은 이미지 안 CTA + 이미지 클릭이 링크 역할 — 푸터 버튼 중복 제거. */}
            {current.linkUrl && !current.imageUrl ? (
              <Button asChild size="sm">
                <a href={current.linkUrl}>{current.linkLabel || "자세히 보기"}</a>
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => closeCurrent(false)}>
              닫기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
