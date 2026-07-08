// feat-4-A-117 — 조문/판례/문제 우측 패널의 "관련자료(📎)" 탭 본체.
// docs/features/feat-4-A-117-lecture-resources.md §5
// 통합본 PDF 위치링크(pdfLocations) 가 켜져 있으면 조각 대신 "전체 PDF의 해당 페이지 열기"를
// 보여준다(병존 — 없거나 꺼지면 기존 조각으로 폴백).
import {
  ExternalLinkIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import type {
  LectureResourceListItem,
  LectureResourceTargetType,
  PdfLocationItem,
} from "~/features/lectures/queries.server";

interface Props {
  targetType: LectureResourceTargetType;
  targetId: string;
  initial: LectureResourceListItem[];
  canManage: boolean;
  // 통합본 PDF 위치 링크 (조문/판례). 활성+존재 시 조각 대신 이걸 노출.
  pdfLocations?: PdfLocationItem[];
  pdfLocationsEnabled?: boolean;
}

type ActionResponse =
  | { ok: true; intent: "create"; resource: LectureResourceListItem }
  | { ok: true; intent: "delete"; resourceId: string }
  | { ok: true; intent: "signed-url"; signedUrl: string }
  | { ok: false; error: string };

export function LectureResourcesPanel({
  targetType,
  targetId,
  initial,
  canManage,
  pdfLocations,
  pdfLocationsEnabled,
}: Props) {
  const [items, setItems] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);

  // initial 이 바뀌면 (다른 조문으로 이동) 동기화.
  useEffect(() => {
    setItems(initial);
    setShowAdd(false);
  }, [initial]);

  function handleCreated(r: LectureResourceListItem) {
    setItems((prev) => [...prev, r]);
    setShowAdd(false);
  }

  function handleDeleted(resourceId: string) {
    setItems((prev) => prev.filter((r) => r.resourceId !== resourceId));
  }

  // 통합본 위치가 활성+존재하면 전체 PDF 페이지 링크를 보여주고, 아니면 기존 조각 폴백.
  const useLocations =
    !!pdfLocationsEnabled && !!pdfLocations && pdfLocations.length > 0;

  return (
    <div className="space-y-3">
      {canManage && !showAdd ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAdd(true)}
          className="h-7"
        >
          <PlusIcon className="size-3.5" /> 자료 추가
        </Button>
      ) : null}

      {canManage && showAdd ? (
        <UploadForm
          targetType={targetType}
          targetId={targetId}
          onCreated={handleCreated}
          onCancel={() => setShowAdd(false)}
        />
      ) : null}

      {useLocations ? (
        <>
          {canManage ? (
            <p className="text-muted-foreground text-xs">
              통합본 강의노트 위치 — 운영자 미리보기(학생 노출 전)
            </p>
          ) : null}
          <ul className="space-y-2">
            {pdfLocations!.map((loc, i) => (
              <li key={`${loc.page}-${i}`}>
                <LocationCard loc={loc} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {items.length === 0 && !showAdd ? (
            <p className="text-muted-foreground text-sm">
              등록된 강의노트가 없습니다.
            </p>
          ) : null}
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.resourceId}>
                <ResourceCard
                  resource={r}
                  canManage={canManage}
                  onDeleted={handleDeleted}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// 통합본 강의노트의 특정 페이지를 인앱 pdfjs 뷰어(/note)에서 연다.
// pdfjs 가 직접 해당 페이지를 그리므로 데스크톱·모바일 모두 페이지 점프가 동작한다.
function LocationCard({ loc }: { loc: PdfLocationItem }) {
  function handleOpen() {
    window.open(
      `/note/${loc.sourcePdfId}?page=${loc.page}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <div className="bg-card hover:bg-muted/30 group flex items-start gap-2 rounded-md border p-2 transition-colors">
      <FileTextIcon className="text-muted-foreground mt-0.5 size-4 flex-none" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {loc.label ?? "강의노트"}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          통합본 p.{loc.page} / {loc.totalPages}
        </p>
        <div className="mt-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleOpen}
            className="h-7"
          >
            <ExternalLinkIcon className="size-3.5" />
            열기
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({
  resource,
  canManage,
  onDeleted,
}: {
  resource: LectureResourceListItem;
  canManage: boolean;
  onDeleted: (resourceId: string) => void;
}) {
  const openFetcher = useFetcher<ActionResponse>();
  const deleteFetcher = useFetcher<ActionResponse>();

  const opening =
    openFetcher.state === "submitting" || openFetcher.state === "loading";
  const deleting =
    deleteFetcher.state === "submitting" || deleteFetcher.state === "loading";

  // signed URL 응답 받으면 새 탭 open (staff 원본 다운로드 전용).
  useEffect(() => {
    const d = openFetcher.data;
    if (!d) return;
    if (d.ok && d.intent === "signed-url") {
      window.open(d.signedUrl, "_blank", "noopener,noreferrer");
    }
  }, [openFetcher.data]);

  useEffect(() => {
    const d = deleteFetcher.data;
    if (!d) return;
    if (d.ok && d.intent === "delete") {
      onDeleted(d.resourceId);
    }
  }, [deleteFetcher.data, onDeleted]);

  // 유출방지 ① — PDF 조각은 원본 파일 대신 인앱 이미지 뷰어로 연다.
  // 통합본 매핑 조각 = 통합본 뷰어의 해당 페이지 / 미매핑 = 조각 자체 페이지 이미지.
  function handleOpen() {
    if (resource.url) {
      window.open(resource.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!resource.pdfUrl) return;
    const href =
      resource.sourcePdfId && resource.sourcePageStart
        ? `/note/${resource.sourcePdfId}?page=${resource.sourcePageStart}`
        : `/note/${resource.resourceId}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  // staff 전용 — 유지관리용 원본 PDF 다운로드(학생 경로에서는 제거됨).
  function handleStaffDownload() {
    if (!resource.pdfUrl) return;
    const fd = new FormData();
    fd.set("intent", "signed-url");
    fd.set("pdfPath", resource.pdfUrl);
    const downloadName =
      resource.title
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, " ")
        .trim() + ".pdf";
    fd.set("downloadName", downloadName);
    openFetcher.submit(fd, {
      method: "post",
      action: "/api/lecture-resources",
    });
  }

  function handleDelete() {
    if (!window.confirm("이 자료를 삭제하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("resourceId", resource.resourceId);
    deleteFetcher.submit(fd, {
      method: "post",
      action: "/api/lecture-resources",
    });
  }

  const isExternal = !!resource.url;
  const pageLabel = formatPageRange(
    resource.sourcePageStart,
    resource.sourcePageEnd,
  );

  return (
    <div className="bg-card hover:bg-muted/30 group flex items-start gap-2 rounded-md border p-2 transition-colors">
      {isExternal ? (
        <ExternalLinkIcon className="text-muted-foreground mt-0.5 size-4 flex-none" />
      ) : (
        <FileTextIcon className="text-muted-foreground mt-0.5 size-4 flex-none" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{resource.title}</p>
        {pageLabel ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{pageLabel}</p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleOpen}
            disabled={!resource.pdfUrl && !resource.url}
            className="h-7"
          >
            <ExternalLinkIcon className="size-3.5" />
            열기
          </Button>
          {canManage && resource.pdfUrl ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleStaffDownload}
              disabled={opening}
              className="text-muted-foreground h-7"
              title="원본 PDF 다운로드 (운영자 전용)"
            >
              {opening ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <FileTextIcon className="size-3.5" />
              )}
              원본
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="text-muted-foreground hover:text-destructive h-7"
            >
              <Trash2Icon className="size-3.5" />
              삭제
            </Button>
          ) : null}
        </div>
        {openFetcher.data && !openFetcher.data.ok ? (
          <p className="text-destructive mt-1 text-xs">
            {openFetcher.data.error}
          </p>
        ) : null}
        {deleteFetcher.data && !deleteFetcher.data.ok ? (
          <p className="text-destructive mt-1 text-xs">
            {deleteFetcher.data.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function UploadForm({
  targetType,
  targetId,
  onCreated,
  onCancel,
}: {
  targetType: LectureResourceTargetType;
  targetId: string;
  onCreated: (r: LectureResourceListItem) => void;
  onCancel: () => void;
}) {
  const fetcher = useFetcher<ActionResponse>();
  const [title, setTitle] = useState("");
  const submitting =
    fetcher.state === "submitting" || fetcher.state === "loading";

  useEffect(() => {
    const d = fetcher.data;
    if (!d) return;
    if (d.ok && d.intent === "create") {
      onCreated(d.resource);
    }
  }, [fetcher.data, onCreated]);

  // 파일 선택 시 제목을 파일명(확장자 제외)으로 자동 채움. 이미 입력한 제목은 보존.
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const stem = file.name.replace(/\.pdf$/i, "").trim();
    if (stem) setTitle((prev) => (prev.trim() === "" ? stem : prev));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("intent", "create");
    fd.set("targetType", targetType);
    fd.set("targetId", targetId);
    fetcher.submit(fd, {
      method: "post",
      action: "/api/lecture-resources",
      encType: "multipart/form-data",
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-muted/30 space-y-2 rounded-md border p-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">자료 추가</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          className="h-7 w-7 p-0"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lr-file" className="text-xs">
          PDF 파일 (50 MB 이하)
        </Label>
        <Input
          id="lr-file"
          name="file"
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lr-title" className="text-xs">
          제목 <span className="text-muted-foreground">(파일명 자동 입력)</span>
        </Label>
        <Input
          id="lr-title"
          name="title"
          type="text"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="리담특허법 강의노트 (제10판)"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="lr-page-start" className="text-xs">
            시작 페이지
          </Label>
          <Input
            id="lr-page-start"
            name="sourcePageStart"
            type="number"
            min={1}
            placeholder="67"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lr-page-end" className="text-xs">
            끝 페이지
          </Label>
          <Input
            id="lr-page-end"
            name="sourcePageEnd"
            type="number"
            min={1}
            placeholder="72"
          />
        </div>
      </div>

      {fetcher.data && !fetcher.data.ok ? (
        <p className="text-destructive text-xs">{fetcher.data.error}</p>
      ) : null}

      <Button type="submit" size="sm" disabled={submitting} className="w-full">
        {submitting ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
        업로드
      </Button>
    </form>
  );
}

function formatPageRange(start: number | null, end: number | null): string {
  if (!start) return "";
  if (!end || end === start) return `p.${start}`;
  return `p.${start}-${end}`;
}
