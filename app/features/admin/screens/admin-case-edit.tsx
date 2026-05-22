// 판례 등록/수정 폼 (feat-7-005). staff(instructor/admin) 전용.
// /admin/cases/edit (new) | /admin/cases/edit/:caseId (update).
// 리스킨: AdminShell(cluster=cases, P3, width=960), Field + AdminSelect, 통일 폼 레이아웃.

import {
  ClipboardCopyIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  NetworkIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Form, Link, data, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";

import { reflowNumbering } from "~/features/cases/lib/reflow-numbering";
import { MARKDOWN_TABLE_TEMPLATE } from "~/features/cases/lib/case-markdown";
import { Prose } from "~/features/cases/components/case-body";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import {
  CASE_IMAGE_POSITIONS,
  CASE_IMAGE_POSITION_LABELS,
  COURT_LABELS,
  parseCaseImages,
  type CaseImage,
  type CaseImagePosition,
} from "~/features/cases/labels";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { AdminSelect, Field } from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { getRelatedArticlesByCase } from "~/features/relations/queries.server";
import type { RelatedArticle } from "~/features/relations/labels";
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

// returnTo 화이트리스트 — open-redirect 방지. 우리 도메인 안의 안전 경로만 허용.
//   1) /admin/cases  — admin 목록·필터 보존
//   2) /subjects/<slug>/cases/<uuid> — 학생/공개 판례 본문 (case-body 의 "수정" 진입점)
// 그 외(외부 URL, `//evil.com`, `/admin/users` 등)는 모두 기본값으로 대체.
function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//"))
    return "/admin/cases?law=patent";
  if (/^\/admin\/cases(\/|\?|$)/.test(raw)) return raw;
  if (/^\/subjects\/[a-z_]+\/cases\/[a-f0-9-]+(\?|#|$)/i.test(raw)) return raw;
  return "/admin/cases?law=patent";
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
  if (!caseId)
    return {
      kase: null,
      returnTo,
      role,
      relatedArticles: [] as RelatedArticle[],
    };
  const [{ data: row, error }, relatedArticles] = await Promise.all([
    client.from("cases").select("*").eq("case_id", caseId).maybeSingle(),
    getRelatedArticlesByCase(client, caseId),
  ]);
  if (error) throw data(error.message, { status: 500 });
  if (!row) throw data("Case not found", { status: 404 });
  return { kase: row, returnTo, role, relatedArticles };
}

const COURTS: Array<keyof typeof COURT_LABELS> = [
  "supreme",
  "patent_court",
  "high_court",
  "district_court",
];

/* ── 페이지 ──────────────────────────────────────────────────────────── */

export default function AdminCaseEdit({ loaderData }: Route.ComponentProps) {
  const { kase, returnTo, role, relatedArticles } = loaderData;
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
            to="/admin/relations/gaps?law=patent"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            <NetworkIcon className="size-3.5" /> 연관관계 부족분 일괄 편집
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

        {/* 관련자료 — 그림·표 등 본문 보조 자료. 그림/표 자체는 폼 외부 ImagesCard
            의 position=관련자료 로 업로드, 본문 설명은 여기서 작성. */}
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              관련자료
            </p>
            <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
              그림·표·도면 등 본문 보조 자료에 대한 설명을 입력합니다. 그림/표
              자체는 아래 "본문 이미지" 카드에서 표시 영역을 "관련자료" 로
              지정해 업로드하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="관련자료 본문 (Markdown)" htmlFor="relatedMd">
              <ReflowableTextarea
                name="relatedMd"
                defaultValue={kase?.related_md ?? ""}
                rows={6}
                fieldLabel="관련자료 본문"
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
        <>
          <ImagesCard
            caseId={kase.case_id}
            initialImages={parseCaseImages(kase.images)}
          />
          <RelatedArticlesEditor
            caseId={kase.case_id}
            subjectLaws={(kase.subject_laws ?? []) as LawSubjectSlug[]}
            relatedArticles={relatedArticles}
          />
        </>
      ) : null}
    </AdminShell>
  );
}

