// 판례 등록/수정 폼 (feat-7-005). staff(instructor/admin) 전용.
// /admin/cases/edit (new) | /admin/cases/edit/:caseId (update).
// 리스킨: AdminShell(cluster=cases, P3, width=960), Field + AdminSelect, 통일 폼 레이아웃.

import {
  ExternalLinkIcon,
  FileTextIcon,
  NetworkIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, data, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";

import { reflowNumbering } from "~/features/cases/lib/reflow-numbering";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { COURT_LABELS } from "~/features/cases/labels";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Field } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/admin-case-edit";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d?.kase)
    return [{ title: "판례 등록 | Lidam Patent Attorney Academy" }];
  return [
    { title: `${d.kase.case_number} 편집 | Lidam Patent Attorney Academy` },
  ];
};

// returnTo 는 /admin/cases 목록 경로만 허용 — open-redirect 방지.
function safeReturnTo(raw: unknown): string {
  return typeof raw === "string" && /^\/admin\/cases(\?|$)/.test(raw)
    ? raw
    : "/admin/cases?law=patent";
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });

  const returnTo = safeReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );
  const caseId = params.caseId ?? null;
  if (!caseId) return { kase: null, returnTo, role };
  const { data: row, error } = await client
    .from("cases")
    .select("*")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw data(error.message, { status: 500 });
  if (!row) throw data("Case not found", { status: 404 });
  return { kase: row, returnTo, role };
}

const COURTS: Array<keyof typeof COURT_LABELS> = [
  "supreme",
  "patent_court",
  "high_court",
  "district_court",
];

/* ── 페이지 ──────────────────────────────────────────────────────────── */

