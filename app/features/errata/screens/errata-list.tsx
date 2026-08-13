// errata Phase 4a §4 — 학습정보 > 추록·정오표 목록.
// 교재별 누적 PDF(고정 URL) 다운로드. 항목 0건 교재도 표시(안심 효과).
// 데이터는 publication_editions 캐시 컬럼 3개만 읽는다 — 원장 스냅샷 비노출(§5).
import type { Route } from "./+types/errata-list";

import { DownloadIcon, FileTextIcon } from "lucide-react";

import makeServerClient from "~/core/lib/supa-client.server";

export const meta: Route.MetaFunction = () => [
  { title: "추록·정오표 | 리담변리사학원" },
];

const NEW_WINDOW_MS = 7 * 24 * 3_600_000;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  // RLS: editions(frozen/printed/superseded)·publications(deleted null) 학생 읽기 허용.
  const { data: rows, error } = await client
    .from("publication_editions")
    .select(
      "edition_id, edition_label, target_exam_year, status, errata_sheet_url, errata_sheet_updated_at, errata_sheet_item_count, publications(title, subject_code)",
    )
    .in("status", ["frozen", "printed"]);
  if (error) throw error;

  const now = Date.now();
  const books = (rows ?? [])
    .map((r) => ({
      editionId: r.edition_id,
      title: r.publications?.title ?? "?",
      editionLabel: r.edition_label,
      examYear: r.target_exam_year,
      url: r.errata_sheet_url,
      updatedAt: r.errata_sheet_updated_at,
      itemCount: r.errata_sheet_item_count,
      isNew:
        r.errata_sheet_updated_at != null &&
        r.errata_sheet_item_count > 0 &&
        now - new Date(r.errata_sheet_updated_at).getTime() < NEW_WINDOW_MS,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "ko"));
  return { books };
}

export default function ErrataList({ loaderData }: Route.ComponentProps) {
  const { books } = loaderData;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <FileTextIcon className="size-5" /> 추록 · 정오표
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        시험 대비 교재의 정오 안내입니다. 출력해서 교재에 끼워 사용하세요.
      </p>

      <div className="mt-6 divide-y rounded-xl border">
        {books.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            등록된 교재가 없습니다.
          </p>
        ) : (
          books.map((b) => {
            const hasSheet = b.itemCount > 0 && b.url;
            const href = hasSheet
              ? `${b.url}?v=${new Date(b.updatedAt!).getTime()}`
              : null;
            return (
              <div
                key={b.editionId}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {b.title} {b.editionLabel}
                    {b.isNew ? (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                        NEW
                      </span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {hasSheet
                      ? `최종 갱신 ${b.updatedAt!.slice(0, 10)} · ${b.itemCount}건`
                      : "아직 등록된 정오 사항이 없습니다."}
                  </p>
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="border-input hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold"
                  >
                    <DownloadIcon className="size-3.5" /> PDF 받기
                  </a>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <p className="text-muted-foreground mt-4 text-[11px] leading-relaxed">
        · 파일 주소는 고정입니다 — 같은 링크에서 항상 최신 내용을 받을 수 있습니다.
        <br />· 시험일 이후 시행되는 개정은 문서 하단 "참고" 섹션에 분리되어 있습니다.
        답안 작성 시 반영하지 마세요.
      </p>
    </div>
  );
}
