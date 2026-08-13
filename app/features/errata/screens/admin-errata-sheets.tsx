// errata Phase 4a §8-5 — 어드민 시트 관리: 교재별 PDF 상태 + 수동 재렌더.
// 자동 재렌더(발행 훅)가 실패했을 때의 복구 경로 (§3.3 — 렌더 실패는 발행과 격리).
import type { Route } from "./+types/admin-errata-sheets";

import { FileTextIcon, RefreshCwIcon } from "lucide-react";
import { useEffect } from "react";
import { data, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { regenerateErrataSheet } from "~/features/errata/pdf/regenerate.server";

export const meta: Route.MetaFunction = () => [
  { title: "추록·정오표 시트 관리 | 리담변리사학원" },
];

async function requireStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  return role;
}

export async function loader({ request }: Route.LoaderArgs) {
  const role = await requireStaff(request);
  const { data: rows, error } = await adminClient
    .from("publication_editions")
    .select(
      "edition_id, edition_label, status, errata_sheet_url, errata_sheet_updated_at, errata_sheet_item_count, publications(title, subject_code)",
    )
    .in("status", ["frozen", "printed"])
    .order("edition_label");
  if (error) throw error;
  // 발행 대기(none) 건수도 함께 — 시트에 아직 안 실린 작업량 감각.
  const { count: unpublished } = await adminClient
    .from("content_revisions")
    .select("revision_id", { count: "exact", head: true })
    .eq("notice_status", "none");
  return {
    role,
    unpublished: unpublished ?? 0,
    sheets: (rows ?? [])
      .map((r) => ({
        editionId: r.edition_id,
        title: r.publications?.title ?? "?",
        label: r.edition_label,
        url: r.errata_sheet_url,
        updatedAt: r.errata_sheet_updated_at,
        itemCount: r.errata_sheet_item_count,
      }))
      .sort((a, b) => a.title.localeCompare(b.title, "ko")),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const role = await requireStaff(request);
  // 재렌더는 파생물 갱신이라 staff 전체 허용 (발행 자체는 fn_publish_errata 가 통제).
  void role;
  const fd = await request.formData();
  const editionId = String(fd.get("editionId") ?? "");
  if (!editionId) return data({ ok: false, error: "editionId 필요" }, { status: 400 });
  const result = await regenerateErrataSheet(editionId);
  if (!result.ok) return data({ ok: false, error: result.error }, { status: 500 });
  return data({ ok: true, itemCount: result.itemCount });
}

export default function AdminErrataSheets({ loaderData }: Route.ComponentProps) {
  const { role, sheets, unpublished } = loaderData;
  const fetcher = useFetcher<{ ok?: boolean; error?: string; itemCount?: number }>();
  const revalidator = useRevalidator();
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.ok) {
      toast.success(`시트 재렌더 완료 (${fetcher.data.itemCount ?? 0}건 수록)`);
      revalidator.revalidate();
    } else if (fetcher.data.error) {
      toast.error(`재렌더 실패: ${fetcher.data.error}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <AdminShell
      cluster="cases"
      role={role}
      width={860}
      title="추록·정오표 시트 관리"
      desc={`발행 즉시 자동 재렌더됩니다 — 이 화면은 실패 복구·수동 갱신용. 미발행 원장 ${unpublished}건`}
    >
      <div className="divide-y rounded-xl border">
        {sheets.map((s) => (
          <div
            key={s.editionId}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <FileTextIcon className="size-4" /> {s.title} {s.label}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {s.updatedAt
                  ? `갱신 ${s.updatedAt.slice(0, 10)} · ${s.itemCount}건 수록`
                  : "아직 시트가 생성되지 않았습니다"}
                {s.url ? (
                  <>
                    {" · "}
                    <a
                      href={`${s.url}?v=${s.updatedAt ? new Date(s.updatedAt).getTime() : 0}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-link underline"
                    >
                      PDF 열기
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <fetcher.Form method="post">
              <input type="hidden" name="editionId" value={s.editionId} />
              <Button type="submit" variant="outline" size="sm" disabled={busy}>
                <RefreshCwIcon className="size-3.5" /> 재렌더
              </Button>
            </fetcher.Form>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