/* ── RelatedArticlesEditor ──────────────────────────────────────────── */
// feat-7-005 후속: 개별 판례 수정 페이지에서 관련 조문 직접 편집.
// /api/admin/case-link (intent=add/remove) 호출. fetcher 로 revalidate 자동.
function RelatedArticlesEditor({
  caseId,
  subjectLaws,
  relatedArticles,
}: {
  caseId: string;
  subjectLaws: LawSubjectSlug[];
  relatedArticles: RelatedArticle[];
}) {
  const addFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const removeFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedLaw, setSelectedLaw] = useState<LawSubjectSlug>(
    (subjectLaws[0] ?? "patent") as LawSubjectSlug,
  );

  const isAdding = addFetcher.state !== "idle";
  const removingKey =
    removeFetcher.state !== "idle"
      ? `${removeFetcher.formData?.get("lawCode")}:${removeFetcher.formData?.get("articleNumber")}`
      : null;

  // 추가/삭제 성공 후 loader revalidate + toast.
  useEffect(() => {
    if (addFetcher.state !== "idle" || !addFetcher.data) return;
    if (addFetcher.data.ok) {
      toast.success("관련 조문이 추가되었습니다.");
      if (inputRef.current) inputRef.current.value = "";
      revalidator.revalidate();
    } else if (addFetcher.data.error) {
      toast.error(addFetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addFetcher.state, addFetcher.data]);

  useEffect(() => {
    if (removeFetcher.state !== "idle" || !removeFetcher.data) return;
    if (removeFetcher.data.ok) {
      toast.success("관련 조문이 제거되었습니다.");
      revalidator.revalidate();
    } else if (removeFetcher.data.error) {
      toast.error(removeFetcher.data.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removeFetcher.state, removeFetcher.data]);

  // articleNumber 가 비어 있을 때 추가 버튼 disable — onSubmit 가드.
  function onAddSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const v = String(fd.get("articleNumber") ?? "").trim();
    if (!v) {
      e.preventDefault();
      toast.error("조문 번호를 입력하세요. 예: 29 또는 제29조의2");
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          관련 조문
        </p>
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          이 판례를 인용·해석한 조문을 매핑합니다. 학생 화면 우측 패널의 "관련
          조문" 칩과 학습과목 case 뷰어의 조문 chips 에 반영됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {relatedArticles.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {relatedArticles.map((a) => {
              const num = a.articleNumber;
              const lawCode = selectedLaw; // remove 는 case 의 subject_laws 중 어느 쪽인지 알 수 없으니
              // — 현재 선택된 law 또는 첫 subject_laws 사용. case_link API 가 (caseId+articleNumber) 만 사용해 정확 매칭됨.
              const key = `${lawCode}:${num ?? ""}`;
              const removing = removingKey === key;
              return (
                <li key={a.articleId}>
                  <span
                    className={cn(
                      "border-border bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      removing && "opacity-50",
                    )}
                  >
                    <span className="font-medium">{a.displayLabel}</span>
                    {num ? (
                      <removeFetcher.Form
                        method="post"
                        action="/api/admin/case-link"
                        className="inline-flex"
                      >
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="caseId" value={caseId} />
                        <input
                          type="hidden"
                          name="lawCode"
                          value={lawCode}
                        />
                        <input
                          type="hidden"
                          name="articleNumber"
                          value={num}
                        />
                        <button
                          type="submit"
                          aria-label={`${a.displayLabel} 매핑 제거`}
                          title="제거"
                          disabled={removing}
                          className="hover:text-rose-600 disabled:opacity-50"
                        >
                          <Trash2Icon className="size-3" />
                        </button>
                      </removeFetcher.Form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
            아직 매핑된 관련 조문이 없습니다.
          </p>
        )}

        <addFetcher.Form
          method="post"
          action="/api/admin/case-link"
          onSubmit={onAddSubmit}
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="intent" value="add" />
          <input type="hidden" name="caseId" value={caseId} />
          {subjectLaws.length > 1 ? (
            <Field label="과목" htmlFor="newLawCode">
              <AdminSelect
                id="newLawCode"
                name="lawCode"
                value={selectedLaw}
                onChange={(e) =>
                  setSelectedLaw(e.currentTarget.value as LawSubjectSlug)
                }
                className="w-32"
              >
                {subjectLaws.map((s) => (
                  <option key={s} value={s}>
                    {LAW_SUBJECTS[s]?.name ?? s}
                  </option>
                ))}
              </AdminSelect>
            </Field>
          ) : (
            <input type="hidden" name="lawCode" value={selectedLaw} />
          )}
          <Field label="조문 번호" htmlFor="newArticleNumber">
            <Input
              id="newArticleNumber"
              ref={inputRef}
              name="articleNumber"
              placeholder="예: 29 또는 제29조의2"
              maxLength={20}
              className="w-48"
            />
          </Field>
          <Button type="submit" size="sm" disabled={isAdding}>
            <PlusIcon className="size-3.5" />
            {isAdding ? "추가 중…" : "조문 추가"}
          </Button>
        </addFetcher.Form>
        <p className="text-muted-foreground text-[10px] leading-relaxed">
          "제29조", "29조", "29" 모두 인식. 가지조문은 "29의2" 또는 "제29조의2".
          매핑은 즉시 반영됩니다.
        </p>
      </CardContent>
    </Card>
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
  // 라이브 preview 토글 + textarea 의 현재 값을 추적해 preview 렌더.
  // controlled mode 면 value, uncontrolled mode 면 onInput 시점 textarea.value 를 state.
  const [previewOn, setPreviewOn] = useState(false);
  const [uncontrolledMirror, setUncontrolledMirror] = useState(
    defaultValue ?? "",
  );
  const previewText = isControlled ? (value ?? "") : uncontrolledMirror;

  // cursor 위치(또는 selection 끝)에 텍스트를 삽입하고 cursor 를 삽입 직후로 이동.
  function insertAtCursor(snippet: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    // 앞뒤 paragraph 경계 보장 — 이미 \n\n 가 있으면 그대로, 아니면 추가.
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const needLead =
      before.length > 0 && !/\n\n$/.test(before) ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const needTail =
      after.length > 0 && !/^\n\n/.test(after) ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    const insertion = `${needLead}${snippet}${needTail}`;
    const nextValue = `${before}${insertion}${after}`;
    if (isControlled) {
      onChange?.(nextValue);
    } else {
      el.value = nextValue;
      setUncontrolledMirror(nextValue);
    }
    // 다음 frame 에 cursor 위치 보정 — React 가 controlled 모드에서 value 를 commit 한 후.
    const cursor = before.length + insertion.length;
    requestAnimationFrame(() => {
      el.focus();
      try {
        el.setSelectionRange(cursor, cursor);
      } catch {
        /* readonly 등 — ignore */
      }
    });
  }

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
        `${fieldLabel} 본문에 ${after.split("\n\n").length}개 단락 구분을 적용합니다.\n\n("2019. 12. 24." 같은 날짜와 "(1) (2)" 같은 연속 인덱스 안의 구두점은 자동으로 보호됩니다.)\n\n적용할까요?`,
      )
    ) {
      return;
    }
    if (isControlled) {
      onChange?.(after);
    } else if (ref.current) {
      ref.current.value = after;
      setUncontrolledMirror(after);
      ref.current.focus();
    }
    toast.success(
      `${fieldLabel} 넘버링 자동 정렬 적용 — 결과를 확인하고 저장하세요.`,
    );
  };
  return (
    <>
      <div className="mb-1 flex items-center justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={() => insertAtCursor(MARKDOWN_TABLE_TEMPLATE)}
          title="cursor 위치에 markdown 표 템플릿 삽입"
        >
          표 삽입
        </Button>
        <Button
          type="button"
          size="sm"
          variant={previewOn ? "default" : "outline"}
          className="h-6 px-2 text-[10px]"
          onClick={() => setPreviewOn((v) => !v)}
          title="라이브 미리보기 — 입력 결과(이미지·표 포함) 를 옆에서 실시간 확인"
        >
          {previewOn ? "미리보기 끄기" : "미리보기"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 px-2 text-[10px]"
          onClick={onReflow}
          title="줄바꿈 없이 붙은 1./가./1)/(1) 등 항목 앞에 단락 구분을 자동 삽입 — 날짜와 연속 인덱스는 자동 보호"
        >
          넘버링 자동 정렬
        </Button>
      </div>
      <div
        className={cn(
          "gap-3",
          previewOn ? "grid lg:grid-cols-2" : "",
        )}
      >
        {isControlled ? (
          <Textarea
            ref={ref}
            value={value ?? ""}
            onChange={(e) => onChange?.(e.target.value)}
            rows={rows}
          />
        ) : (
          <Textarea
            ref={ref}
            name={name}
            defaultValue={defaultValue}
            rows={rows}
            onInput={(e) =>
              setUncontrolledMirror((e.target as HTMLTextAreaElement).value)
            }
          />
        )}
        {previewOn ? (
          <div className="border-border bg-muted/20 max-h-[400px] overflow-y-auto rounded-md border p-3">
            {previewText.trim() ? (
              <Prose text={previewText} />
            ) : (
              <p className="text-muted-foreground text-xs italic">
                미리보기 — 본문을 입력하면 여기에 실시간 표시됩니다 (이미지 표
                포함).
              </p>
            )}
          </div>
        ) : null}
      </div>
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
  // controlled hidden input(`summaryItems`) 의 DOM value 를 commit 보다 먼저 동기화 —
  // React 18 batching 으로 setState 가 deferred 되면 typing 직후 "변경 저장" 클릭 시
  // FormData 가 stale 한 JSON 을 수집해 첫 submit 이 옛 값으로 저장되는 race 방지.
  const setItemsSync = (updater: (prev: SummaryItem[]) => SummaryItem[]) =>
    flushSync(() => setItems(updater));
  const patch = (i: number, p: Partial<SummaryItem>) =>
    setItemsSync((prev) =>
      prev.map((it, j) => (j === i ? { ...it, ...p } : it)),
    );

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
                  setItemsSync((prev) => prev.filter((_, j) => j !== i))
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
          setItemsSync((prev) => [...prev, { title: "", body: "" }])
        }
      >
        <PlusIcon className="size-3.5" /> 요지 항목 추가
      </Button>
    </div>
  );
}

/* ── DeleteForm ─────────────────────────────────────────────────────── */
// HTML5 form-in-form nesting 회피 — DOM <form> 태그 없이 fetcher.submit 으로 처리.
// 메인 <Form> 안에 <DeleteForm> 이 렌더되는데, 그 안에 또 <Form> 을 두면 invalid
// HTML 이라 첫 클릭이 inner form 으로 라우팅되거나 무시되는 브라우저 quirk 가 있다.

function DeleteForm({
  caseId,
  caseNumber,
  returnTo,
}: {
  caseId: string;
  caseNumber: string;
  returnTo: string;
}) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  function onDelete() {
    if (!confirm(`판례 ${caseNumber} 을(를) 삭제하시겠습니까?`)) return;
    const fd = new FormData();
    fd.set("intent", "delete");
    fd.set("caseId", caseId);
    fd.set("returnTo", returnTo);
    fetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
      onClick={onDelete}
      disabled={submitting}
    >
      <Trash2Icon className="size-3.5" /> {submitting ? "삭제 중…" : "삭제"}
    </Button>
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

// HTML5 form-in-form nesting 회피 — 메인 <Form> 안에 <FullTextPdfCard> 가 렌더되므로
// 안에는 <form> 태그를 두지 않고 button onClick + fetcher.submit 으로 처리한다.
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
  // ImagesCard 와 같은 이유로 처리된 응답을 ref 로 추적 — useRevalidator() 가
  // revalidate 중 새 reference 를 내보내 무한 toast 가 도는 것을 방지.
  const handledUploadRef = useRef<unknown>(null);
  const handledRemoveRef = useRef<unknown>(null);

  useEffect(() => {
    const r = uploadFetcher.data;
    if (!r || r === handledUploadRef.current) return;
    handledUploadRef.current = r;
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
    if (!r || r === handledRemoveRef.current) return;
    handledRemoveRef.current = r;
    if (r.ok) {
      toast.success("판결전문 PDF 제거 완료");
      revalidator.revalidate();
    } else if (r.error) {
      toast.error(r.error);
    }
  }, [removeFetcher.data, revalidator]);

  function onRemove() {
    if (!confirm("판결전문 PDF 를 제거하시겠습니까?")) return;
    const fd = new FormData();
    fd.set("intent", "remove_full_text_pdf");
    fd.set("caseId", kase.case_id);
    removeFetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  function onUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("PDF 파일을 선택하세요.");
      return;
    }
    const fd = new FormData();
    fd.set("intent", "upload_full_text_pdf");
    fd.set("caseId", kase.case_id);
    fd.set("file", file);
    uploadFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/case",
      encType: "multipart/form-data",
    });
  }

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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
              onClick={onRemove}
              disabled={isRemoving}
            >
              <Trash2Icon className="size-3.5" />{" "}
              {isRemoving ? "제거 중…" : "제거"}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
            아직 업로드된 PDF 가 없습니다.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Field label={currentUrl ? "교체 PDF 파일" : "PDF 파일"} required>
            <Input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="text-xs"
            />
          </Field>
          <Button
            type="button"
            size="sm"
            onClick={onUpload}
            disabled={isUploading}
          >
            <UploadIcon className="size-3.5" />
            {isUploading ? "업로드 중…" : currentUrl ? "교체" : "업로드"}
          </Button>
        </div>
        <p className="text-muted-foreground text-[10px]">
          최대 30MB · application/pdf 만 허용.
        </p>
      </CardContent>
    </Card>
  );
}

