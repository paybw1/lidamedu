// 운영자 기출문제 판례 매칭 — 문제 한 건 카드 (feat-8-024).
// 발문·박스 항목·선택지 전체 지문을 렌더하고, 미연결 문제의 판례형 지문은
// 해설을 인라인으로 편집해 사건번호 추출 → 자동 재연결한다.
// admin-exam-case-links.tsx 의 행 컴포넌트.
import { ExternalLinkIcon, PencilIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Form, Link, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { ExplanationEditor } from "~/features/problems/components/explanation-editor";
import { MarkdownView } from "~/features/problems/components/markdown-view";
import {
  CHOICE_TYPE_COLOR,
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  type ExamCaseLinkRow,
  type ExamCaseSegment,
} from "~/features/problems/labels";

// 사건번호 토큰 — admin-exam-case-links.tsx 의 action 과 동일 규칙.
const CASE_NUMBER_RE = /[0-9]{2,4}[가-힣]+[0-9]+/;

function extractCaseToken(raw: string | null): string | null {
  return raw?.match(CASE_NUMBER_RE)?.[0] ?? null;
}

// 미연결 문제의 판례형 지문 — 해설 인라인 편집 폼.
// 저장 시 action(intent=edit-explanation)이 해설을 저장하고 사건번호를 추출해
// 자동 재연결한다. 연결에 성공하면 문제가 "미연결"에서 빠지며 이 폼은 사라진다.
function ExplanationEditForm({
  problemId,
  segment,
  onClose,
}: {
  problemId: string;
  segment: ExamCaseSegment;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{
    ok?: boolean;
    message?: string;
    error?: string;
  }>();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form
      method="post"
      className="bg-muted/40 mt-1 space-y-2 rounded-md border p-2"
    >
      <input type="hidden" name="intent" value="edit-explanation" />
      <input type="hidden" name="problemId" value={problemId} />
      <input type="hidden" name="segmentKind" value={segment.segmentKind} />
      <input type="hidden" name="segmentId" value={segment.segmentId} />
      <p className="text-muted-foreground text-[11px] font-semibold">
        해설 수정 — 저장하면 해설에서 사건번호를 추출해 자동 재연결합니다.
      </p>
      <ExplanationEditor
        compact
        name="explanationMd"
        defaultValue={segment.explanationMd ?? ""}
        rows={5}
        placeholder="해설 (판례 인용을 포함하면 사건번호가 자동 추출됩니다)"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "저장 중…" : "저장 후 재연결"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onClose}
          disabled={busy}
        >
          취소
        </Button>
        {fetcher.data?.error ? (
          <span className="text-[11px] text-rose-600">
            {fetcher.data.error}
          </span>
        ) : fetcher.data?.message ? (
          <span className="text-[11px] text-emerald-600">
            {fetcher.data.message}
          </span>
        ) : null}
      </div>
    </fetcher.Form>
  );
}

