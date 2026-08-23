// /admin/dohae — 도해특허법 전체 유닛 목록(장별) + 팝업 열람. ★이 운영 화면은 staff 전용
// (콘텐츠 자체는 2026-08-23 수험생 공개 — 열람 전원 / 편집 staff).
// 조문 뷰어 칩으로 못 가는 유닛(조문 참조 없는 참고자료 등)의 진입로이자 검수 화면.
// 원본 대조: 각 유닛에 PDF 페이지 번호 표기(교재 원본과 나란히 놓고 확인).

import type { Route } from "./+types/admin-dohae";

import { BookOpenIcon, PencilLineIcon } from "lucide-react";
import { useState } from "react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { HighlightToolbar } from "~/features/annotations/components/highlight-toolbar";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { DohaePopup } from "~/features/dohae/components/dohae-popup";
import { dohaeUnitLabel, type DohaeUnitSummary } from "~/features/dohae/labels";

export const meta: Route.MetaFunction = () => [
  { title: "도해특허법 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  // RLS(staff SELECT) 적용 클라이언트 — 이중 게이트.
  const { data: rows, error } = await client
    .from("dohae_units")
    .select(
      "unit_id, unit_key, kind, title, chapter_no, chapter_title, unit_no, ref_no, pdf_page",
    )
    .eq("book_code", "dohae_patent_20")
    // ★책 순서 = pdf_page. unit_no 로 정렬하면 참고자료(unit_no null)가 장 끝으로 밀려
    //   "참고 1.1 은 정의(法 2) 다음" 같은 원본 배치가 무너진다(원장 지적 2026-08-22).
    .order("chapter_no")
    .order("pdf_page", { nullsFirst: false });
  if (error) throw error;

  const units = (rows ?? []).map((u) => ({
    unitId: u.unit_id,
    unitKey: u.unit_key,
    kind: u.kind as "topic" | "reference",
    title: u.title,
    chapterNo: u.chapter_no,
    chapterTitle: u.chapter_title,
    unitNo: u.unit_no,
    refNo: u.ref_no,
    pdfPage: u.pdf_page,
  }));
  return { role, units };
}

export default function AdminDohae({ loaderData }: Route.ComponentProps) {
  const { role, units } = loaderData;
  const [active, setActive] = useState<(DohaeUnitSummary & { pdfPage: number | null }) | null>(
    null,
  );

  const chapters = new Map<number, typeof units>();
  for (const u of units) {
    const arr = chapters.get(u.chapterNo) ?? [];
    arr.push(u);
    chapters.set(u.chapterNo, arr);
  }

  return (
    <AdminShell
      cluster="laws"
      role={role}
      title="도해특허법"
      desc={`제20판 · 주제 ${units.filter((u) => u.kind === "topic").length} + 참고자료 ${units.filter((u) => u.kind === "reference").length} — 수험생 공개(2026-08-23) — 열람은 전원, 편집은 강사·운영자만. 각 유닛의 p.N 은 원본 PDF 페이지(검수 대조용).`}
    >
      <HighlightToolbar />
      {active ? (
        <DohaePopup
          units={[active]}
          open
          onOpenChange={(v) => {
            if (!v) setActive(null);
          }}
          viewerIsStaff
        />
      ) : null}
      <div className="space-y-5">
        {[...chapters.entries()].map(([chNo, list]) => (
          <section key={chNo} className="bg-card rounded-xl border shadow-sm">
            <h2 className="border-b px-4 py-2.5 text-sm font-bold tracking-tight">
              제{chNo}장 {list[0]?.chapterTitle}
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                ({list.length})
              </span>
            </h2>
            <ul className="divide-border grid grid-cols-1 divide-y md:grid-cols-2 md:divide-y-0">
              {list.map((u) => (
                <li
                  key={u.unitId}
                  className="md:border-border/60 flex items-center md:border-b"
                >
                  <button
                    type="button"
                    onClick={() => setActive(u)}
                    className="hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2.5 px-4 py-2 text-left"
                  >
                    <span className="bg-primary/10 text-link inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-bold tabular-nums">
                      {dohaeUnitLabel(u)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {u.title}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                      {u.pdfPage ? `p.${u.pdfPage}` : ""}
                    </span>
                    <BookOpenIcon className="text-muted-foreground size-3.5 shrink-0" />
                  </button>
                  <Link
                    to={`/admin/dohae/${u.unitKey}`}
                    title="텍스트 편집"
                    className="text-muted-foreground hover:bg-muted/50 hover:text-foreground mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md"
                  >
                    <PencilLineIcon className="size-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
