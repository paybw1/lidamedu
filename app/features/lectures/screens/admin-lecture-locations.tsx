// PART2 — 강사 강의노트 위치 확인·교정 화면. /admin/lecture-locations (staff 전용)
// 순서 목록 + 진척도 + pdfjs 옆패널 즉시 열람 + 페이지 수정/추가/삭제 + 라벨 보강 + 확인 표시.
import type { Route } from "./+types/admin-lecture-locations";

import {
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { data, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";
import { LectureNoteInlineViewer } from "~/features/lectures/components/lecture-note-inline-viewer";
import {
  type PdfLocationReviewItem,
  addPdfLocation,
  deletePdfLocation,
  getOriginalPdfSignedUrl,
  listPdfLocationsForReview,
  setPdfLocationVerified,
  updatePdfLocationLabel,
  updatePdfLocationPage,
} from "~/features/lectures/queries.server";

export const meta: Route.MetaFunction = () => [
  { title: "강의노트 위치 확인 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data(null, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data(null, { status: 403 });

  const review = await listPdfLocationsForReview(client);
  const signedUrl = review.storagePath
    ? await getOriginalPdfSignedUrl(client, review.storagePath, 3600)
    : "";
  return { ...review, signedUrl, role };
}

const pageSchema = z.coerce.number().int().positive();

export async function action({ request }: Route.ActionArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false, error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  try {
    if (intent === "verify") {
      await setPdfLocationVerified(
        client,
        String(fd.get("locationId")),
        user.id,
        fd.get("verified") === "1",
      );
      return data({ ok: true, intent });
    }
    if (intent === "update-page") {
      const page = pageSchema.parse(fd.get("page"));
      await updatePdfLocationPage(client, String(fd.get("locationId")), page);
      return data({ ok: true, intent });
    }
    if (intent === "update-label") {
      const raw = String(fd.get("label") ?? "").trim();
      await updatePdfLocationLabel(
        client,
        String(fd.get("locationId")),
        raw.length ? raw.slice(0, 200) : null,
      );
      return data({ ok: true, intent });
    }
    if (intent === "delete") {
      await deletePdfLocation(client, String(fd.get("locationId")));
      return data({ ok: true, intent });
    }
    if (intent === "add") {
      const targetType = z
        .enum(["article", "case"])
        .parse(fd.get("targetType"));
      const page = pageSchema.parse(fd.get("page"));
      const label = String(fd.get("label") ?? "").trim();
      await addPdfLocation(client, {
        targetType,
        targetId: String(fd.get("targetId")),
        sourcePdfId: String(fd.get("sourcePdfId")),
        page,
        label: label.length ? label.slice(0, 200) : null,
      });
      return data({ ok: true, intent });
    }
    return data({ ok: false, error: "Invalid intent" }, { status: 400 });
  } catch (e) {
    const msg =
      e instanceof z.ZodError
        ? "페이지 번호가 올바르지 않습니다."
        : e instanceof Error
          ? e.message
          : "처리 실패";
    return data({ ok: false, error: msg }, { status: 400 });
  }
}

export default function AdminLectureLocations({
  loaderData,
}: Route.ComponentProps) {
  const { items, totalPages, signedUrl, verifiedCount, role } = loaderData;
  const [onlyUnverified, setOnlyUnverified] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(
    items.find((i) => !i.verifiedAt)?.locationId ??
      items[0]?.locationId ??
      null,
  );

  const visible = useMemo(
    () => (onlyUnverified ? items.filter((i) => !i.verifiedAt) : items),
    [items, onlyUnverified],
  );
  const selected = items.find((i) => i.locationId === selectedId) ?? null;
  const pct = items.length
    ? Math.round((verifiedCount / items.length) * 100)
    : 0;

  return (
    <AdminShell
      cluster="laws"
      role={role}
      title="강의노트 위치 확인"
      desc="통합본 PDF 위치 링크를 순서대로 확인·교정합니다. 행을 선택하면 옆 뷰어가 그 페이지를 바로 보여줍니다. 페이지 수정/추가/삭제·라벨 보강·확인 표시가 가능합니다."
      width={1400}
      headerRight={
        <Badge variant="secondary" className="tabular-nums">
          {verifiedCount} / {items.length} 확인 ({pct}%)
        </Badge>
      }
    >
      {/* 진척도 */}
      <div className="mb-4">
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <Button
          size="sm"
          variant={onlyUnverified ? "default" : "outline"}
          onClick={() => setOnlyUnverified(true)}
          className="h-7"
        >
          미확인만 ({items.filter((i) => !i.verifiedAt).length})
        </Button>
        <Button
          size="sm"
          variant={onlyUnverified ? "outline" : "default"}
          onClick={() => setOnlyUnverified(false)}
          className="h-7"
        >
          전체 ({items.length})
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">위치 링크가 없습니다.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
          {/* 목록 */}
          <div className="max-h-[calc(100vh-16rem)] space-y-1 overflow-auto pr-1">
            {visible.map((it) => (
              <button
                key={it.locationId}
                type="button"
                onClick={() => setSelectedId(it.locationId)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                  it.locationId === selectedId
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40",
                  it.verifiedAt ? "opacity-60" : "",
                )}
              >
                {it.verifiedAt ? (
                  <CheckCircle2Icon className="size-4 flex-none text-emerald-600" />
                ) : (
                  <CircleIcon className="text-muted-foreground/40 size-4 flex-none" />
                )}
                <span className="w-28 flex-none truncate font-medium">
                  {it.targetType === "article" ? `제${it.number}조` : it.number}
                </span>
                <span className="text-muted-foreground w-16 flex-none tabular-nums">
                  p.{it.page}
                </span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                  {it.label ?? ""}
                </span>
              </button>
            ))}
            {visible.length === 0 ? (
              <p className="text-muted-foreground px-1 py-4 text-sm">
                모두 확인했습니다 🎉
              </p>
            ) : null}
          </div>

          {/* 상세 + 뷰어 */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            {selected ? (
              <DetailPanel
                key={selected.locationId}
                item={selected}
                totalPages={totalPages}
                signedUrl={signedUrl}
              />
            ) : (
              <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
                왼쪽에서 항목을 선택하세요.
              </p>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

type ActionResponse =
  | { ok: true; intent: string }
  | { ok: false; error: string };

function DetailPanel({
  item,
  totalPages,
  signedUrl,
}: {
  item: PdfLocationReviewItem;
  totalPages: number;
  signedUrl: string;
}) {
  const fetcher = useFetcher<ActionResponse>();
  const addFetcher = useFetcher<ActionResponse>();
  const busy = fetcher.state !== "idle";
  const [page, setPage] = useState(String(item.page));
  const [label, setLabel] = useState(item.label ?? "");

  // 다른 행으로 바뀌면(같은 컴포넌트 재사용 대비) 입력 동기화. key로 remount 되지만 안전망.
  useEffect(() => {
    setPage(String(item.page));
    setLabel(item.label ?? "");
  }, [item.locationId, item.page, item.label]);

  function submit(fields: Record<string, string>) {
    fetcher.submit(fields, { method: "post" });
  }

  const title =
    item.targetType === "article" ? `제${item.number}조` : item.number;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-bold">
          {title}{" "}
          <span className="text-muted-foreground font-normal">
            · 통합본 p.{item.page}
          </span>
        </p>
        {item.verifiedAt ? (
          <Badge variant="secondary" className="flex-none text-[10px]">
            <CheckCircle2Icon className="size-3 text-emerald-600" /> 확인됨
          </Badge>
        ) : null}
      </div>

      {signedUrl ? (
        <LectureNoteInlineViewer
          signedUrl={signedUrl}
          page={item.page}
          totalPages={totalPages}
        />
      ) : (
        <p className="text-muted-foreground text-sm">통합본 PDF가 없습니다.</p>
      )}

      {/* 페이지 수정 */}
      <div className="flex items-end gap-2">
        <label className="flex-1 space-y-1">
          <span className="text-muted-foreground text-xs">페이지</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => setPage(e.target.value.replace(/[^0-9]/g, ""))}
            className="h-8"
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busy || page === "" || page === String(item.page)}
          onClick={() =>
            submit({
              intent: "update-page",
              locationId: item.locationId,
              page,
            })
          }
        >
          페이지 변경
        </Button>
      </div>

      {/* 라벨 보강 */}
      <div className="flex items-end gap-2">
        <label className="flex-1 space-y-1">
          <span className="text-muted-foreground text-xs">
            라벨 (예: 제29조 제2항 — 분리블록 구분)
          </span>
          <Input
            type="text"
            maxLength={200}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8"
          />
        </label>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={busy || label === (item.label ?? "")}
          onClick={() =>
            submit({
              intent: "update-label",
              locationId: item.locationId,
              label,
            })
          }
        >
          라벨 저장
        </Button>
      </div>

      {/* 확인 / 삭제 */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 flex-1"
          variant={item.verifiedAt ? "outline" : "default"}
          disabled={busy}
          onClick={() =>
            submit({
              intent: "verify",
              locationId: item.locationId,
              verified: item.verifiedAt ? "0" : "1",
            })
          }
        >
          {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
          {item.verifiedAt ? "확인 취소" : "확인 완료"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive h-8"
          disabled={busy}
          onClick={() => {
            if (window.confirm("이 위치 링크를 삭제하시겠습니까?"))
              submit({ intent: "delete", locationId: item.locationId });
          }}
        >
          <Trash2Icon className="size-3.5" /> 삭제
        </Button>
      </div>
      {fetcher.data && !fetcher.data.ok ? (
        <p className="text-destructive text-xs">{fetcher.data.error}</p>
      ) : null}

      {/* 이 대상에 페이지 추가 (분리블록 누락 보강) */}
      <addFetcher.Form
        method="post"
        className="bg-muted/30 flex items-end gap-2 rounded-md border p-2"
      >
        <input type="hidden" name="intent" value="add" />
        <input type="hidden" name="targetType" value={item.targetType} />
        <input type="hidden" name="targetId" value={item.targetId} />
        <input type="hidden" name="sourcePdfId" value={item.sourcePdfId} />
        <label className="flex-1 space-y-1">
          <span className="text-muted-foreground text-xs">
            이 {item.targetType === "article" ? "조문" : "판례"}에 페이지 추가
          </span>
          <Input
            type="number"
            name="page"
            min={1}
            max={totalPages}
            placeholder="페이지 번호"
            className="h-8"
            required
          />
        </label>
        <Input
          type="text"
          name="label"
          maxLength={200}
          placeholder="라벨(선택)"
          className="h-8 flex-1"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={addFetcher.state !== "idle"}
        >
          <PlusIcon className="size-3.5" /> 추가
        </Button>
      </addFetcher.Form>
      {addFetcher.data && !addFetcher.data.ok ? (
        <p className="text-destructive text-xs">{addFetcher.data.error}</p>
      ) : null}
    </div>
  );
}
