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
  StarIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Form, Link, data, useFetcher, useRevalidator } from "react-router";
import { toast } from "sonner";

import { reflowNumbering } from "~/features/cases/lib/reflow-numbering";
import {
  MARKDOWN_TABLE_TEMPLATE,
  clipboardToMarkdownTable,
} from "~/features/cases/lib/case-markdown";
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
import { CaseCitationsCard } from "~/features/admin/components/case-citations-card";
import { AdminSelect, Field } from "~/features/admin/components/admin-ui";
import {
  getCaseCitationsInProblems,
  type CaseCitationSummary,
} from "~/features/admin/queries/case-citations.server";
import {
  getStaffRole,
  getSystematicSkeleton,
} from "~/features/laws/queries.server";
import type { SystematicNode } from "~/features/laws/queries.server";
import {
  getCaseSiblings,
  type CaseSibling,
} from "~/features/cases/queries.server";
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
      systematicNodes: [] as SystematicNode[],
      siblings: null as Awaited<ReturnType<typeof getCaseSiblings>>,
      citations: null as CaseCitationSummary | null,
    };
  const [{ data: row, error }, relatedArticles, siblings] = await Promise.all([
    client.from("cases").select("*").eq("case_id", caseId).maybeSingle(),
    getRelatedArticlesByCase(client, caseId),
    getCaseSiblings(client, caseId),
  ]);
  if (error) throw data(error.message, { status: 500 });
  if (!row) throw data("Case not found", { status: 404 });
  // case 의 subject_laws 중 첫 번째 lawCode 의 systematic 트리 로드 — 다과목 케이스는
  // 그 첫 과목 기준 분류(현재 한국 변리사 시험 case 는 보통 단일 과목 매핑).
  const firstSubjectRaw = (row.subject_laws ?? [])[0];
  const firstSubject = (LAW_SUBJECT_SLUGS as readonly string[]).includes(
    firstSubjectRaw,
  )
    ? (firstSubjectRaw as LawSubjectSlug)
    : ("patent" as LawSubjectSlug);
  const [systematicNodes, citations] = await Promise.all([
    getSystematicSkeleton(client, firstSubject),
    getCaseCitationsInProblems(client, row.case_id, row.case_number),
  ]);
  return {
    kase: row,
    returnTo,
    role,
    relatedArticles,
    systematicNodes,
    siblings,
    citations,
  };
}

const COURTS: Array<keyof typeof COURT_LABELS> = [
  "supreme",
  "patent_court",
  "high_court",
  "district_court",
];

/* ── 페이지 ──────────────────────────────────────────────────────────── */

export default function AdminCaseEdit({ loaderData }: Route.ComponentProps) {
  const {
    kase,
    returnTo,
    role,
    relatedArticles,
    systematicNodes,
    siblings,
    citations,
  } = loaderData;
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
                caseId={isNew ? null : kase.case_id}
              />
            </Field>
            <Field label="판시이유 (Markdown)" htmlFor="reasoningMd">
              <ReflowableTextarea
                name="reasoningMd"
                defaultValue={kase?.reasoning_md ?? ""}
                rows={8}
                fieldLabel="판시이유"
                caseId={isNew ? null : kase.case_id}
                imagePosition="reasoning"
              />
            </Field>
          </CardContent>
        </Card>

        {/* 비고 · 평석 — 두 종류 분리 (사용자 결정):
              · 항목별 비고 → SummaryItemsEditor 안 "비고 [N]" textarea (요지별 인라인)
              · 전체 비고 → 이 textarea. 판결문 전체에 대한 일반 코멘트. */}
        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              비고 — 전체 판결문
            </p>
            <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
              요지 [N] 항목별 코멘트는 위 "요지" 섹션 각 항목 안의 비고 [N] 입력란을
              사용하세요. 이 필드는 <strong>판결문 전체에 걸친 일반 비고</strong>를
              위한 용도입니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="비고 본문 (Markdown)" htmlFor="commentBodyMd">
              <ReflowableTextarea
                name="commentBodyMd"
                defaultValue={kase?.comment_body_md ?? ""}
                rows={6}
                fieldLabel="비고 본문"
                caseId={isNew ? null : kase.case_id}
                imagePosition="comment"
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
                caseId={isNew ? null : kase.case_id}
                imagePosition="related"
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
            primaryArticleId={kase.primary_article_id ?? null}
            primaryNodeId={kase.primary_node_id ?? null}
            systematicNodes={systematicNodes}
          />
          {siblings && siblings.siblings.length > 1 ? (
            <CaseSourceSeqEditor
              caseId={kase.case_id}
              kind={siblings.kind}
              siblings={siblings.siblings}
            />
          ) : null}
          {citations ? (
            <CaseCitationsCard
              caseId={kase.case_id}
              caseNumber={kase.case_number}
              summary={citations}
            />
          ) : null}
        </>
      ) : null}
    </AdminShell>
  );
}

/* ── CaseSourceSeqEditor — 체계도 위치(source_seq) 수동 재배열 ─────────
   같은 placement(primary_node_id 우선, 없으면 primary_article_id) 형제 case 들의
   순서를 staff 가 직접 조정. 학생 판례 트리는 같은 노드 안에서 source_asc 정렬을
   기본으로 사용하므로(체계도 axis), 여기서의 순서가 학습 흐름에 그대로 반영됨.

   UI: 형제 목록 + 현재 case 하이라이트 + ↑↓·맨위·맨아래 버튼 + 위치 입력.
   서버는 매 호출마다 모든 형제의 source_seq 를 1..N 으로 renumber (작은 set 가정). */
