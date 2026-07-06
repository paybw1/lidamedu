// 인앱 강의노트 뷰어 — 사전 렌더된 페이지 이미지(WebP) 방식 (유출방지 ①).
// 원본 PDF 는 클라이언트에 전달하지 않는다. 페이지 이미지 signed URL 을
// /api/lecture-note-pages 에서 창(window) 단위로 받아 <img> 로 그린다.
// :sourcePdfId 는 통합본(lecture_source_pdfs) 또는 통합본 미매핑 조각(lecture_resources).
// 다운로드/인쇄 버튼을 두지 않고 컨텍스트메뉴/드래그를 억제해 캐주얼 유출을 줄인다.
import type { Route } from "./+types/lecture-note-viewer";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { data } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  type LectureNotePageKind,
  getLectureNotePageUrls,
} from "~/features/lectures/queries.server";
import { getPdfLocationsEnabled } from "~/features/lectures/settings.server";

// 페이지 URL 창 크기 — 현재 페이지 앞뒤로 이만큼 미리 서명해 넘김을 즉시로.
const PAGE_WINDOW = 10;
// 표시 기본 배율. 이미지는 1600px 폭으로 렌더돼 있어 확대해도 선명.
const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

export const meta: Route.MetaFunction = ({ data: d }) => {
  const t = d?.title
    ? `${d.title} | 리담변리사학원`
    : "강의노트 | 리담변리사학원";
  return [{ title: t }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const id = params.sourcePdfId;
  if (!id) throw data(null, { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data(null, { status: 401 });

  // 하드 스톱 준수 — 학생 노출 플래그가 꺼져 있으면 staff 만 열람(미리보기).
  const [staffRole, flagOn] = await Promise.all([
    getStaffRole(client, user.id),
    getPdfLocationsEnabled(client),
  ]);
  if (staffRole === null && !flagOn) throw data(null, { status: 403 });

  // 통합본 우선, 없으면 조각(resource) — 둘 다 UUID PK 라 충돌 없음.
  let kind: LectureNotePageKind = "src";
  let totalPages: number | null = null;
  let title = "강의노트";
  const { data: src } = await client
    .from("lecture_source_pdfs")
    .select("total_pages, title")
    .eq("source_pdf_id", id)
    .maybeSingle();
  if (src) {
    totalPages = src.total_pages;
    title = src.title;
  } else {
    const { data: res } = await client
      .from("lecture_resources")
      .select("page_count, title")
      .eq("resource_id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (res) {
      kind = "res";
      totalPages = res.page_count;
      title = res.title;
    }
  }
  if (!totalPages) throw data("강의노트를 찾을 수 없습니다.", { status: 404 });

  const requested = Number(
    new URL(request.url).searchParams.get("page") ?? "1",
  );
  const page =
    Number.isFinite(requested) && requested >= 1
      ? Math.min(Math.trunc(requested), totalPages)
      : 1;

  // 첫 화면은 로더에서 바로 서명해 추가 왕복 없이 그린다.
  const [initialUrls, { data: me }] = await Promise.all([
    getLectureNotePageUrls(
      kind,
      id,
      Math.max(1, page - 2),
      Math.min(totalPages, page + PAGE_WINDOW),
    ),
    client
      .from("profiles")
      .select("name, member_no")
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  // 유출방지 ② — 열람자 식별 워터마크(캡처·촬영 유출 시 유출자 특정).
  const stampedAt = new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const watermark = [
    me?.name ?? "회원",
    me?.member_no != null ? `No.${me.member_no}` : null,
    stampedAt,
  ]
    .filter(Boolean)
    .join(" · ");

  return { kind, id, page, totalPages, title, initialUrls, watermark };
}

type UrlMap = Record<number, string>;

export default function LectureNoteViewer({
  loaderData,
}: Route.ComponentProps) {
  const {
    kind,
    id,
    page: initialPage,
    totalPages,
    title,
    initialUrls,
    watermark,
  } = loaderData;

  const [pageNum, setPageNum] = useState(initialPage);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [urls, setUrls] = useState<UrlMap>(initialUrls);
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fetchingRef = useRef<Set<number>>(new Set());

  const clampPage = useCallback(
    (n: number) => Math.min(Math.max(1, n), totalPages),
    [totalPages],
  );
  const goTo = useCallback(
    (n: number) => setPageNum(clampPage(n)),
    [clampPage],
  );

  // 창 단위 URL 확보 — 현재 페이지 주변이 캐시에 없으면 fetch.
  // 만료 재발급은 fresh=true(<img> onError)로 강제.
  const ensureUrls = useCallback(
    async (center: number, fresh = false) => {
      const from = Math.max(1, center - 2);
      const to = Math.min(totalPages, center + PAGE_WINDOW);
      if (fetchingRef.current.has(center)) return;
      fetchingRef.current.add(center);
      try {
        const res = await fetch(
          `/api/lecture-note-pages?kind=${kind}&id=${id}&from=${from}&to=${to}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { urls?: UrlMap };
        if (body.urls) {
          setUrls((prev) => (fresh ? { ...body.urls } : { ...prev, ...body.urls }));
          setLoadError(false);
        }
      } catch {
        setLoadError(true);
      } finally {
        fetchingRef.current.delete(center);
      }
    },
    [kind, id, totalPages],
  );

  // 페이지 이동 시: 현재 페이지 URL 이 없거나 창 끝에 가까우면 선서명.
  useEffect(() => {
    if (!urls[pageNum] || !urls[Math.min(totalPages, pageNum + 3)]) {
      void ensureUrls(pageNum);
    }
  }, [pageNum, urls, totalPages, ensureUrls]);

  // 인접 페이지 프리로드 — 브라우저 캐시에 올려 넘김을 즉시로.
  useEffect(() => {
    for (const n of [pageNum + 1, pageNum - 1]) {
      const u = urls[n];
      if (u && n >= 1 && n <= totalPages) {
        const img = new Image();
        img.src = u;
      }
    }
  }, [pageNum, urls, totalPages]);

  useEffect(() => {
    setPageInput(String(pageNum));
    containerRef.current?.scrollTo({ top: 0 });
  }, [pageNum]);

  function commitPageInput() {
    const n = Number(pageInput);
    if (Number.isFinite(n) && n >= 1) goTo(Math.trunc(n));
    else setPageInput(String(pageNum));
  }

  const currentUrl = urls[pageNum];

  return (
    <div
      className="bg-muted/20 flex min-h-[calc(100vh-3.5rem)] flex-col"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 툴바 — 다운로드/인쇄/저장 버튼 없음 */}
      <div className="bg-background/95 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 backdrop-blur">
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </p>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => goTo(pageNum - 1)}
            disabled={pageNum <= 1}
            aria-label="이전 페이지"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <div className="flex items-center gap-1 text-sm">
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) =>
                setPageInput(e.target.value.replace(/[^0-9]/g, ""))
              }
              onBlur={commitPageInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="border-input bg-background h-8 w-12 rounded-md border text-center"
              aria-label="페이지 번호"
            />
            <span className="text-muted-foreground whitespace-nowrap">
              / {totalPages}
            </span>
          </div>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => goTo(pageNum + 1)}
            disabled={pageNum >= totalPages}
            aria-label="다음 페이지"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <span className="bg-border mx-1 h-5 w-px" aria-hidden />
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))}
            disabled={scale <= MIN_SCALE}
            aria-label="축소"
          >
            <ZoomOutIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
            disabled={scale >= MAX_SCALE}
            aria-label="확대"
          >
            <ZoomInIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* 렌더 영역 — 이미지 폭 = 컨테이너 폭 × scale */}
      <div
        ref={containerRef}
        className="relative flex flex-1 justify-center overflow-auto p-3"
      >
        {currentUrl ? (
          <div
            className="relative self-start"
            style={{ width: `${Math.round(scale * 100)}%`, maxWidth: "none" }}
          >
            <img
              key={`${pageNum}`}
              src={currentUrl}
              alt={`${title} ${pageNum}페이지`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onError={() => void ensureUrls(pageNum, true)}
              className="h-auto w-full rounded shadow-sm select-none"
            />
            {/* 유출방지 ② — 열람자 식별 워터마크. 캡처·촬영물에 신원이 남는다. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded select-none"
            >
              <div className="absolute -inset-[40%] flex rotate-[-20deg] flex-wrap content-around justify-around gap-x-16 gap-y-20">
                {Array.from({ length: 24 }, (_, i) => (
                  <span
                    key={i}
                    className="text-[13px] font-semibold whitespace-nowrap text-[rgba(51,65,85,0.10)]"
                  >
                    {watermark}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-muted-foreground text-sm">
              페이지를 불러오지 못했습니다. 네트워크를 확인한 뒤 다시
              시도하세요.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void ensureUrls(pageNum, true)}
            >
              다시 불러오기
            </Button>
          </div>
        ) : (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" /> 불러오는 중…
          </div>
        )}
      </div>
    </div>
  );
}