export default function AdminCaseEdit({ loaderData }: Route.ComponentProps) {
  const { kase, returnTo, role } = loaderData;
  const isNew = kase === null;
  const subjectLawsValue = (kase?.subject_laws ?? []).join(",");

  return (
    <AdminShell
      cluster="cases"
      role={role}
      width={960}
      title={isNew ? "판례 신규 등록" : `판례 수정 — ${kase.case_number}`}
      desc={
        isNew
          ? "사건번호·요지·이유·평석 등 판례 정보를 입력합니다."
          : "식별 필드(사건번호·법원·선고일)를 포함한 판례 정보를 수정합니다."
      }
      headerRight={
        !isNew ? (
          <Link
            to="/admin/relations/article/patent/29"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <NetworkIcon className="size-3.5" /> 관련 조문은 별도 페이지에서
          </Link>
        ) : undefined
      }
    >
      <Link
        to={returnTo}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-xs"
      >
        ← 판례 매핑 관리
      </Link>

      <Form method="post" action="/api/admin/case" className="space-y-4">
        <input
          type="hidden"
          name="intent"
          value={isNew ? "create" : "update"}
        />
        {!isNew ? (
          <input type="hidden" name="caseId" value={kase.case_id} />
        ) : null}
        <input type="hidden" name="returnTo" value={returnTo} />

        {/* 기본 정보 */}
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              기본 정보
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {/* 과목 — 전체 너비 */}
            <Field
              label="과목 (콤마 구분)"
              required
              htmlFor="subjectLaws"
              className="sm:col-span-2"
            >
              <Input
                id="subjectLaws"
                name="subjectLaws"
                defaultValue={subjectLawsValue}
                placeholder="patent, trademark"
              />
              <p className="text-muted-foreground mt-1 text-[10px]">
                가능:{" "}
                {LAW_SUBJECT_SLUGS.map(
                  (s) => `${LAW_SUBJECTS[s].name}=${s}`,
                ).join(" · ")}
              </p>
            </Field>

            <Field label="법원" required htmlFor="court">
              <AdminSelect
                id="court"
                name="court"
                defaultValue={kase?.court ?? "supreme"}
                className="w-full"
              >
                {COURTS.map((c) => (
                  <option key={c} value={c}>
                    {COURT_LABELS[c]}
                  </option>
                ))}
              </AdminSelect>
            </Field>

            <Field label="선고일" required htmlFor="decidedAt">
              <Input
                id="decidedAt"
                type="date"
                name="decidedAt"
                defaultValue={kase?.decided_at ?? ""}
                required
              />
            </Field>

            <Field label="사건번호" required htmlFor="caseNumber">
              <Input
                id="caseNumber"
                name="caseNumber"
                defaultValue={kase?.case_number ?? ""}
                required
                maxLength={100}
              />
            </Field>

            <Field label="사건명" required htmlFor="caseTitle" className="sm:col-span-2">
              <Input
                id="caseTitle"
                name="caseTitle"
                defaultValue={kase?.case_title ?? ""}
                required
                maxLength={500}
              />
            </Field>

            <Field label="닉네임 (선택)" htmlFor="nickname">
              <Input
                id="nickname"
                name="nickname"
                defaultValue={kase?.nickname ?? ""}
                placeholder="예: 수지상 세포 사건"
                maxLength={100}
              />
            </Field>

            <Field label="사건유형" htmlFor="caseType">
              <Input
                id="caseType"
                name="caseType"
                defaultValue={kase?.case_type ?? ""}
                placeholder="예: 거절결정 (특)"
                maxLength={100}
              />
            </Field>

            <Field label="전합" htmlFor="isEnBanc">
              <label className="border-input inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm">
                <input
                  id="isEnBanc"
                  type="checkbox"
                  name="isEnBanc"
                  value="1"
                  defaultChecked={kase?.is_en_banc ?? false}
                  className="accent-primary"
                />
                전원합의체
              </label>
            </Field>

            <Field label="1차 기출 연도 (콤마)" htmlFor="exam1stYears">
              <Input
                id="exam1stYears"
                name="exam1stYears"
                defaultValue={(kase?.exam_1st_years ?? []).join(",")}
                placeholder="예: 2018, 2020"
              />
            </Field>

            <Field label="2차 기출 연도 (콤마)" htmlFor="exam2ndYears">
              <Input
                id="exam2ndYears"
                name="exam2ndYears"
                defaultValue={(kase?.exam_2nd_years ?? []).join(",")}
                placeholder="예: 2019"
              />
            </Field>
          </CardContent>
        </Card>

        {/* PDF */}
        {!isNew ? <FullTextPdfCard kase={kase} /> : <FullTextPdfNotice />}

        {/* 요지 · 이유 */}
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              요지 · 이유
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="판결요지 (여러 항목 가능)">
              <SummaryItemsEditor
                defaultItems={parseSummaryItems(kase?.summary_items)}
              />
            </Field>
            <Field label="판시이유 (Markdown)" htmlFor="reasoningMd">
              <ReflowableTextarea
                name="reasoningMd"
                defaultValue={kase?.reasoning_md ?? ""}
                rows={8}
                fieldLabel="판시이유"
              />
            </Field>
          </CardContent>
        </Card>

        {/* 비고 · 평석 */}
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              비고 · 평석
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="비고/평석 출처" htmlFor="commentSource">
              <Input
                id="commentSource"
                name="commentSource"
                defaultValue={kase?.comment_source ?? ""}
                maxLength={500}
              />
            </Field>
            <Field label="비고/평석 본문 (Markdown)" htmlFor="commentBodyMd">
              <ReflowableTextarea
                name="commentBodyMd"
                defaultValue={kase?.comment_body_md ?? ""}
                rows={6}
                fieldLabel="비고/평석 본문"
              />
            </Field>
          </CardContent>
        </Card>

        {/* 저장/삭제 바닥 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {!isNew ? (
            <DeleteForm
              caseId={kase.case_id}
              caseNumber={kase.case_number}
              returnTo={returnTo}
            />
          ) : (
            <span />
          )}
          <Button type="submit" size="sm">
            <SaveIcon className="size-3.5" /> {isNew ? "등록" : "변경 저장"}
          </Button>
        </div>
      </Form>

      {!isNew ? (
        <p className="text-muted-foreground mt-4 text-xs">
          관련 조문 매핑은{" "}
          <Link to={returnTo} className="text-primary hover:underline">
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
    </AdminShell>
  );
}

/* ── ReflowableTextarea ─────────────────────────────────────────────── */

function ReflowableTextarea({
  name,
  defaultValue,
  value,
  onChange,
  rows,
  fieldLabel,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (next: string) => void;
  rows: number;
  fieldLabel: string;
}) {
  const isControlled = value !== undefined;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const onReflow = () => {
    const before = isControlled ? (value ?? "") : (ref.current?.value ?? "");
    if (!before.trim()) {
      toast.info(`${fieldLabel} 본문이 비어 있습니다.`);
      return;
    }
    const after = reflowNumbering(before);
    if (after === before) {
      toast.info("이미 단락이 분리되어 있어 변경할 부분이 없습니다.");
      return;
    }
    if (
      !confirm(
        `${fieldLabel} 본문에 ${after.split("\n\n").length}개 단락 구분을 적용합니다.\n\n("2019. 12. 24." 같은 날짜·사건번호 안의 구두점도 함께 분리될 수 있으므로, 적용 후 결과를 확인하고 잘못된 곳은 직접 수정하세요.)\n\n적용할까요?`,
      )
    ) {
      return;
    }
    if (isControlled) {
      onChange?.(after);
    } else if (ref.current) {
      ref.current.value = after;
      ref.current.focus();
    }
    toast.success(
      `${fieldLabel} 넘버링 자동 정렬 적용 — 결과를 확인하고 저장하세요.`,
    );
  };
  return (
    <>
      <div className="mb-1 flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={onReflow}
          title="줄바꿈 없이 붙은 1./가./1)/(1) 등 항목 앞에 단락 구분을 자동 삽입 — 결과 확인 후 잘못된 곳은 수동 수정"
        >
          넘버링 자동 정렬
        </Button>
      </div>
      {isControlled ? (
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          rows={rows}
        />
      ) : (
        <Textarea ref={ref} name={name} defaultValue={defaultValue} rows={rows} />
      )}
    </>
  );
}

/* ── SummaryItemsEditor ──────────────────────────────────────────────── */

type SummaryItem = { title: string; body: string };

function parseSummaryItems(raw: unknown): SummaryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SummaryItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    out.push({
      title: typeof o.title === "string" ? o.title : "",
      body: typeof o.body === "string" ? o.body : "",
    });
  }
  return out;
}

function SummaryItemsEditor({
  defaultItems,
}: {
  defaultItems: SummaryItem[];
}) {
  const [items, setItems] = useState<SummaryItem[]>(
    defaultItems.length > 0 ? defaultItems : [{ title: "", body: "" }],
  );
  const patch = (i: number, p: Partial<SummaryItem>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...p } : it)));

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="summaryItems"
        value={JSON.stringify(items)}
      />
      {items.map((it, i) => (
        <div
          key={i}
          className="border-input bg-muted/20 space-y-2 rounded-md border p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">요지 [{i + 1}]</span>
            {items.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-2 text-[11px] text-rose-600 hover:text-rose-700"
                onClick={() =>
                  setItems((prev) => prev.filter((_, j) => j !== i))
                }
              >
                <Trash2Icon className="size-3" /> 항목 삭제
              </Button>
            ) : null}
          </div>
          <Input
            value={it.title}
            onChange={(e) => patch(i, { title: e.target.value })}
            placeholder="요지 제목"
            maxLength={500}
          />
          <ReflowableTextarea
            value={it.body}
            onChange={(next) => patch(i, { body: next })}
            rows={5}
            fieldLabel={`요지 [${i + 1}] 본문`}
          />
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          setItems((prev) => [...prev, { title: "", body: "" }])
        }
      >
        <PlusIcon className="size-3.5" /> 요지 항목 추가
      </Button>
    </div>
  );
}