function CaseSourceSeqEditor({
  caseId,
  kind,
  siblings,
}: {
  caseId: string;
  kind: "node" | "article";
  siblings: CaseSibling[];
}) {
  const moveFetcher = useFetcher<{ ok?: boolean; error?: string; from?: number; to?: number; noop?: boolean }>();
  const revalidator = useRevalidator();
  const currentIdx = siblings.findIndex((s) => s.caseId === caseId);
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === siblings.length - 1;
  const isBusy = moveFetcher.state !== "idle";

  // toast + revalidate
  const handledRef = useRef<unknown>(null);
  useEffect(() => {
    if (moveFetcher.state !== "idle") return;
    const r = moveFetcher.data;
    if (!r || r === handledRef.current) return;
    handledRef.current = r;
    if (r.ok) {
      if (!r.noop) {
        toast.success(`순서 변경: ${r.from} → ${r.to}`);
        revalidator.revalidate();
      }
    } else if (r.error) {
      toast.error(r.error);
    }
  }, [moveFetcher.state, moveFetcher.data, revalidator]);

  function submitMove(
    direction: "up" | "down" | "first" | "last" | "to_position",
    position?: number,
  ) {
    const fd = new FormData();
    fd.set("intent", "move_source_seq");
    fd.set("caseId", caseId);
    fd.set("direction", direction);
    if (direction === "to_position" && position) {
      fd.set("position", String(position));
    }
    moveFetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  const [positionInput, setPositionInput] = useState(
    currentIdx >= 0 ? String(currentIdx + 1) : "",
  );
  // currentIdx 가 외부 revalidate 로 바뀌면 input 도 동기화.
  useEffect(() => {
    if (currentIdx >= 0) setPositionInput(String(currentIdx + 1));
  }, [currentIdx]);

  return (
    <Card className="mt-4">
      <CardHeader>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          체계도 위치 (source_seq)
        </p>
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          학생 판례 트리(체계도 축)에서 같은{" "}
          <strong>{kind === "node" ? "체계도 노드" : "조문"}</strong> 안 case
          들의 노출 순서를 조정합니다. 사용자는 원본 자료 순서(source_asc)로
          노출되며, 여기서 변경한 순서가 그대로 반영됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 현재 case 액션 바 */}
        <div className="bg-muted/30 border-border flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
          <span className="text-muted-foreground text-[11px]">
            현재 위치
          </span>
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {currentIdx >= 0 ? `${currentIdx + 1} / ${siblings.length}` : "—"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={isFirst || isBusy}
              onClick={() => submitMove("first")}
            >
              맨 위
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={isFirst || isBusy}
              onClick={() => submitMove("up")}
            >
              ↑ 위로
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={isLast || isBusy}
              onClick={() => submitMove("down")}
            >
              ↓ 아래로
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={isLast || isBusy}
              onClick={() => submitMove("last")}
            >
              맨 아래
            </Button>
            <span className="text-muted-foreground ml-2 text-[11px]">|</span>
            <Input
              type="number"
              min={1}
              max={siblings.length}
              value={positionInput}
              onChange={(e) => setPositionInput(e.currentTarget.value)}
              className="h-7 w-16 px-2 text-center text-[12px] tabular-nums"
              aria-label="이동할 위치"
              disabled={isBusy}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              disabled={isBusy}
              onClick={() => {
                const n = parseInt(positionInput, 10);
                if (!Number.isInteger(n) || n < 1 || n > siblings.length) {
                  toast.error(`1 ~ ${siblings.length} 사이 숫자를 입력하세요.`);
                  return;
                }
                if (n === currentIdx + 1) return;
                submitMove("to_position", n);
              }}
            >
              위치로
            </Button>
          </div>
        </div>

        {/* 형제 목록 — 읽기 전용 (시각적 위치 확인용) */}
        <ol className="border-border divide-border space-y-0 divide-y rounded-md border text-[12px]">
          {siblings.map((s, i) => {
            const isCurrent = s.caseId === caseId;
            return (
              <li
                key={s.caseId}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5",
                  isCurrent
                    ? "bg-amber-50 dark:bg-amber-950/30"
                    : "hover:bg-muted/30",
                )}
              >
                <span className="text-muted-foreground w-6 shrink-0 text-right font-mono tabular-nums">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[11px]",
                    isCurrent ? "text-amber-700 dark:text-amber-300 font-bold" : "text-foreground",
                  )}
                >
                  {s.caseNumber}
                </span>
                <span className="text-foreground/80 flex-1 truncate">
                  {s.caseTitle}
                </span>
                {isCurrent ? (
                  <span className="shrink-0 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-700/40 dark:text-amber-200">
                    현재
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

/* ── (deprecated) SystematicLinksEditor 제거됨 ────────────────────────
   체계도 분류는 case 의 메인 조문 + 발명 sub-node 단일 placement 로 통합 —
   RelatedArticlesEditor 에 메인 라디오 + 발명 sub-node select 가 노출됨. */
function _SystematicLinksEditor_DEPRECATED({
  caseId,
  systematicNodes,
  systematicLinks,
}: {
  caseId: string;
  systematicNodes: SystematicNode[];
  systematicLinks: { nodeId: string; displayLabel: string; path: string }[];
}) {
  const addFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const removeFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  // depth=0(과목 root) 와 depth=1(대분류) 같은 컨테이너성 노드는 기본 숨김 — leaf 분류에
  // 의미가 있는 노드만 선택. 그러나 체계도 구조가 다양해 일단 전체 노출하고 path 들여쓰기로
  // 시각 구분.
  const sortedNodes = useMemo(
    () =>
      [...systematicNodes].sort((a, b) => a.path.localeCompare(b.path)),
    [systematicNodes],
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");

  const isAdding = addFetcher.state !== "idle";
  const removingId =
    removeFetcher.state !== "idle"
      ? String(removeFetcher.formData?.get("nodeId") ?? "")
      : null;
  const handledAddRef = useRef<unknown>(null);
  const handledRemoveRef = useRef<unknown>(null);

  useEffect(() => {
    if (addFetcher.state !== "idle") return;
    const r = addFetcher.data;
    if (!r || r === handledAddRef.current) return;
    handledAddRef.current = r;
    if (r.ok) {
      toast.success("체계도 분류 추가됨");
      setSelectedNodeId("");
      revalidator.revalidate();
    } else if (r.error) toast.error(r.error);
  }, [addFetcher.state, addFetcher.data, revalidator]);

  useEffect(() => {
    if (removeFetcher.state !== "idle") return;
    const r = removeFetcher.data;
    if (!r || r === handledRemoveRef.current) return;
    handledRemoveRef.current = r;
    if (r.ok) {
      toast.success("체계도 분류 제거됨");
      revalidator.revalidate();
    } else if (r.error) toast.error(r.error);
  }, [removeFetcher.state, removeFetcher.data, revalidator]);

  function onAdd() {
    if (!selectedNodeId) {
      toast.error("분류를 선택하세요.");
      return;
    }
    if (systematicLinks.some((l) => l.nodeId === selectedNodeId)) {
      toast.info("이미 추가된 분류입니다.");
      return;
    }
    const fd = new FormData();
    fd.set("intent", "add_systematic");
    fd.set("caseId", caseId);
    fd.set("nodeId", selectedNodeId);
    addFetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  function onRemove(nodeId: string) {
    const fd = new FormData();
    fd.set("intent", "remove_systematic");
    fd.set("caseId", caseId);
    fd.set("nodeId", nodeId);
    removeFetcher.submit(fd, { method: "post", action: "/api/admin/case" });
  }

  // 들여쓰기 — path 의 . 개수로 depth.
  function depthOf(path: string) {
    return path.split(".").length;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <NetworkIcon className="size-3.5" /> 체계도 분류
        </p>
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          이 판례를 학습 체계도의 sub-node(예: 발명 &gt; 일반발명 /
          BM발명 / 용도(의약)발명 / 미생물발명 / 식물발명 / 실시)에 직접 분류합니다.
          관련 조문 매핑과 별개로 동작하며, 학생 화면의 판례 트리에서 해당 노드를
          누르면 이 판례가 결과에 포함됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {systematicLinks.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {systematicLinks.map((l) => {
              const removing = removingId === l.nodeId;
              return (
                <li key={l.nodeId}>
                  <span
                    className={cn(
                      "border-border bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      removing && "opacity-50",
                    )}
                  >
                    <span className="font-medium">{l.displayLabel}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {l.path}
                    </span>
                    <button
                      type="button"
                      aria-label={`${l.displayLabel} 분류 제거`}
                      title="제거"
                      onClick={() => onRemove(l.nodeId)}
                      disabled={removing}
                      className="hover:text-rose-600 disabled:opacity-50"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
            아직 매핑된 체계도 분류가 없습니다.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Field label="분류 추가" htmlFor="newSystematicNode">
            <AdminSelect
              id="newSystematicNode"
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.currentTarget.value)}
              className="w-72"
            >
              <option value="">— 선택 —</option>
              {sortedNodes.map((n) => {
                const indent = "··".repeat(Math.max(0, depthOf(n.path) - 1));
                return (
                  <option key={n.nodeId} value={n.nodeId}>
                    {indent}
                    {indent ? " " : ""}
                    {n.displayLabel}
                  </option>
                );
              })}
            </AdminSelect>
          </Field>
          <Button type="button" size="sm" onClick={onAdd} disabled={isAdding}>
            <PlusIcon className="size-3.5" />
            {isAdding ? "추가 중…" : "분류 추가"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── RelatedArticlesEditor ──────────────────────────────────────────── */
// feat-7-005 후속: 개별 판례 수정 페이지에서 관련 조문 직접 편집.
// /api/admin/case-link (intent=add/remove) 호출. fetcher 로 revalidate 자동.
// 학생 트리에서 case 의 단일 placement 결정에 사용하는 patent 제2조(발명) article_id.
// 다른 과목으로 확장 시 매핑 테이블 도입.
const PATENT_INVENTION_ARTICLE_ID = "c38b3f2d-1e84-4268-9220-f00f0d05001d";
// 발명 sub-node parent id (patent.b1.b2). 학생 트리 발명 자식 6개를 추려내는 키.
const PATENT_INVENTION_NODE_ID = "e2145cae-6ae1-4bcb-b477-824e5a9f37d4";
// 제29조 특허요건 — 4개 leaf sub-node 직접 매핑(산업상 이용가능성/신규성/진보성/확대된 선출원).
// 같은 parent(patent.b2.b1) 아래 "선출원주의"(제36조 소관)는 의도적으로 제외.
const PATENT_PATENTABILITY_ARTICLE_ID = "79650d86-1a89-46bb-ae76-323f5e72a05d";
const PATENT_PATENTABILITY_SUB_NODE_IDS: readonly string[] = [
  "71569e62-2884-4840-954b-bcc18a957c1e", // 산업상 이용가능성
  "1d0dcfcc-e4b7-4765-aaa0-f83977732fba", // 신규성
  "0371855a-405f-4023-82a1-be93e2d06900", // 진보성
  "0414fdbe-5db4-43d9-85c9-978c1cae23f3", // 확대된 선출원
];

// 출원인(patent.b2.b3.b1) — 3개 case_only 자식(권리능력/발명자·승계인/공동출원)을
// 직접 매핑. 메인 조문이 제25조/제33조/제44조 어느 것이든 같은 picker 노출.
const PATENT_APPLICANT_PARENT_NODE_ID = "8692dd8d-74b7-4ad8-ad0e-105a224eda98";
const PATENT_APPLICANT_ARTICLE_IDS: readonly string[] = [
  "2f59441e-c048-4304-97f1-30c131b4fea2", // 제25조 외국인의 권리능력 → 권리능력
  "7996f53d-74c8-4b25-81ce-28d8049c3e10", // 제33조 특허를 받을 수 있는 자 → 발명자/승계인
  "743b334c-1562-4216-8b72-73c7b82c3e7d", // 제44조 공동출원 → 공동출원
];

// 특허출원에 필요한 서류(patent.b2.b4.b1) — 5개 case_only 자식(기재방법일반/연결부/
// 젭슨청구항/PBP청구항/기능식표현청구항). 메인 조문이 제42·42의2·42의3·43조
// 어느 것이든 같은 picker 노출.
const PATENT_DESCRIPTION_PARENT_NODE_ID = "f52d55dc-3d25-4acd-82eb-f246dcaf165c";
const PATENT_DESCRIPTION_ARTICLE_IDS: readonly string[] = [
  "7acfbe55-ec48-42c2-a5b5-615c92c98185", // 제42조 특허출원
  "7f9bbc74-df0c-406c-a775-4a9123885c46", // 제42조의2 특허출원일 등
  "e34d4487-8474-4598-acac-71ae3b979002", // 제42조의3 외국어특허출원 등
  "2a6d5b58-7bcd-4309-8a5b-a6fa2cebf67e", // 제43조 요약서
];

// 정정심판/특허의 정정(patent.b6.b6.b5) — 6개 case_only 자식(정정의 요건/의견제출기회/
// 일부인용·기각/특허의 정정·무효심판/정정심판·무효심판/기타). ASL 직접 매핑이 없는
// case_only 노드이므로 메인 조문(제132조의3/제133조의2/제136조/제137조)으로 picker 활성.
const PATENT_CORRECTION_PARENT_NODE_ID = "0956e634-3723-438a-a20d-f610bda7cd67";
const PATENT_CORRECTION_ARTICLE_IDS: readonly string[] = [
  "97614cc8-0cad-495c-aa1a-0b2977409364", // 제132조의3 특허취소신청절차에서의 특허의 정정
  "5f92f6ca-24b8-42f2-8d3d-bd4cdcc7421e", // 제133조의2 특허무효심판절차에서의 특허의 정정
  "7ff02222-c030-4d00-ace6-60718f38e425", // 제136조 정정심판
  "291b05f6-9c91-4cb7-b4c8-d1584ed54a44", // 제137조 정정의 무효심판
];

// 메인 조문별 sub-node 분류 — 메인 조문이 학습상 다중 분기되는 경우 staff 가
// sub-node 를 명시 선택한다. 학생 트리는 sub-node 가 set 되면 그 leaf 한 곳에만
// case 를 노출(`primary_node_id` 우선; `getCasePlacementMaps` 참조).
//   • 제2조 정의 → 발명 부모(patent.b1.b2)의 자식 6개 (일반발명/BM발명/...)
//   • 제29조 특허요건 → 4개 leaf node 직접 (산업상 이용가능성/신규성/진보성/확대된 선출원)
//   • 제25·33·44조 출원인 → 출원인 부모(patent.b2.b3.b1)의 case_only 자식 3개
//                          (권리능력/발명자·승계인/공동출원)
//   • 제42·42의2·42의3·43조 출원서류 → 특허출원에 필요한 서류 부모(patent.b2.b4.b1)의
//                          case_only 자식 5개 (기재방법일반/연결부/젭슨청구항/PBP청구항/
//                          기능식표현청구항)
//   • 제132조의3/제133조의2/제136조/제137조 정정 → 정정심판/특허의 정정 부모(patent.b6.b6.b5)의
//                          case_only 자식 6개 (정정의 요건/의견제출기회/일부인용·기각/
//                          특허의 정정·무효심판/정정심판·무효심판/기타)
// 확장 시 SUB_NODE_CONFIGS 에 항목 추가.
type SubNodeArticleConfig = {
  articleId: string;
  articleLabel: string;
  resolveSubNodes: (all: SystematicNode[]) => SystematicNode[];
};

const resolvePatentApplicantSubNodes = (all: SystematicNode[]) =>
  all
    .filter(
      (n) => n.parentId === PATENT_APPLICANT_PARENT_NODE_ID && n.caseOnly,
    )
    .sort((a, b) => a.ord - b.ord);

const resolvePatentDescriptionSubNodes = (all: SystematicNode[]) =>
  all
    .filter(
      (n) => n.parentId === PATENT_DESCRIPTION_PARENT_NODE_ID && n.caseOnly,
    )
    .sort((a, b) => a.ord - b.ord);

const resolvePatentCorrectionSubNodes = (all: SystematicNode[]) =>
  all
    .filter(
      (n) => n.parentId === PATENT_CORRECTION_PARENT_NODE_ID && n.caseOnly,
    )
    .sort((a, b) => a.ord - b.ord);

const SUB_NODE_CONFIGS: readonly SubNodeArticleConfig[] = [
  {
    articleId: PATENT_INVENTION_ARTICLE_ID,
    articleLabel: "제2조 발명",
    resolveSubNodes: (all) =>
      all
        .filter((n) => n.parentId === PATENT_INVENTION_NODE_ID)
        .sort((a, b) => a.path.localeCompare(b.path)),
  },
  {
    articleId: PATENT_PATENTABILITY_ARTICLE_ID,
    articleLabel: "제29조 특허요건",
    resolveSubNodes: (all) => {
      const byId = new Map(all.map((n) => [n.nodeId, n] as const));
      return PATENT_PATENTABILITY_SUB_NODE_IDS.map((id) => byId.get(id)).filter(
        (n): n is SystematicNode => Boolean(n),
      );
    },
  },
  ...PATENT_APPLICANT_ARTICLE_IDS.map((articleId) => ({
    articleId,
    articleLabel: "출원인",
    resolveSubNodes: resolvePatentApplicantSubNodes,
  })),
  ...PATENT_DESCRIPTION_ARTICLE_IDS.map((articleId) => ({
    articleId,
    articleLabel: "특허출원에 필요한 서류",
    resolveSubNodes: resolvePatentDescriptionSubNodes,
  })),
  ...PATENT_CORRECTION_ARTICLE_IDS.map((articleId) => ({
    articleId,
    articleLabel: "정정심판/특허의 정정",
    resolveSubNodes: resolvePatentCorrectionSubNodes,
  })),
];

function RelatedArticlesEditor({
  caseId,
  subjectLaws,
  relatedArticles,
  primaryArticleId,
  primaryNodeId,
  systematicNodes,
}: {
  caseId: string;
  subjectLaws: LawSubjectSlug[];
  relatedArticles: RelatedArticle[];
  primaryArticleId: string | null;
  primaryNodeId: string | null;
  systematicNodes: SystematicNode[];
}) {
  const addFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const removeFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const primaryFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedLaw, setSelectedLaw] = useState<LawSubjectSlug>(
    (subjectLaws[0] ?? "patent") as LawSubjectSlug,
  );
  // 각 sub-node config 의 실제 노드 리스트 (systematicNodes 로부터 resolve).
  // 판례 트리 컨텍스트 — caseDisplayLabel 이 있으면 선택지 라벨에 오버라이드 적용
  // (예: "일반발명" → "발명일반"). 학생 판례 트리와 라벨 일치.
  const caseViewNodes = useMemo(
    () =>
      systematicNodes.map((n) =>
        n.caseDisplayLabel
          ? { ...n, displayLabel: n.caseDisplayLabel }
          : n,
      ),
    [systematicNodes],
  );
  const configsWithNodes = useMemo(
    () =>
      SUB_NODE_CONFIGS.map((cfg) => ({
        cfg,
        nodes: cfg.resolveSubNodes(caseViewNodes),
      })),
    [caseViewNodes],
  );
  // 일반 메인 노드 picker — sub-node config 가 없는 메인 조문도 staff 가
  // 체계도 노드를 명시 선택 가능하게. 메인 조문이 ASL로 매핑된 모든 노드를 옵션.
  // path 라벨(부모 > 자식 체인)로 staff 가 노드 위치를 한눈에 파악.
  const nodeMap = useMemo(
    () => new Map(caseViewNodes.map((n) => [n.nodeId, n] as const)),
    [caseViewNodes],
  );
  const nodesByArticle = useMemo(() => {
    const m = new Map<string, typeof caseViewNodes>();
    for (const n of caseViewNodes) {
      for (const a of n.articles) {
        const arr = m.get(a.articleId);
        if (arr) arr.push(n);
        else m.set(a.articleId, [n]);
      }
    }
    return m;
  }, [caseViewNodes]);
  const pathOf = useCallback(
    (nodeId: string): string => {
      const parts: string[] = [];
      let cur = nodeMap.get(nodeId);
      let safety = 10;
      while (cur && safety-- > 0) {
        parts.unshift(cur.displayLabel);
        cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
      }
      return parts.join(" > ");
    },
    [nodeMap],
  );
  // ASL 매핑 노드 + 그 자손 중 caseOnly 인 노드들도 옵션에 포함.
  // caseOnly 자손은 ASL 직접 매핑이 없는 판례 전용 세부 분기(예: 효력내용 ↘
  // 하자/자유기술/권리남용에 의한 제한). staff 가 picker 에서 바로 선택 가능.
  // 비-caseOnly 자손은 별도 ASL 매핑 영역이므로 포함하지 않는다 — 그게 정작
  // 같은 article 의 매핑이라면 이미 1단계 ASL 검색에 잡힌다.
  const childrenByParent = useMemo(() => {
    const m = new Map<string, typeof caseViewNodes>();
    for (const n of caseViewNodes) {
      if (!n.parentId) continue;
      const arr = m.get(n.parentId);
      if (arr) arr.push(n);
      else m.set(n.parentId, [n]);
    }
    return m;
  }, [caseViewNodes]);
  const primaryAslNodes = useMemo(() => {
    if (!primaryArticleId) return [];
    const aslNodes = nodesByArticle.get(primaryArticleId) ?? [];
    const out: typeof caseViewNodes = [...aslNodes];
    const seen = new Set(aslNodes.map((n) => n.nodeId));
    const queue = [...seen];
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const child of childrenByParent.get(id) ?? []) {
        if (!child.caseOnly || seen.has(child.nodeId)) continue;
        seen.add(child.nodeId);
        out.push(child);
        queue.push(child.nodeId);
      }
    }
    return out.sort((a, b) =>
      pathOf(a.nodeId).localeCompare(pathOf(b.nodeId), "ko"),
    );
  }, [primaryArticleId, nodesByArticle, childrenByParent, pathOf]);
  // 활성 config 결정 — sub-node UI 노출 + setPrimary 시 articleId 참조용.
  //   1) staff 가 ★ 로 메인 조문(제2조·제29조)을 명시 설정한 경우 (primary_article_id 일치)
  //   2) 자동 배치로 primary_node_id 가 1차 sub-node 중 하나로 set 된 경우
  //   3) primary_node_id 가 1차 sub-node 의 case_only 자식(예: 동일성)인 경우
  //      — 부모(신규성)를 통해 config 를 찾아 2차 picker 가 정상 노출되도록.
  //      이때 primary_article_id 가 null 이어도 sub-node 편집 가능해야 staff 가 보정 가능.
  const activeSubNodeConfig = useMemo(() => {
    const byArticle = configsWithNodes.find(
      (c) => c.cfg.articleId === primaryArticleId,
    );
    if (byArticle) return byArticle;
    if (primaryNodeId) {
      const byNode = configsWithNodes.find((c) =>
        c.nodes.some((n) => n.nodeId === primaryNodeId),
      );
      if (byNode) return byNode;
      // primary 가 1차 sub-node 의 자식이면 부모 기준으로 config 매칭.
      const me = caseViewNodes.find((n) => n.nodeId === primaryNodeId);
      if (me?.parentId) {
        const byParent = configsWithNodes.find((c) =>
          c.nodes.some((n) => n.nodeId === me.parentId),
        );
        if (byParent) return byParent;
      }
    }
    return null;
  }, [configsWithNodes, primaryArticleId, primaryNodeId, caseViewNodes]);

  // 2차 sub-node picker — 1차 선택값(또는 그 부모)에 case_only 자식이 있으면 노출.
  //   예: 제29조 → 신규성 → 신규성일반/동일성. 판례 트리 전용 (case_only) 자식만
  //   다단 선택 대상이라 조문/문제 트리는 영향 없음.
  // 반환:
  //   • parentId: 1차 picker 가 가리키는 노드 (예: 신규성)
  //   • parentLabel: 그 노드 라벨 (라벨 오버라이드 반영됨)
  //   • children: case_only 자식 노드 리스트 (ord 오름차순)
  //   • selectedChildId: primary_node_id 가 자식이면 그 id, 부모면 null
  const level2 = useMemo(() => {
    if (!activeSubNodeConfig || !primaryNodeId) return null;
    // primary 가 1차 옵션 자체일 때 — 그 노드의 자식을 2차 후보로.
    const asLevel1 = activeSubNodeConfig.nodes.find(
      (n) => n.nodeId === primaryNodeId,
    );
    if (asLevel1) {
      const children = caseViewNodes
        .filter((n) => n.parentId === asLevel1.nodeId && n.caseOnly)
        .sort((a, b) => a.ord - b.ord);
      if (children.length === 0) return null;
      return {
        parentId: asLevel1.nodeId,
        parentLabel: asLevel1.displayLabel,
        children,
        selectedChildId: null as string | null,
      };
    }
    // primary 가 1차 옵션 자식(case_only) — 부모를 통해 2차 picker 재구성.
    const me = caseViewNodes.find((n) => n.nodeId === primaryNodeId);
    if (!me?.parentId) return null;
    const parent = activeSubNodeConfig.nodes.find(
      (n) => n.nodeId === me.parentId,
    );
    if (!parent) return null;
    const children = caseViewNodes
      .filter((n) => n.parentId === parent.nodeId && n.caseOnly)
      .sort((a, b) => a.ord - b.ord);
    if (children.length === 0) return null;
    return {
      parentId: parent.nodeId,
      parentLabel: parent.displayLabel,
      children,
      selectedChildId: primaryNodeId,
    };
  }, [activeSubNodeConfig, primaryNodeId, caseViewNodes]);

  // 1차 select 가 표시할 값 — primary 가 2차 자식이면 부모(예: 신규성)를 노출.
  const level1Value = level2
    ? level2.parentId
    : (primaryNodeId ?? "");

  // 메인 placement 설정 — articleId(null=해제) + 발명일 때 nodeId 동시 전달.
  function setPrimary(articleId: string | null, nodeId: string | null) {
    const fd = new FormData();
    fd.set("intent", "set_primary_placement");
    fd.set("caseId", caseId);
    if (articleId) fd.set("articleId", articleId);
    if (nodeId) fd.set("nodeId", nodeId);
    primaryFetcher.submit(fd, {
      method: "post",
      action: "/api/admin/case",
    });
  }
  const handledPrimaryRef = useRef<unknown>(null);
  useEffect(() => {
    if (primaryFetcher.state !== "idle") return;
    const r = primaryFetcher.data;
    if (!r || r === handledPrimaryRef.current) return;
    handledPrimaryRef.current = r;
    if (r.ok) {
      toast.success("메인 조문이 설정됐습니다.");
      revalidator.revalidate();
    } else if (r.error) toast.error(r.error);
  }, [primaryFetcher.state, primaryFetcher.data, revalidator]);

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
          관련 조문 · 메인 위치
        </p>
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          관련 조문을 매핑하고, 그 중 <strong>메인 조문</strong>(★)을
          한 개 선택하세요. 학생 화면의 판례 트리에서는 그 메인 조문이 속한 위치 한
          곳에만 노출됩니다. <strong>제2조 발명</strong>(일반발명/BM발명/용도(의약)/
          미생물/식물/실시) 또는 <strong>제29조 특허요건</strong>(산업상 이용가능성/
          신규성/진보성/확대된 선출원)이 메인이면 sub-node 도 함께 선택합니다.
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
              const isPrimary = a.articleId === primaryArticleId;
              return (
                <li key={a.articleId}>
                  <span
                    className={cn(
                      "border-border bg-muted/40 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      removing && "opacity-50",
                      isPrimary &&
                        "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
                    )}
                  >
                    <button
                      type="button"
                      title={isPrimary ? "메인 조문 (해제)" : "메인 조문으로 설정"}
                      aria-label={
                        isPrimary
                          ? "메인 조문 해제"
                          : `${a.displayLabel} 을(를) 메인 조문으로 설정`
                      }
                      onClick={() =>
                        isPrimary
                          ? setPrimary(null, null)
                          : setPrimary(a.articleId, null)
                      }
                      className={cn(
                        "transition-colors",
                        isPrimary
                          ? "text-amber-500"
                          : "text-muted-foreground/60 hover:text-amber-500",
                      )}
                    >
                      <StarIcon
                        className={cn("size-3.5", isPrimary && "fill-amber-400")}
                      />
                    </button>
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

        {/* sub-node select — 메인 조문이 sub-node 분기 대상(제2조 발명 / 제29조 특허요건 /
            제25·33·44조 출원인 / 제42·42의2·42의3·43조 출원서류)일 때만 노출.
            1차 picker 의 선택값에 case_only 자식이 있으면(예: 신규성 → 신규성일반/동일성)
            2차 picker 가 같은 박스 안에 함께 노출된다. */}
        {activeSubNodeConfig ? (
          <div className="border-amber-300 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/20 flex flex-wrap items-end gap-2 rounded-md border px-3 py-2">
            <Field
              label={`${activeSubNodeConfig.cfg.articleLabel} sub-node (메인이 ${activeSubNodeConfig.cfg.articleLabel}일 때 필수)`}
              htmlFor="primarySubNode"
            >
              <AdminSelect
                id="primarySubNode"
                value={level1Value}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  // 1차 변경 시 2차 선택은 자연 해제 — primary_node_id 가 새 1차 옵션
                  // (또는 null = 조문 자체) 으로 set 되면서 level2 가 재계산된다.
                  setPrimary(
                    activeSubNodeConfig.cfg.articleId,
                    v === "" ? null : v,
                  );
                }}
                className="w-56"
              >
                <option value="">— 선택 안 함 (조문 자체) —</option>
                {activeSubNodeConfig.nodes.map((n) => (
                  <option key={n.nodeId} value={n.nodeId}>
                    {n.displayLabel}
                  </option>
                ))}
              </AdminSelect>
            </Field>
            {level2 ? (
              <Field
                label={`${level2.parentLabel} 세부 분기 (선택)`}
                htmlFor="primarySubSubNode"
              >
                <AdminSelect
                  id="primarySubSubNode"
                  value={level2.selectedChildId ?? ""}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    // 빈 값 → 부모 노드(예: 신규성) 자체로 placement 복귀.
                    setPrimary(
                      activeSubNodeConfig.cfg.articleId,
                      v === "" ? level2.parentId : v,
                    );
                  }}
                  className="w-44"
                >
                  <option value="">— {level2.parentLabel} 그대로 —</option>
                  {level2.children.map((c) => (
                    <option key={c.nodeId} value={c.nodeId}>
                      {c.displayLabel}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
            ) : null}
          </div>
        ) : null}

        {/* 일반 메인 노드 picker — sub-node config 없는 메인 조문도 staff 가
            체계도 노드를 명시 선택. 메인 조문이 여러 노드에 ASL 매핑된 경우
            한 case 가 양쪽에 산포되는 단일 placement 위반을 여기서 해소. */}
        {primaryArticleId && !activeSubNodeConfig ? (
          primaryAslNodes.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-[11px]">
              이 메인 조문은 체계도(<code>article_systematic_links</code>)에
              매핑되어 있지 않습니다. 학생 판례 트리의 체계도 axis 에는
              노출되지 않습니다.
            </p>
          ) : (
            <div className="border-amber-300 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/20 flex flex-wrap items-end gap-2 rounded-md border px-3 py-2">
              <Field label="체계도 메인 노드" htmlFor="primaryGenericNode">
                <AdminSelect
                  id="primaryGenericNode"
                  value={primaryNodeId ?? ""}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    setPrimary(primaryArticleId, v === "" ? null : v);
                  }}
                  className="w-72"
                >
                  <option value="">
                    — 자동 (미지정 — 매핑된 모든 노드에 산포){" "}
                    {primaryAslNodes.length >= 2 ? "⚠" : ""}
                  </option>
                  {primaryAslNodes.map((n) => (
                    <option key={n.nodeId} value={n.nodeId}>
                      {pathOf(n.nodeId)}
                    </option>
                  ))}
                </AdminSelect>
              </Field>
              <p className="text-muted-foreground basis-full text-[11px] leading-relaxed">
                {primaryAslNodes.length >= 2 ? (
                  <>
                    메인 조문이 <strong>{primaryAslNodes.length}개</strong>
                    체계도 노드에 매핑되어 있어, 미지정 시 학생 판례 트리에서
                    양쪽에 중복 노출됩니다. 한 노드를 메인으로 지정하세요.
                  </>
                ) : (
                  <>
                    메인 조문이 한 체계도 노드에만 매핑되어 있어 미지정으로
                    두어도 됩니다. 다른 노드로 옮기려면 위에서 선택하세요.
                  </>
                )}
              </p>
            </div>
          )
        ) : null}

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
  caseId,
  imagePosition,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (next: string) => void;
  rows: number;
  fieldLabel: string;
  /** 신규 등록(create) 모드면 null — 그 경우 paste 이미지 업로드 비활성. */
  caseId?: string | null;
  /** paste 업로드된 이미지의 표시 영역. 본문 위치에 맞춰 자동 분류. */
  imagePosition?: CaseImagePosition;
}) {
  const isControlled = value !== undefined;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const revalidator = useRevalidator();
  // 라이브 preview 토글 + textarea 의 현재 값을 추적해 preview 렌더.
  // controlled mode 면 value, uncontrolled mode 면 onInput 시점 textarea.value 를 state.
  const [previewOn, setPreviewOn] = useState(false);
  const [uncontrolledMirror, setUncontrolledMirror] = useState(
    defaultValue ?? "",
  );
  const [pasteUploading, setPasteUploading] = useState(false);
  const previewText = isControlled ? (value ?? "") : uncontrolledMirror;

  // cursor 위치(또는 selection 끝)에 텍스트를 삽입하고 cursor 를 삽입 직후로 이동.
  // pos 가 주어지면 그 위치를 기준(async upload 후 호출), 없으면 현재 selection.
  function insertAtCursor(snippet: string, pos?: number) {
    const el = ref.current;
    if (!el) return;
    const start = pos ?? el.selectionStart ?? el.value.length;
    const end = pos ?? el.selectionEnd ?? el.value.length;
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

  // 클립보드 이미지 → 즉시 storage 업로드 + cursor 위치에 markdown 삽입.
  // 응답이 늦어 사용자가 그 사이 typing 해도 paste 시점 cursor 위치를 기준으로
  // 삽입. caseId 가 없으면 (create 모드) 호출되지 않는다.
  async function uploadAndInsertImage(file: File, cursorAt: number) {
    if (!caseId) return;
    setPasteUploading(true);
    const fd = new FormData();
    fd.set("intent", "upload_image");
    fd.set("caseId", caseId);
    fd.set("position", imagePosition ?? "pending");
    fd.set("alt", "");
    fd.set("file", file);
    try {
      const resp = await fetch("/api/admin/case", {
        method: "POST",
        body: fd,
      });
      if (!resp.ok) {
        // action 이 data({error}, {status:4xx}) 로 반환 — JSON 시도.
        let msg = `HTTP ${resp.status}`;
        try {
          const j = (await resp.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* ignore */
        }
        toast.error(`이미지 업로드 실패: ${msg}`);
        return;
      }
      const data = (await resp.json()) as {
        ok?: boolean;
        image?: { url?: string };
        error?: string;
      };
      if (data.ok && data.image?.url) {
        insertAtCursor(`![](${data.image.url})`, cursorAt);
        toast.success(
          `${fieldLabel} 에 이미지가 삽입됐습니다 — 미리보기로 확인하세요.`,
        );
        revalidator.revalidate(); // ImagesCard 갱신
      } else {
        toast.error(data.error ?? "이미지 업로드 실패");
      }
    } catch (err) {
      toast.error("이미지 업로드 실패 — 네트워크를 확인하세요.");
    } finally {
      setPasteUploading(false);
    }
  }

  // 클립보드 paste 핸들러 — 세 가지 형식 자동 감지:
  //   1) 이미지 파일 → storage 업로드 + ![](url) 삽입 (caseId 필요)
  //   2) HTML/TSV 표 → GFM markdown 표로 변환·삽입 (caseId 무관, create 모드도 가능)
  //   3) 그 외 → 기본 paste 동작 (텍스트)
  function onPasteImage(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    // 이미지 우선 (caseId 있을 때만 — create 모드에서는 storage 업로드 불가)
    if (caseId) {
      const items = e.clipboardData?.items;
      if (items) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.kind === "file" && it.type.startsWith("image/")) {
            const file = it.getAsFile();
            if (!file) continue;
            e.preventDefault();
            const el = e.currentTarget;
            const start = el.selectionStart ?? el.value.length;
            void uploadAndInsertImage(file, start);
            return;
          }
        }
      }
    }
    // 표 변환 시도 — HTML <table> 또는 TSV 일 때만 매칭. 일반 텍스트는 null 반환.
    const tableMd = clipboardToMarkdownTable(e.clipboardData ?? null);
    if (tableMd) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? el.value.length;
      insertAtCursor(tableMd, start);
      toast.success(`${fieldLabel} 에 표가 markdown 으로 변환되어 삽입됐습니다.`);
      return;
    }
    // 텍스트 paste — 기본 동작 유지
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
          title="cursor 위치에 markdown 표 템플릿 삽입. Excel/Word 표는 그냥 Ctrl+V 로 paste 해도 자동 변환됨."
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
      {caseId && pasteUploading ? (
        <p className="text-muted-foreground mb-1 text-[10px]">
          이미지 업로드 중… 응답이 도착하면 cursor 위치에 markdown 이 삽입됩니다.
        </p>
      ) : null}
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
            onPaste={onPasteImage}
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
            onPaste={onPasteImage}
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

type SummaryItem = { title: string; body: string; commentMd?: string };

function parseSummaryItems(raw: unknown): SummaryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SummaryItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const comment =
      typeof o.commentMd === "string"
        ? o.commentMd
        : typeof o.comment_md === "string"
          ? (o.comment_md as string)
          : "";
    out.push({
      title: typeof o.title === "string" ? o.title : "",
      body: typeof o.body === "string" ? o.body : "",
      ...(comment !== "" ? { commentMd: comment } : {}),
    });
  }
  return out;
}

function SummaryItemsEditor({
  defaultItems,
  caseId,
}: {
  defaultItems: SummaryItem[];
  caseId: string | null;
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
            caseId={caseId}
            imagePosition="summary"
          />
          {/* 항목별 비고 — 이 요지 소제목·본문에 대한 코멘트.
              학생 화면의 요지 [N] 본문 바로 아래에 amber 카드로 인라인 노출
              ("비고 [N]" 라벨). 비어 있으면 비고 노출 안 함. */}
          <div className="space-y-1 border-t border-dashed pt-2">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
              비고 [{i + 1}] — 이 요지에 대한 코멘트 (인라인 노출)
            </p>
            <ReflowableTextarea
              value={it.commentMd ?? ""}
              onChange={(next) =>
                patch(i, { commentMd: next === "" ? undefined : next })
              }
              rows={3}
              fieldLabel={`비고 [${i + 1}]`}
              caseId={caseId}
              imagePosition="comment"
            />
          </div>
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
// 판례 본문 이미지 — 업로드는 본문 textarea 의 Ctrl+V 가 단일 진입점 (자동 업로드 +
// markdown 인라인 삽입). 이 카드는 등록된 이미지 관리만 — 표시 영역 변경 / Markdown
// 복사 / 삭제. 폼 밖이라 메인 Form 과 독립.
function ImagesCard({
  caseId,
  initialImages,
}: {
  caseId: string;
  initialImages: CaseImage[];
}) {
  const removeFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const metaFetcher = useFetcher<{
    ok?: boolean;
    image?: CaseImage;
    error?: string;
  }>();
  const revalidator = useRevalidator();

  const removingId =
    removeFetcher.state !== "idle"
      ? String(removeFetcher.formData?.get("imageId") ?? "")
      : null;

  // 처리된 응답을 ref 로 추적 — useRevalidator() 반환 객체가 매 render 새로 생겨
  // useEffect deps 에 두면 무한 fire(메타 변경 → revalidate → 부모 re-render →
  // 또 fire → toast → revalidate ...)되는 문제 회피.
  // 같은 fetcher.data reference 는 한 번만 처리.
  const handledRemoveRef = useRef<unknown>(null);
  const handledMetaRef = useRef<unknown>(null);

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
          이미지는 본문 textarea(요지·판시이유·비고·관련자료) 에 <strong>Ctrl+V</strong> 로
          붙여넣으면 즉시 업로드되어 그 위치에 삽입됩니다. 이 영역은 등록된 이미지의
          분류 변경 / Markdown 복사 / 삭제를 위한 관리 패널입니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 그룹별 그리드 */}
        {initialImages.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-xs">
            아직 등록된 이미지가 없습니다. 본문에 Ctrl+V 로 이미지를 붙여넣어 추가하세요.
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
