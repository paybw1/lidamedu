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

// 억제 값 형식 — "day:<ts>"(오늘 하루) / "never:<ts>"(앞으로 보지 않기) / "tmp:<ts>"(단순 닫기·링크 클릭).
// 정책: 팝업은 로그인마다 다시 표시 — 로그인 마커(popup_login_reset 쿠키)를 보면
// tmp 억제만 해제하고, 사용자의 명시적 옵트아웃(day·never)은 유지한다.
function hiddenUntilMs(noticeId: string): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + noticeId) ?? "0";
    return Number(raw.replace(/^(day|never|tmp):/, ""));
  } catch {
    return 0;
  }
}

function setSuppression(
  noticeId: string,
  kind: "day" | "never" | "tmp",
  untilMs: number,
): void {
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + noticeId,
      `${kind}:${untilMs}`,
    );
  } catch {
    // localStorage 불가(프라이빗 모드 등) — 이번 렌더에서만 닫힘.
  }
}

function hideToday(noticeId: string): void {
  const end = new Date();
  end.setHours(24, 0, 0, 0); // 오늘 자정까지
  setSuppression(noticeId, "day", end.getTime());
}

// 앞으로 보지 않기 — 이 공지는 이 기기에서 다시 표시하지 않음(로그인 리셋에도 유지).
const NEVER_MS = 4102444800000; // 2100-01-01
function hideForever(noticeId: string): void {
  setSuppression(noticeId, "never", NEVER_MS);
}

// 로그인 직후 1회 — tmp 억제(레거시 bare 숫자 포함) 해제 후 마커 쿠키 제거.
function resetTmpSuppressionsOnLogin(): void {
  try {
    if (!/(?:^|;\s*)popup_login_reset=1/.test(document.cookie)) return;
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const raw = window.localStorage.getItem(key) ?? "";
      if (!raw.startsWith("day:") && !raw.startsWith("never:")) {
        window.localStorage.removeItem(key);
      }
    }
    document.cookie = "popup_login_reset=; Path=/; Max-Age=0; SameSite=Lax";
  } catch {
    // 무시 — 다음 로그인에서 재시도.
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
    // 로그인 직후면 단순 닫기 억제 해제 — 팝업은 로그인마다 다시 표시(정책).
    resetTmpSuppressionsOnLogin();
    const now = Date.now();
    setVisible(notices.filter((n) => hiddenUntilMs(n.noticeId) < now));
  }, [notices]);

  const current = visible[0];
  if (!current) return null;

  const closeCurrent = (mode: "tmp" | "day" | "never") => {
    if (mode === "day") hideToday(current.noticeId);
    else if (mode === "never") hideForever(current.noticeId);
    // 단순 닫기·링크 클릭 — 이 세션에선 다시 안 뜨게 짧게(10분) 기억. 다음 로그인 때 리셋.
    else setSuppression(current.noticeId, "tmp", Date.now() + 10 * 60 * 1000);
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
            onClick={() => closeCurrent("tmp")}
            aria-label="닫기"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto px-5 py-4">
          {current.imageUrl ? (
            current.linkUrl ? (
              // ★링크 클릭 시 닫힘 기억을 먼저 기록 — 전체 페이지 이동 후 도착 화면에서
              //   같은 팝업이 즉시 재등장해 "이동이 안 된 것처럼" 보이는 문제 방지.
              <a
                href={current.linkUrl}
                aria-label={current.linkLabel || "자세히 보기"}
                onClick={() => closeCurrent("tmp")}
              >
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
        <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => closeCurrent("day")}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            >
              오늘 하루 보지 않기
            </button>
            <button
              type="button"
              onClick={() => closeCurrent("never")}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            >
              앞으로 보지 않기
            </button>
          </div>
          <div className="flex items-center gap-2">
            {/* 이미지 팝업은 이미지 안 CTA + 이미지 클릭이 링크 역할 — 푸터 버튼 중복 제거. */}
            {current.linkUrl && !current.imageUrl ? (
              <Button asChild size="sm">
                <a href={current.linkUrl} onClick={() => closeCurrent("tmp")}>
                  {current.linkLabel || "자세히 보기"}
                </a>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => closeCurrent("tmp")}
            >
              닫기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