/* ── DeleteForm ─────────────────────────────────────────────────────── */

function DeleteForm({
  caseId,
  caseNumber,
  returnTo,
}: {
  caseId: string;
  caseNumber: string;
  returnTo: string;
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
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
      >
        <Trash2Icon className="size-3.5" /> 삭제
      </Button>
    </Form>
  );
}

/* ── FullTextPdf* ───────────────────────────────────────────────────── */

function FullTextPdfNotice() {
  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <FileTextIcon className="size-3.5" /> 판결전문 PDF
        </p>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-xs">
          기본 정보를 먼저 저장하면 이 화면에서 PDF 파일을 업로드할 수 있습니다
          (최대 30MB).
        </p>
      </CardContent>
    </Card>
  );
}

function FullTextPdfCard({
  kase,
}: {
  kase: { case_id: string; full_text_pdf: string | null };
}) {
  const uploadFetcher = useFetcher<{
    ok?: boolean;
    url?: string;
    error?: string;
  }>();
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
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <FileTextIcon className="size-3.5" /> 판결전문 PDF
        </p>
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
              <input
                type="hidden"
                name="intent"
                value="remove_full_text_pdf"
              />
              <input type="hidden" name="caseId" value={kase.case_id} />
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
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
          <Button type="submit" size="sm" disabled={isUploading}>
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
