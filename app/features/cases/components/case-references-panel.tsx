// 판례 관련논문/기사 링크 패널 (feat-4-A-214).
// 모든 사용자는 read-only 리스트. staff (instructor/admin) 일 때 add/edit/delete UI 표출.

import {
  ExternalLinkIcon,
  FileTextIcon,
  NewspaperIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  useFetcher,
  useLocation,
  useNavigate,
} from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import type {
  CaseReference,
  CaseReferenceKind,
} from "~/features/cases/labels";

const KIND_LABELS: Record<CaseReferenceKind, string> = {
  paper: "논문",
  article: "기사",
  other: "기타",
};

const KIND_ICON: Record<CaseReferenceKind, typeof NewspaperIcon> = {
  paper: FileTextIcon,
  article: NewspaperIcon,
  other: ExternalLinkIcon,
};

export function CaseReferencesPanel({
  caseId,
  references,
  canEdit,
}: {
  caseId: string;
  references: CaseReference[];
  canEdit: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);

  if (references.length === 0 && !canEdit) {
    // 학생 시점 — 등록된 자료가 없으면 섹션 자체 숨김.
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold">
          <NewspaperIcon className="text-primary size-4" />
          관련 논문 · 기사
          {references.length > 0 ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              ({references.length})
            </span>
          ) : null}
        </h2>
        {canEdit && !showAdd ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAdd(true)}
            className="h-7"
          >
            <PlusIcon className="size-3.5" /> 자료 추가
          </Button>
        ) : null}
      </div>

      {canEdit && showAdd ? (
        <ReferenceForm
          caseId={caseId}
          onClose={() => setShowAdd(false)}
          mode="create"
        />
      ) : null}

      {references.length === 0 ? (
        <div className="bg-muted/40 rounded-md border border-dashed p-4 text-center">
          <p className="text-muted-foreground text-xs">
            등록된 관련 자료가 없습니다. "자료 추가" 버튼으로 논문·기사 링크를 추가하세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {references.map((r) => (
            <ReferenceItem
              key={r.referenceId}
              reference={r}
              canEdit={canEdit}
              caseId={caseId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReferenceItem({
  reference,
  canEdit,
  caseId,
}: {
  reference: CaseReference;
  canEdit: boolean;
  caseId: string;
}) {
  const [editing, setEditing] = useState(false);
  const delFetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const Icon = KIND_ICON[reference.kind];

  // 삭제 성공 시 페이지 revalidate.
  useEffect(() => {
    if (
      delFetcher.state === "idle" &&
      delFetcher.data &&
      "ok" in delFetcher.data &&
      delFetcher.data.ok
    ) {
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [delFetcher.state, delFetcher.data, navigate, location.pathname, location.search]);

  if (editing) {
    return (
      <li>
        <ReferenceForm
          caseId={caseId}
          reference={reference}
          onClose={() => setEditing(false)}
          mode="update"
        />
      </li>
    );
  }

  const meta: string[] = [];
  if (reference.authors) meta.push(reference.authors);
  if (reference.source) meta.push(reference.source);
  if (reference.publishedAt) meta.push(reference.publishedAt);

  return (
    <li className="bg-card rounded-md border p-3">
      <div className="flex items-start gap-3">
        <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {KIND_LABELS[reference.kind]}
            </Badge>
            <p className="text-sm font-medium">{reference.title}</p>
          </div>
          {meta.length > 0 ? (
            <p className="text-muted-foreground text-xs">{meta.join(" · ")}</p>
          ) : null}
          {reference.note ? (
            <p className="text-muted-foreground text-xs italic">{reference.note}</p>
          ) : null}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {reference.url ? (
              <Button asChild size="sm" variant="outline" className="h-7">
                <a href={reference.url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon className="size-3" /> 외부 링크
                </a>
              </Button>
            ) : null}
            {reference.pdfUrl ? (
              <Button asChild size="sm" variant="outline" className="h-7">
                <a href={reference.pdfUrl} target="_blank" rel="noreferrer">
                  <FileTextIcon className="size-3" /> PDF 열기
                </a>
              </Button>
            ) : null}
          </div>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setEditing(true)}
              aria-label="수정"
              className="size-7"
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <delFetcher.Form method="post" action="/api/admin/case-reference">
              <input type="hidden" name="intent" value="delete" />
              <input
                type="hidden"
                name="referenceId"
                value={reference.referenceId}
              />
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                aria-label="삭제"
                className="size-7 text-rose-600 hover:text-rose-700"
                disabled={delFetcher.state !== "idle"}
                onClick={(e) => {
                  if (!confirm(`"${reference.title}" 자료를 삭제하시겠습니까?`)) {
                    e.preventDefault();
                  }
                }}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </delFetcher.Form>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ReferenceForm({
  caseId,
  reference,
  onClose,
  mode,
}: {
  caseId: string;
  reference?: CaseReference;
  onClose: () => void;
  mode: "create" | "update";
}) {
  const fetcher = useFetcher<{ ok?: true; error?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isSaving = fetcher.state !== "idle";
  const hasError = fetcher.data && "error" in fetcher.data;

  // 저장 성공 시 폼 닫고 revalidate.
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data &&
      "ok" in fetcher.data &&
      fetcher.data.ok
    ) {
      onClose();
      navigate(location.pathname + location.search, {
        replace: true,
        preventScrollReset: true,
      });
    }
  }, [fetcher.state, fetcher.data, onClose, navigate, location.pathname, location.search]);

  return (
    <fetcher.Form
      method="post"
      action="/api/admin/case-reference"
      className="bg-muted/30 space-y-3 rounded-md border p-3"
    >
      <input type="hidden" name="intent" value={mode} />
      {mode === "create" ? (
        <input type="hidden" name="caseId" value={caseId} />
      ) : (
        <input type="hidden" name="referenceId" value={reference!.referenceId} />
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
        <Field label="유형">
          <select
            name="kind"
            defaultValue={reference?.kind ?? "paper"}
            className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
          >
            <option value="paper">논문</option>
            <option value="article">기사</option>
            <option value="other">기타</option>
          </select>
        </Field>
        <Field label="제목 *">
          <Input
            name="title"
            required
            maxLength={500}
            defaultValue={reference?.title ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="저자">
          <Input
            name="authors"
            maxLength={500}
            defaultValue={reference?.authors ?? ""}
            className="h-8 text-xs"
            placeholder="예: 홍길동 / 홍길동 외 2인"
          />
        </Field>
        <Field label="출처">
          <Input
            name="source"
            maxLength={500}
            defaultValue={reference?.source ?? ""}
            className="h-8 text-xs"
            placeholder="예: 산업재산권 학회 vol.32 (2024)"
          />
        </Field>
        <Field label="발행일">
          <Input
            name="publishedAt"
            type="date"
            defaultValue={reference?.publishedAt ?? ""}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="순서">
          <Input
            name="ord"
            type="number"
            min={0}
            max={9999}
            defaultValue={reference?.ord ?? 0}
            className="h-8 text-xs"
          />
        </Field>
        <Field label="외부 링크">
          <Input
            name="url"
            type="url"
            maxLength={2000}
            defaultValue={reference?.url ?? ""}
            className="h-8 text-xs"
            placeholder="https://"
          />
        </Field>
        <Field label="PDF URL">
          <Input
            name="pdfUrl"
            type="url"
            maxLength={2000}
            defaultValue={reference?.pdfUrl ?? ""}
            className="h-8 text-xs"
            placeholder="Supabase Storage 또는 외부 PDF URL"
          />
        </Field>
        <Field label="메모">
          <textarea
            name="note"
            maxLength={2000}
            defaultValue={reference?.note ?? ""}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-xs"
            placeholder="이 자료에 대한 강사 메모"
          />
        </Field>
      </div>
      {hasError ? (
        <p className="text-rose-600 text-xs">
          {(fetcher.data as { error: string }).error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          <XIcon className="size-3.5" /> 취소
        </Button>
        <Button type="submit" size="sm" disabled={isSaving}>
          {mode === "create" ? "추가" : "저장"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Label className="text-muted-foreground text-[11px] sm:self-center">
        {label}
      </Label>
      {children}
    </>
  );
}