// 선택지/박스 항목 한 줄 — 라벨·유형·본문·지문 판례 + (편집 가능 시) 해설 편집.
function SegmentRow({
  problemId,
  segment,
  linkedTokens,
  editable,
  isEditing,
  onStartEdit,
  onCancelEdit,
}: {
  problemId: string;
  segment: ExamCaseSegment;
  linkedTokens: Set<string>;
  editable: boolean;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}) {
  const token = extractCaseToken(segment.relatedCaseNumber);
  const alreadyLinked = token !== null && linkedTokens.has(token);
  return (
    <li className="flex gap-2">
      <span className="bg-muted text-foreground/70 inline-flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-bold tabular-nums">
        {segment.label}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-1.5">
          {segment.choiceType ? (
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CHOICE_TYPE_COLOR[segment.choiceType]}`}
            >
              {CHOICE_TYPE_LABEL[segment.choiceType]}
            </span>
          ) : null}
          <MarkdownView text={segment.bodyMd} className="min-w-0 flex-1" />
        </div>
        {segment.relatedCaseNumber ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 dark:border-violet-900 dark:bg-violet-950/30">
            <span className="text-[11px] text-violet-700 dark:text-violet-300">
              지문 판례 ·{" "}
              <span className="font-mono">{segment.relatedCaseNumber}</span>
            </span>
            {alreadyLinked ? (
              <span className="text-[10px] font-semibold text-emerald-600">
                ✓ 연결됨
              </span>
            ) : token ? (
              <Form method="post">
                <input type="hidden" name="intent" value="link" />
                <input type="hidden" name="problemId" value={problemId} />
                <input
                  type="hidden"
                  name="caseNumber"
                  value={segment.relatedCaseNumber}
                />
                <button
                  type="submit"
                  className="text-[10px] font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
                >
                  이 판례 연결
                </button>
              </Form>
            ) : null}
          </div>
        ) : null}
        {editable ? (
          isEditing ? (
            <ExplanationEditForm
              problemId={problemId}
              segment={segment}
              onClose={onCancelEdit}
            />
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[11px]"
            >
              <PencilIcon className="size-3" /> 해설 수정
            </button>
          )
        ) : null}
      </div>
    </li>
  );
}

export function ExamCaseRow({ row }: { row: ExamCaseLinkRow }) {
  const linkedTokens = new Set(row.links.map((l) => l.caseNumber));
  const unlinked = row.links.length === 0;
  const empty =
    !row.bodyMd && row.boxItems.length === 0 && row.choices.length === 0;
  // 인라인 해설 편집 — 한 번에 한 지문만 (segmentId).
  const [editingSegId, setEditingSegId] = useState<string | null>(null);

  // 미연결 문제의 판례형 지문만 해설 편집 가능.
  function renderSegment(seg: ExamCaseSegment, key: string) {
    return (
      <SegmentRow
        key={key}
        problemId={row.problemId}
        segment={seg}
        linkedTokens={linkedTokens}
        editable={unlinked && seg.choiceType === "precedent"}
        isEditing={editingSegId === seg.segmentId}
        onStartEdit={() => setEditingSegId(seg.segmentId)}
        onCancelEdit={() => setEditingSegId(null)}
      />
    );
  }

  return (
    <li className="bg-card overflow-hidden rounded-lg border">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <span className="text-sm font-semibold tabular-nums">
          {row.year ? `${row.year}년 ` : ""}1차
          {row.problemNumber ? ` ${row.problemNumber}번` : ""}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {FORMAT_LABEL[row.format]}
        </Badge>
        {unlinked ? (
          <Badge
            variant="outline"
            className="border-amber-300 text-[10px] text-amber-700"
          >
            미연결
          </Badge>
        ) : (
          <span className="text-[10px] font-semibold text-emerald-600">
            판례 {row.links.length}건 연결됨
          </span>
        )}
        <Link
          to={`/subjects/${row.lawCode}/problems/${row.problemId}`}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs"
        >
          <ExternalLinkIcon className="size-3" /> 문제 전체 보기
        </Link>
      </div>

      {/* 지문 — 발문·박스 항목·선택지 */}
      <div className="space-y-2.5 px-4 py-3">
        {empty ? (
          <p className="text-muted-foreground text-xs">
            등록된 지문이 없습니다. "문제 전체 보기"로 원문을 확인하세요.
          </p>
        ) : null}
        {row.bodyMd ? (
          <MarkdownView text={row.bodyMd} className="text-sm" />
        ) : null}
        {row.boxItems.length > 0 ? (
          <ul className="bg-muted/40 space-y-2 rounded-md border p-2.5">
            {row.boxItems.map((seg, i) => renderSegment(seg, `box-${i}`))}
          </ul>
        ) : null}
        {row.choices.length > 0 ? (
          <ul className="space-y-2">
            {row.choices.map((seg, i) => renderSegment(seg, `choice-${i}`))}
          </ul>
        ) : null}
      </div>

      {/* 판례 연결 */}
      <div className="bg-muted/30 flex flex-wrap items-center gap-1.5 border-t px-4 py-2.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          연결 판례
        </span>
        {row.links.length === 0 ? (
          <span className="text-muted-foreground text-[11px]">없음</span>
        ) : null}
        {row.links.map((l) => (
          <span
            key={l.linkId}
            className="bg-background inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]"
          >
            <span className="font-mono">{l.caseNumber}</span>
            <span className="text-muted-foreground">
              {l.isAuto ? "자동" : "수동"}
            </span>
            <Form method="post" className="inline">
              <input type="hidden" name="intent" value="unlink" />
              <input type="hidden" name="linkId" value={l.linkId} />
              <button
                type="submit"
                aria-label={`${l.caseNumber} 연결 해제`}
                className="text-muted-foreground hover:text-rose-600"
              >
                <XIcon className="size-3" />
              </button>
            </Form>
          </span>
        ))}
        <Form method="post" className="ml-auto flex items-center gap-1">
          <input type="hidden" name="intent" value="link" />
          <input type="hidden" name="problemId" value={row.problemId} />
          <input
            type="text"
            name="caseNumber"
            required
            placeholder="사건번호 (예: 2019후11541)"
            className="border-input bg-background h-7 w-52 rounded-md border px-2 text-[11px]"
          />
          <Button type="submit" size="sm" variant="outline">
            추가
          </Button>
        </Form>
      </div>
    </li>
  );
}
