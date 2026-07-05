// 화면 안 "?" 도움 버튼 — 그 화면의 이용 가이드(글+영상)를 사이드 패널로 보여준다.
// 콘텐츠 = guide_articles.screen_key 매칭(운영자가 /admin/guides 에서 작성).
// 가이드가 없으면 허브 안내만 — 버튼은 항상 떠서 진입점이 일정하게 유지된다.
import { HelpCircleIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useFetcher } from "react-router";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/core/components/ui/sheet";
import { MarkdownView } from "~/features/problems/components/markdown-view";

interface HelpGuide {
  guideId: string;
  title: string;
  category: string;
  bodyMd: string;
  youtubeUrl: string | null;
}

// 유튜브 영상 ID 추출 — watch?v= / youtu.be/ / shorts/ / embed/ 수용.
function extractYoutubeId(url: string): string | null {
  const m =
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(
      url,
    );
  return m?.[1] ?? null;
}

// 노출 판정 캐시(24h) — 화면마다 재조회하지 않게. 클릭 여부는 기기 전역 1회 플래그.
const VIS_CACHE_KEY = "guideHelp:vis:v1";
const CLICKED_KEY = "guideHelp:clicked:v1";

function readVisCache(): boolean | null {
  try {
    const raw = localStorage.getItem(VIS_CACHE_KEY);
    if (!raw) return null;
    const { show, until } = JSON.parse(raw) as { show: boolean; until: number };
    if (Date.now() > until) return null;
    return !!show;
  } catch {
    return null;
  }
}

export function GuideHelpButton({
  screenKey,
  className,
}: {
  screenKey: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // 노출 여부 — 사용자 결정: staff 상시, 학생은 구독 시작 3개월까지(서버 판정, 24h 캐시).
  const [show, setShow] = useState<boolean | null>(null);
  // 반짝임 — 한 번이라도 클릭하기 전까지(기기 전역). SSR 불일치 방지 위해 effect 에서 판독.
  const [clicked, setClicked] = useState(true);
  const fetcher = useFetcher<{ guides: HelpGuide[] }>();

  useEffect(() => {
    setClicked(localStorage.getItem(CLICKED_KEY) === "1");
    const cached = readVisCache();
    if (cached !== null) {
      setShow(cached);
      return;
    }
    fetch("/api/guide-help-visibility")
      .then((r) => (r.ok ? r.json() : { show: true }))
      .then((d: { show?: boolean }) => {
        const next = d?.show !== false;
        try {
          localStorage.setItem(
            VIS_CACHE_KEY,
            JSON.stringify({ show: next, until: Date.now() + 24 * 3600_000 }),
          );
        } catch {
          /* storage 불가 환경 — 캐시 없이 진행 */
        }
        setShow(next);
      })
      .catch(() => setShow(true)); // 판정 실패 = 보수적으로 노출(무해)
  }, []);

  // 처음 열 때 한 번만 로드.
  useEffect(() => {
    if (open && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/api/guide-help?key=${encodeURIComponent(screenKey)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const guides = fetcher.data?.guides ?? [];
  const loading = !fetcher.data && fetcher.state !== "idle";

  if (show !== true) return null;

  const onOpen = () => {
    setOpen(true);
    if (!clicked) {
      try {
        localStorage.setItem(CLICKED_KEY, "1");
      } catch {
        /* noop */
      }
      setClicked(true);
    }
  };

  return (
    <>
      <span className={"relative inline-flex shrink-0 " + (className ?? "")}>
        {!clicked ? (
          <>
            <span
              aria-hidden
              className="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full opacity-75 motion-safe:animate-ping"
            />
            <span
              aria-hidden
              className="bg-primary absolute -top-0.5 -right-0.5 size-2 rounded-full"
            />
          </>
        ) : null}
        <button
          type="button"
          onClick={onOpen}
          aria-label="이 화면 사용법 보기"
          title="이 화면 사용법"
          className="border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary inline-flex size-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition-colors"
        >
          <HelpCircleIcon className="size-4" />
        </button>
      </span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="inline-flex items-center gap-1.5 text-base">
              <HelpCircleIcon className="text-link size-4" /> 이 화면 사용법
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-6 px-4 pb-6">
            {loading ? (
              <p className="text-muted-foreground text-sm">불러오는 중…</p>
            ) : guides.length === 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  이 화면의 가이드를 준비하고 있습니다. 다른 기능 사용법은 이용
                  가이드에서 볼 수 있습니다.
                </p>
                <Link
                  to="/guide"
                  className="text-link text-sm font-semibold underline underline-offset-2"
                  onClick={() => setOpen(false)}
                >
                  이용 가이드 전체 보기
                </Link>
              </div>
            ) : (
              <>
                {guides.map((g) => {
                  const videoId = g.youtubeUrl
                    ? extractYoutubeId(g.youtubeUrl)
                    : null;
                  return (
                    <article key={g.guideId} className="space-y-3">
                      <h3 className="text-foreground text-sm font-bold">
                        {g.title}
                      </h3>
                      {videoId ? (
                        <div className="border-border aspect-video w-full overflow-hidden rounded-lg border">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title={g.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="h-full w-full"
                          />
                        </div>
                      ) : null}
                      {g.bodyMd.trim() ? (
                        <div className="text-sm leading-relaxed">
                          <MarkdownView text={g.bodyMd} trusted={false} />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                <Link
                  to="/guide"
                  className="text-link inline-block text-xs font-semibold underline underline-offset-2"
                  onClick={() => setOpen(false)}
                >
                  이용 가이드 전체 보기 →
                </Link>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
