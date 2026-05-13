// 판례 등록/수정 폼 (feat-7-005). staff(instructor/admin) 전용.
// /admin/cases/edit (new) | /admin/cases/edit/:caseId (update).

import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GavelIcon,
  NetworkIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { Form, Link, data, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { COURT_LABELS } from "~/features/cases/labels";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-case-edit";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d?.kase) return [{ title: "판례 등록 | Lidam Edu" }];
  return [{ title: `${d.kase.case_number} 편집 | Lidam Edu` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const caseId = params.caseId ?? null;
  if (!caseId) return { kase: null };
  const { data: row, error } = await client
    .from("cases")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw data(error.message, { status: 500 });
  if (!row) throw data("Case not found", { status: 404 });
  return { kase: row };
}

const COURTS: Array<keyof typeof COURT_LABELS> = [
  "supreme",
  "patent_court",
  "high_court",
  "district_court",
];

export default function AdminCaseEdit({ loaderData }: Route.ComponentProps) {
  const { kase } = loaderData;
  const isNew = kase === null;

  const subjectLawsValue = (kase?.subject_laws ?? []).join(",");

  return (
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <Link
        to="/admin/cases?law=patent"
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        <ArrowLeftIcon className="size-3" /> 판례 매핑 관리
      </Link>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GavelIcon className="text-primary size-6" />
          {isNew ? "판례 신규 등록" : `판례 수정 — ${kase.case_number}`}
        </h1>
        {!isNew ? (
          <Link
            to={`/admin/relations/article/patent/29`}
            className="text-muted-foreground hover:text-foreground text-xs"
          >
            <NetworkIcon className="inline size-3" /> 관련 조문은 별도 페이지에서
          </Link>
        ) : null}
      </header>

      <Form method="post" action="/api/admin/case" className="space-y-4">
        <input type="hidden" name="intent" value={isNew ? "create" : "update"} />
        {!isNew ? (
          <input type="hidden" name="caseId" value={kase.case_id} />
        ) : null}

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">기본 정보</h2>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="과목 (콤마 구분)" required full>
              <Input
                name="subjectLaws"
                defaultValue={subjectLawsValue}
                placeholder="patent, trademark"
              />
              <p className="text-muted-foreground mt-1 text-[10px]">
                가능: {LAW_SUBJECT_SLUGS.join(", ")} —{" "}
                {LAW_SUBJECT_SLUGS.map((s) => `${LAW_SUBJECTS[s].name}=${s}`).join(
                  " · ",
                )}
              </p>
            </Field>
            <Field label="법원" required>
              <select
                name="court"
                defaultValue={kase?.court ?? "supreme"}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {COURTS.map((c) => (
                  <option key={c} value={c}>
                    {COURT_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="선고일" required>
              <Input
                type="date"
                name="decidedAt"
                defaultValue={kase?.decided_at ?? ""}
                required
              />
            </Field>
            <Field label="사건번호" required>
              <Input
                name="caseNumber"
                defaultValue={kase?.case_number ?? ""}
                required
                maxLength={100}
              />
            </Field>
            <Field label="사건명" required full>
              <Input
                name="caseTitle"
                defaultValue={kase?.case_title ?? ""}
                required
                maxLength={500}
              />
            </Field>
            <Field label="사건유형">
              <Input
                name="caseType"
                defaultValue={kase?.case_type ?? ""}
                placeholder="예: 거절결정 (특)"
                maxLength={100}
              />
            </Field>
            <Field label="중요도 (0~5)">
              <Input
                type="number"
                name="importance"
                defaultValue={kase?.importance ?? ""}
                min={0}
                max={5}
              />
            </Field>
            <Field label="전합">
              <label className="border-input flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm">
                <input
                  type="checkbox"
                  name="isEnBanc"
                  value="1"
                  defaultChecked={kase?.is_en_banc ?? false}
                />
                전원합의체
              </label>
            </Field>
            <Field label="1차 기출 연도 (콤마)">
              <Input
                name="exam1stYears"
                defaultValue={(kase?.exam_1st_years ?? []).join(",")}
                placeholder="예: 2018, 2020"
              />
            </Field>
            <Field label="2차 기출 연도 (콤마)">
              <Input
                name="exam2ndYears"
                defaultValue={(kase?.exam_2nd_years ?? []).join(",")}
                placeholder="예: 2019"
              />
            </Field>
          </CardContent>
        </Card>

        {!isNew ? <FullTextPdfCard kase={kase} /> : <FullTextPdfNotice />}

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">요지 · 이유</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="요지 제목" full>
              <Input
                name="summaryTitle"
                defaultValue={kase?.summary_title ?? ""}
                maxLength={500}
              />
            </Field>
            <Field label="요지 본문 (Markdown)" full>
              <Textarea
                name="summaryBodyMd"
                defaultValue={kase?.summary_body_md ?? ""}
                rows={5}
              />
            </Field>
            <Field label="판시이유 (Markdown)" full>
              <Textarea
                name="reasoningMd"
                defaultValue={kase?.reasoning_md ?? ""}
                rows={8}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold">비고 · 평석</h2>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="비고/평석 출처" full>
              <Input
                name="commentSource"
                defaultValue={kase?.comment_source ?? ""}
                maxLength={500}
              />
            </Field>
            <Field label="비고/평석 본문 (Markdown)" full>
              <Textarea
                name="commentBodyMd"
                defaultValue={kase?.comment_body_md ?? ""}
                rows={6}
              />
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {!isNew ? (
            <DeleteForm caseId={kase.case_id} caseNumber={kase.case_number} />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              <SaveIcon className="size-3.5" />{" "}
              {isNew ? "등록" : "변경 저장"}
            </Button>
          </div>
        </div>
      </Form>
      {!isNew ? (
        <p className="text-muted-foreground mt-4 text-xs">
          관련 조문 매핑은{" "}
          <Link
            to="/admin/cases?law=patent"
            className="text-primary hover:underline"
          >
            판례 매핑 관리
          </Link>{" "}
          또는{" "}
          <Link
            to="/admin/relations/gaps?law=patent"
            className="text-primary hover:underline"
          >
            연관관계 편집
          </Link>{" "}
          페이지에서 진행하세요.
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  required,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <Label className="text-muted-foreground mb-1 block text-[11px]">
        {label}
        {required ? <Badge variant="outline" className="ml-1 text-[9px]">필수</Badge> : null}
      </Label>
      {children}
    </div>
  );
}

function DeleteForm({
  caseId,
  caseNumber,
}: {
  caseId: string;
  caseNumber: string;
}) {
  return (
    <Form
      method="post"
      action="/api/admin/case"
      onSubmit={(e) => {
        if (!confirm(`판례 ${caseNumber} 을(를) 삭제하시겠습니까?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="caseId" value={caseId} />
      <Button type="submit" size="sm" variant="ghost" className="text-rose-600">
        <Trash2Icon className="size-3.5" /> 삭제
      </Button>
    </Form>
  );
}

// 신규 모드 안내 — PDF 업로드는 case_id 가 있어야 storage path 를 잡을 수 있어 저장 후로 미룬다.
function FullTextPdfNotice() {
  return (
    <Card>
      <CardHeader>
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <FileTextIcon className="text-muted-foreground size-4" /> 판결전문 PDF
        </h2>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">
          기본 정보를 먼저 저장하면 이 화면에서 PDF 파일을 업로드할 수 있습니다 (최대 30MB).
        </p>
      </CardContent>
    </Card>
  );
}

// 수정 모드 — 현재 PDF 표시 + 파일 업로드/제거 (multipart fetcher).
function FullTextPdfCard({
  kase,
}: {
  kase: { case_id: string; full_text_pdf: string | null };
}) {
  const uploadFetcher = useFetcher<{ ok?: boolean; url?: string; error?: string }>();
  const removeFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentUrl = kase.full_text_pdf;
  const isUploading = uploadFetcher.state !== "idle";
  const isRemoving = removeFetcher.state !== "idle";

  useEffect(() => {
    const r = uploadFetcher.data;
    if (!r) return;
    if (r.ok) {
      toast.success("판결전문 PDF 업로드 완료");
      if (fileInputRef.current) fileInputRef.current.value = "";
      revalidator.revalidate();
    } else if (r.error) {
      toast.error(r.error);
    }
  }, [uploadFetcher.data, revalidator]);
  useEffect(() => {
    const r = removeFetcher.data;
    if (!r) return;
    if (r.ok) {
      toast.success("판결전문 PDF 제거 완료");
      revalidator.revalidate();
    } else if (r.error) {
      toast.error(r.error);
    }
  }, [removeFetcher.data, revalidator]);

  return (
    <Card>
      <CardHeader>
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <FileTextIcon className="text-muted-foreground size-4" /> 판결전문 PDF
        </h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {currentUrl ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-emerald-50/40 px-3 py-2 text-xs dark:bg-emerald-950/20">
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
            >
              <ExternalLinkIcon className="size-3.5" /> 현재 PDF 열기
            </a>
            <removeFetcher.Form
              method="post"
              action="/api/admin/case"
              encType="multipart/form-data"
              onSubmit={(e) => {
                if (!confirm("판결전문 PDF 를 제거하시겠습니까?")) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="remove_full_text_pdf" />
              <input type="hidden" name="caseId" value={kase.case_id} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-rose-600"
                disabled={isRemoving}
              >
                <Trash2Icon className="size-3.5" />{" "}
                {isRemoving ? "제거 중…" : "제거"}
              </Button>
            </removeFetcher.Form>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
            아직 업로드된 PDF 가 없습니다.
          </p>
        )}
        <uploadFetcher.Form
          method="post"
          action="/api/admin/case"
          encType="multipart/form-data"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="intent" value="upload_full_text_pdf" />
          <input type="hidden" name="caseId" value={kase.case_id} />
          <Field label={currentUrl ? "교체 PDF 파일" : "PDF 파일"} required>
            <Input
              ref={fileInputRef}
              type="file"
              name="file"
              accept="application/pdf"
              required
              className="text-xs"
            />
          </Field>
          <Button
            type="submit"
            size="sm"
            disabled={isUploading}
            className="gap-1"
          >
            <UploadIcon className="size-3.5" />
            {isUploading ? "업로드 중…" : currentUrl ? "교체" : "업로드"}
          </Button>
        </uploadFetcher.Form>
        <p className="text-muted-foreground text-[10px]">
          최대 30MB · application/pdf 만 허용.
        </p>
      </CardContent>
    </Card>
  );
}