/* ── ImagesCard ─────────────────────────────────────────────────────── */
// 판례 본문 이미지 — 다건 업로드/삭제/메타 수정. 폼 밖이라 메인 Form 과 독립.
// 각 fetcher 가 자체 상태를 가지고, 액션 후 revalidator 로 loader 재실행.
function ImagesCard({
  caseId,
  initialImages,
}: {
  caseId: string;
  initialImages: CaseImage[];
}) {
  const uploadFetcher = useFetcher<{
    ok?: boolean;
    image?: CaseImage;
    error?: string;
  }>();
  const removeFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const metaFetcher = useFetcher<{
    ok?: boolean;
    image?: CaseImage;
    error?: string;
  }>();
  const revalidator = useRevalidator();
  const fileRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const [position, setPosition] = useState<CaseImagePosition>("summary");
  // 클립보드 paste(Ctrl+V) 또는 드래그&드롭으로 들어온 파일 — 업로드 직전 preview.
  // file input 의 .files 와는 별도로 관리(브라우저가 input.files 를 보안상 직접
  // 쓰기 불가능한 경로가 있어 state 로 통합 처리).
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const isUploading = uploadFetcher.state !== "idle";
  const removingId =
    removeFetcher.state !== "idle"
      ? String(removeFetcher.formData?.get("imageId") ?? "")
      : null;

  // 처리된 응답을 ref 로 추적 — useRevalidator() 반환 객체가 매 render 새로 생겨
  // useEffect deps 에 두면 무한 fire(메타 변경 → revalidate → 부모 re-render →
  // 또 fire → toast → revalidate ...)되는 문제 회피.
  // 같은 fetcher.data reference 는 한 번만 처리.
  const handledUploadRef = useRef<unknown>(null);
  const handledRemoveRef = useRef<unknown>(null);
  const handledMetaRef = useRef<unknown>(null);

  useEffect(() => {
    if (uploadFetcher.state !== "idle") return;
    const r = uploadFetcher.data;
    if (!r || r === handledUploadRef.current) return;
    handledUploadRef.current = r;
    if (r.ok) {
      toast.success("이미지 업로드 완료");
      if (fileRef.current) fileRef.current.value = "";
      if (altRef.current) altRef.current.value = "";
      setPendingFile(null);
      revalidator.revalidate();
    } else if (r.error) toast.error(r.error);
  }, [uploadFetcher.state, uploadFetcher.data, revalidator]);

  useEffect(() => {
    if (removeFetcher.state !== "idle") return;
    const r = removeFetcher.data;
    if (!r || r === handledRemoveRef.current) return;
    handledRemoveRef.current = r;
    if (r.ok) {
      toast.success("이미지 제거 완료");
      revalidator.revalidate();
    } else if (r.error) toast.error(r.error);
  }, [removeFetcher.state, removeFetcher.data, revalidator]);

  useEffect(() => {
    if (metaFetcher.state !== "idle") return;
    const r = metaFetcher.data;
    if (!r || r === handledMetaRef.current) return;
    handledMetaRef.current = r;
    if (r.ok) {
      toast.success("이미지 정보 변경 완료");
      revalidator.revalidate();
    } else if (r.error) toast.error(r.error);
  }, [metaFetcher.state, metaFetcher.data, revalidator]);

  // pendingFile 변경 시 preview blob URL 갱신 + 이전 URL revoke.
  useEffect(() => {
    if (!pendingFile) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  function acceptFile(file: File): boolean {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 가능합니다.");
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("파일이 10MB 를 초과합니다.");
      return false;
    }
    setPendingFile(file);
    // file input 도 동기화 — 사용자가 보던 input 의 파일명도 같이 갱신.
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileRef.current) fileRef.current.files = dt.files;
    } catch {
      // 일부 브라우저에서 DataTransfer 지원 미흡 — state 만으로도 업로드 가능.
    }
    return true;
  }

  // 클립보드 paste — 이미지 데이터가 있으면 pendingFile 로 set.
  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file && acceptFile(file)) {
          e.preventDefault();
          toast.success("클립보드 이미지가 준비됐습니다 — 업로드를 누르세요.");
          return;
        }
      }
    }
  }

  // 드래그&드롭.
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }
  function onDragLeave() {
    setIsDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && acceptFile(file)) {
      toast.success("이미지가 준비됐습니다 — 업로드를 누르세요.");
    }
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (file) acceptFile(file);
    else setPendingFile(null);
  }

  function onUpload() {
    const file = pendingFile ?? fileRef.current?.files?.[0];
    if (!file) {
      toast.error("이미지 파일을 선택·붙여넣기·드래그해서 추가하세요.");
      return;
    }
    const fd = new FormData();
    fd.set("intent", "upload_image");
    fd.set("caseId", caseId);
    fd.set("position", position);
    fd.set("alt", altRef.current?.value ?? "");
    fd.set("file", file);
    uploadFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/case",
      encType: "multipart/form-data",
    });
  }

  function onRemove(imageId: string, alt: string) {
    const label = alt || "이미지";
    if (!confirm(`"${label}" 을(를) 제거하시겠습니까?`)) return;
    const fd = new FormData();
    fd.set("intent", "remove_image");
    fd.set("caseId", caseId);
    fd.set("imageId", imageId);
    removeFetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  function onChangePosition(imageId: string, next: CaseImagePosition) {
    const fd = new FormData();
    fd.set("intent", "update_image_meta");
    fd.set("caseId", caseId);
    fd.set("imageId", imageId);
    fd.set("position", next);
    metaFetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  // 본문 textarea 의 cursor 위치에 paste 해 인라인 배치할 수 있도록 markdown 을
  // 클립보드 복사. staff 가 화면 보면서 위치 결정.
  async function copyImageMarkdown(img: CaseImage) {
    const md = `![${img.alt || ""}](${img.url})`;
    try {
      await navigator.clipboard.writeText(md);
      toast.success("이미지 markdown 을 복사했습니다 — 본문에서 Ctrl+V 로 붙여넣으세요.");
    } catch {
      toast.error("클립보드 복사가 차단됐습니다. URL 을 수동 복사하세요.");
    }
  }

  // position 별 그룹화 (정렬은 parseCaseImages 에서 처리됨).
  const grouped = new Map<CaseImagePosition, CaseImage[]>();
  for (const p of CASE_IMAGE_POSITIONS) grouped.set(p, []);
  for (const img of initialImages) grouped.get(img.position)!.push(img);

  return (
    <Card className="mt-4">
      <CardHeader>
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <ImageIcon className="size-3.5" /> 본문 이미지
        </p>
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          상표법·특허법 판례에 포함된 그림(상표 도형, 청구항 도면 등)을
          업로드합니다. 표시 영역(판결요지/판시이유/비고/미분류) 별로 그룹핑되어
          학생 본문에 렌더됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 클립보드 paste / 드래그&드롭 zone — 이미지 파일 인입 통합 영역.
            클릭 시 focus → Ctrl+V 로 클립보드 이미지 직접 붙여넣기. 또는 파일을
            영역으로 드래그&드롭. file input 선택 결과도 같은 pendingFile 로 통합. */}
        <div
          tabIndex={0}
          role="button"
          aria-label="이미지 붙여넣기·드래그 영역"
          onPaste={onPaste}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={(e) => (e.currentTarget as HTMLDivElement).focus()}
          className={cn(
            "border-border bg-muted/30 hover:bg-muted/50 focus:border-primary focus:bg-primary/[0.05] flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center outline-none transition-colors",
            isDragOver &&
              "border-primary bg-primary/[0.06] ring-primary/30 ring-2",
            pendingPreview && "border-emerald-400/60 bg-emerald-50/40 dark:bg-emerald-950/20",
          )}
        >
          {pendingPreview ? (
            <>
              <img
                src={pendingPreview}
                alt="paste preview"
                className="max-h-32 rounded object-contain"
              />
              <p className="text-foreground/80 text-xs">
                {pendingFile?.name}{" "}
                <span className="text-muted-foreground">
                  · {Math.round((pendingFile?.size ?? 0) / 1024).toLocaleString()}KB
                </span>
              </p>
              <p className="text-muted-foreground text-[10px]">
                업로드 버튼을 누르거나 다른 이미지로 다시 붙여넣기·드래그하면 교체됩니다.
              </p>
            </>
          ) : (
            <>
              <ImageIcon className="text-muted-foreground/60 size-6" />
              <p className="text-muted-foreground text-xs">
                <strong className="text-foreground">클릭 후 Ctrl+V</strong> 로
                클립보드 이미지를 붙여넣거나, 파일을 이 영역으로 드래그하세요.
              </p>
              <p className="text-muted-foreground text-[10px]">
                또는 아래 파일 선택을 사용할 수 있습니다.
              </p>
            </>
          )}
        </div>

        {/* 업로드 폼 — 파일 선택은 보조 경로로 유지(같은 pendingFile 로 통합) */}
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto] sm:items-end">
          <Field label="파일 선택 (선택)">
            <Input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
              onChange={onFileInputChange}
              className="text-xs"
            />
          </Field>
          <Field label="표시 영역" htmlFor="imgPosition">
            <AdminSelect
              id="imgPosition"
              value={position}
              onChange={(e) =>
                setPosition(e.currentTarget.value as CaseImagePosition)
              }
              className="w-full"
            >
              {CASE_IMAGE_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {CASE_IMAGE_POSITION_LABELS[p]}
                </option>
              ))}
            </AdminSelect>
          </Field>
          <Button
            type="button"
            size="sm"
            onClick={onUpload}
            disabled={isUploading || !pendingFile}
          >
            <UploadIcon className="size-3.5" />
            {isUploading ? "업로드 중…" : "업로드"}
          </Button>
        </div>
        <Field label="설명 (alt, 선택 — 최대 200자)" htmlFor="imgAlt">
          <Input
            id="imgAlt"
            ref={altRef}
            placeholder="예: 청구항 1 도면 / 등록 상표 도형"
            maxLength={200}
          />
        </Field>
        <p className="text-muted-foreground text-[10px]">
          최대 10MB · JPG / PNG / WEBP / GIF / BMP. BMP 는 화면 표시는 되지만
          전송 비용이 크므로 JPG/PNG 권장.
        </p>

        {/* 그룹별 그리드 */}
        {initialImages.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
            아직 등록된 이미지가 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {CASE_IMAGE_POSITIONS.map((pos) => {
              const arr = grouped.get(pos) ?? [];
              if (arr.length === 0) return null;
              return (
                <div key={pos} className="space-y-2">
                  <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                    {CASE_IMAGE_POSITION_LABELS[pos]} ({arr.length})
                  </p>
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {arr.map((img) => (
                      <li
                        key={img.id}
                        className="border-border bg-muted/20 group relative flex flex-col gap-1 rounded-md border p-2"
                      >
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block aspect-square overflow-hidden rounded bg-white"
                        >
                          <img
                            src={img.url}
                            alt={img.alt}
                            loading="lazy"
                            className="h-full w-full object-contain"
                          />
                        </a>
                        <p className="text-foreground/80 line-clamp-2 text-[11px]">
                          {img.alt || (
                            <span className="text-muted-foreground italic">
                              (설명 없음)
                            </span>
                          )}
                        </p>
                        <div className="flex items-center justify-between gap-1">
                          <AdminSelect
                            value={img.position}
                            onChange={(e) =>
                              onChangePosition(
                                img.id,
                                e.currentTarget.value as CaseImagePosition,
                              )
                            }
                            className="h-6 text-[10px]"
                          >
                            {CASE_IMAGE_POSITIONS.map((p) => (
                              <option key={p} value={p}>
                                {CASE_IMAGE_POSITION_LABELS[p]}
                              </option>
                            ))}
                          </AdminSelect>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5"
                            title="이 이미지의 Markdown(![alt](url))을 클립보드에 복사 — 본문 textarea 원하는 위치에 Ctrl+V 로 붙여넣기"
                            onClick={() => copyImageMarkdown(img)}
                          >
                            <ClipboardCopyIcon className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20"
                            onClick={() => onRemove(img.id, img.alt)}
                            disabled={removingId === img.id}
                          >
                            <Trash2Icon className="size-3" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
