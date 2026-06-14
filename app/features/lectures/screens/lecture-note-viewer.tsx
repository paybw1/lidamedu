// 인앱 강의노트 PDF 뷰어 (feat: 통합본 위치 링크 점프).
// 강의노트 위치 링크(lecture_pdf_locations)가 이 라우트를 ?page=N 으로 연다.
// pdfjs 가 직접 해당 페이지를 그리므로 브라우저 네이티브 #page 에 의존하지 않는다(모바일 호환).
// 다운로드/인쇄 버튼을 두지 않고 컨텍스트메뉴/드래그를 억제해 캐주얼 유출을 줄인다(완벽 차단 아님).
import type { Route } from "./+types/lecture-note-viewer";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Loader2Icon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { data, useRevalidator } from "react-router";

import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import type { LoadedPdf } from "~/features/lectures/lib/pdf-render.client";
import { getOriginalPdfSignedUrl } from "~/features/lectures/queries.server";
import { getPdfLocationsEnabled } from "~/features/lectures/settings.server";

// signed URL TTL — 짧게(10분). 만료 시 라우트 재검증으로 재발급.
const VIEWER_SIGNED_URL_TTL_SEC = 600;
// scale = 화면 표시 배율(렌더는 dpr 보정). fit 이 MIN 미만으로 깎이지 않게 MIN 을 낮게.
const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

export const meta: Route.MetaFunction = ({ data: d }) => {
  const t = d?.title
    ? `${d.title} | Lidam Patent Attorney Academy`
    : "강의노트 | Lidam Patent Attorney Academy";
  return [{ title: t }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const sourcePdfId = params.sourcePdfId;
  if (!sourcePdfId) throw data(null, { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data(null, { status: 401 });

  // 하드 스톱 준수 — 학생 노출 플래그가 꺼져 있으면 staff 만 열람(미리보기).
  // 플래그가 켜지면(학생 노출 승인) 학생도 인앱 뷰어를 연다.
  const [staffRole, flagOn] = await Promise.all([
    getStaffRole(client, user.id),
    getPdfLocationsEnabled(client),
  ]);
  if (staffRole === null && !flagOn) throw data(null, { status: 403 });

  // 등록된 원본만 — 임의 storage 경로 서명 방지. RLS(authenticated select)가 추가 강제.
  const { data: src } = await client
    .from("lecture_source_pdfs")
    .select("storage_path, total_pages, title")
    .eq("source_pdf_id", sourcePdfId)
    .maybeSingle();
  if (!src) throw data("원본 PDF를 찾을 수 없습니다.", { status: 404 });

  const signedUrl = await getOriginalPdfSignedUrl(
    client,
    src.storage_path,
    VIEWER_SIGNED_URL_TTL_SEC,
  );

  const requested = Number(
    new URL(request.url).searchParams.get("page") ?? "1",
  );
  const page =
    Number.isFinite(requested) && requested >= 1
      ? Math.min(Math.trunc(requested), src.total_pages)
      : 1;

  return {
    signedUrl,
    page,
    totalPages: src.total_pages,
    title: src.title,
  };
}

type ViewState = "loading" | "ready" | "error";

export default function LectureNoteViewer({
  loaderData,
}: Route.ComponentProps) {
  const { signedUrl, page: initialPage, totalPages, title } = loaderData;
  const revalidator = useRevalidator();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfRef = useRef<LoadedPdf | null>(null);
  const [state, setState] = useState<ViewState>("loading");
  const [pageNum, setPageNum] = useState(initialPage);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [pageInput, setPageInput] = useState(String(initialPage));

  const clampPage = useCallback(
    (n: number) => Math.min(Math.max(1, n), totalPages),
    [totalPages],
  );
  const goTo = useCallback(
    (n: number) => setPageNum(clampPage(n)),
    [clampPage],
  );

  // PDF 로드 (signedUrl 단위 1회). 진입 페이지 기준 컨테이너 폭에 맞춰 기본 배율 결정.
  // 언마운트/URL 변경(만료 재발급) 시 destroy.
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const { loadPdf } = await import(
          "~/features/lectures/lib/pdf-render.client"
        );
        const pdf = await loadPdf(signedUrl);
        if (cancelled) {
          void pdf.destroy();
          return;
        }
        pdfRef.current = pdf;
        try {
          const nativeW = await pdf.pageWidth(initialPage);
          const avail = (window.innerWidth || 800) - 32;
          if (nativeW > 0 && avail > 0) {
            setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, avail / nativeW)));
          }
        } catch {
          // 기본 배율 유지
        }
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      const p = pdfRef.current;
      pdfRef.current = null;
      if (p) void p.destroy();
    };
  }, [signedUrl, initialPage]);

  // 현재 페이지 렌더 (ready + pageNum/scale 변경 시). 헬퍼가 진행 중 렌더를 취소한다.
  useEffect(() => {
    if (state !== "ready") return;
    const pdf = pdfRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    let active = true;
    pdf.renderPage(pageNum, canvas, scale).catch(() => {
      if (active) setState("error");
    });
    return () => {
      active = false;
    };
  }, [state, pageNum, scale]);

  // 페이지가 바뀌면 입력칸 동기화.
  useEffect(() => {
    setPageInput(String(pageNum));
  }, [pageNum]);

  function commitPageInput() {
    const n = Number(pageInput);
    if (Number.isFinite(n) && n >= 1) goTo(Math.trunc(n));
    else setPageInput(String(pageNum));
  }

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
            disabled={pageNum <= 1 || state !== "ready"}
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
            disabled={pageNum >= totalPages || state !== "ready"}
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
            disabled={scale <= MIN_SCALE || state !== "ready"}
            aria-label="축소"
          >
            <ZoomOutIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="size-8"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))}
            disabled={scale >= MAX_SCALE || state !== "ready"}
            aria-label="확대"
          >
            <ZoomInIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* 렌더 영역 */}
      <div className="relative flex flex-1 justify-center overflow-auto p-3">
        <canvas
          ref={canvasRef}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className={
            "h-auto max-w-none self-start rounded shadow-sm select-none " +
            (state === "ready" ? "" : "invisible")
          }
        />
        {state === "loading" ? (
          <div className="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" /> 불러오는 중…
          </div>
        ) : null}
        {state === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-muted-foreground text-sm">
              강의노트를 불러오지 못했습니다. 링크가 만료되었을 수 있습니다.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => revalidator.revalidate()}
              disabled={revalidator.state !== "idle"}
            >
              {revalidator.state !== "idle" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : null}
              다시 불러오기
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
