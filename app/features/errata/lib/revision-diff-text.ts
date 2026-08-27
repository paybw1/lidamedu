// 개정 원장 스냅샷 → 정오표에 실을 "변경 전 / 변경 후" 문구.
//
// 발행 액션과 기존 발행분 재계산 스크립트가 같은 결과를 내야 하므로 순수 모듈로 둔다.
// (서버 전용 import 금지 — .server 를 끌어들이면 스크립트에서 못 쓴다)
import { diffLines } from "~/core/lib/diff-lines";
import {
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";

export const MAX_FIELD_TEXT = 20_000;

const ENUM_FIELD_LABELS: Record<string, Record<string, string>> = {
  scope: SCOPE_LABEL,
  polarity: POLARITY_LABEL,
  format: FORMAT_LABEL,
  origin: ORIGIN_LABEL,
  subjective_kind: SUBJECTIVE_KIND_LABEL,
  choice_type: CHOICE_TYPE_LABEL,
};

/**
 * 본문 성격의 필드 — 문장을 그대로 싣는다.
 * 그 밖의 필드는 값만 실으면 무슨 뜻인지 알 수 없어(“2020 → 2026”) 라벨을 앞에 붙인다.
 */
const TEXT_FIELDS = new Set([
  "body_md",
  "body_text",
  "explanation_md",
  "model_answer_md",
  "grading_rubric_md",
  "content_md",
  "summary_md",
  "holding_md",
  "reasoning_md",
  "commentary_md",
  "note",
]);

const FIELD_LABEL: Record<string, string> = {
  scope: "문제 구분",
  origin: "출처",
  polarity: "발문 유형",
  format: "문제 형식",
  year: "출제 연도",
  exam_round_no: "회차",
  exam_round: "차수",
  problem_number: "수록 번호",
  exam_number: "시험 문항 번호",
  choice_type: "지문 분류",
  ox_truth: "정오문제 정답",
  ox_ineligible: "정오문제 불가",
  total_points: "배점",
  subjective_kind: "주관식 유형",
  subjective_topic: "주관식 주제",
  importance: "중요도",
  marker: "보기 기호",
  position_index: "보기 순서",
  choice_index: "지문 번호",
  related_article_number: "관련 조문",
  related_case_number: "관련 판례",
  main_case_number: "메인 판례",
  effective_date: "시행일",
};

function fieldOf(snapshot: unknown, field: string): unknown {
  if (snapshot == null || typeof snapshot !== "object") return undefined;
  return (snapshot as Record<string, unknown>)[field];
}

const cut = (s: string) =>
  s.length > MAX_FIELD_TEXT ? s.slice(0, MAX_FIELD_TEXT) + "\n…(생략)" : s;

/** 한 필드의 사람이 읽는 값. 열거형은 라벨로, 본문이 아닌 필드는 "라벨 값" 으로. */
export function snapshotFieldText(snapshot: unknown, field: string): string {
  const v = fieldOf(snapshot, field);
  if (v == null) return "";
  const labels = ENUM_FIELD_LABELS[field];
  const raw =
    labels && typeof v === "string" && labels[v]
      ? labels[v]
      : typeof v === "string"
        ? v
        : typeof v === "boolean"
          ? v
            ? "예"
            : "아니오"
          : JSON.stringify(v, null, 1);
  if (TEXT_FIELDS.has(field)) return cut(raw);
  const label = FIELD_LABEL[field];
  return cut(label ? `${label} ${raw}` : raw);
}

/**
 * 사람이 읽을 값이 따로 있는 원시 필드 — 짝이 함께 바뀌면 원시 쪽은 숨긴다.
 * ★UUID 를 정오표에 그대로 실으면 수험생에게는 뜻 없는 문자열이다
 *   ("c61b0ec5-… → 관련 조문 138" 로 찍혔다, 원장 지적 2026-08-27).
 */
const RAW_FIELD_COMPANIONS: ReadonlyArray<readonly [string, string]> = [
  ["body_json", "body_text"],
  ["related_article_id", "related_article_number"],
  ["related_case_id", "related_case_number"],
  ["main_case_id", "main_case_number"],
];

// 사람이 읽는 diff 필드 선정 — 사람이 읽는 짝이 함께 바뀌면 원시 필드는 숨긴다.
export function diffFields(changed: string[]): string[] {
  const set = new Set(changed);
  for (const [raw, human] of RAW_FIELD_COMPANIONS) {
    if (set.has(raw) && set.has(human)) set.delete(raw);
  }
  set.delete("search_tsv");
  return [...set].sort();
}

export interface RevisionSnapshots {
  before_snapshot: unknown;
  after_snapshot: unknown;
  changed_fields: string[] | null;
}

/**
 * ★정답 여부(is_correct)는 원시 boolean 을 실으면 정오표에 "false → true" 로 찍힌다
 *   (원장 지적 2026-08-21). 정답 변경은 **지문 문장 맨 앞에 O / X** 로 표시한다.
 *   문장은 스냅샷의 지문 본문(body_md)을 쓰므로, 본문까지 함께 고쳐진 경우에도
 *   같은 줄에 담겨 중복 출력되지 않는다.
 */
function answerLine(snapshot: unknown): string | null {
  const correct = fieldOf(snapshot, "is_correct");
  if (typeof correct !== "boolean") return null;
  const body = fieldOf(snapshot, "body_md");
  const mark = correct ? "O" : "X";
  return typeof body === "string" && body.trim()
    ? `${mark} ${body.trim()}`
    : mark;
}

/**
 * ★어느 부분이 바뀐 건지 밝힌다 — **문제집과 해설집이 따로 있기 때문**에, 수험생은
 *   어느 책을 고쳐야 하는지 알아야 한다(원장 지적 2026-08-27). 그래서 구간 표기는
 *   **한 군데만 바뀐 경우에도 붙인다** — 예전에는 지문·발문 단독 변경이면 생략했는데,
 *   그 항목만 어느 책 얘기인지 알 수 없었다.
 */
export function sectionLabel(field: string, snapshot: unknown): string | null {
  if (field === "explanation_md") return "해설";
  if (field === "model_answer_md") return "모범답안";
  if (field === "grading_rubric_md") return "채점기준";
  if (field !== "body_md") return null;
  if (fieldOf(snapshot, "choice_id") != null) return "지문";
  if (fieldOf(snapshot, "box_item_id") != null) return "보기";
  return "발문";
}

/**
 * ★한쪽이 비면 그 사실을 글자로 밝힌다 — 빈칸은 "지워졌다"는 뜻인지 "안 실렸다"는 뜻인지
 *   수험생이 알 수 없다(원장 지적 2026-08-27). 지워졌으면 「삭제」, 새로 생겼으면 「없음」.
 */
const DELETED_MARK = "삭제";
const ABSENT_MARK = "없음";

/** 원장 스냅샷에서 변경 전/후 문구를 만든다. */
export function revisionDiffText(rev: RevisionSnapshots): {
  beforeText: string;
  afterText: string;
} {
  const changed = rev.changed_fields ?? [];
  const answerChanged = changed.includes("is_correct");
  const fields = diffFields(changed).filter(
    // 정답 표시는 아래에서 지문 문장과 함께 싣는다 — 원시 boolean 은 싣지 않는다.
    (f) => f !== "is_correct" && !(answerChanged && f === "body_md"),
  );

  const before: string[] = [];
  const after: string[] = [];
  // 구간 라벨은 행의 **모양**(어떤 키를 가진 행인지)에서 읽는다. 행이 통째로 지워지면
  // after 가 null 이라 모양을 알 수 없으므로 before 로 판정한다.
  const shape = rev.after_snapshot ?? rev.before_snapshot;

  if (answerChanged) {
    const tag = sectionLabel("body_md", shape);
    const mark = (line: string) => (tag ? `[${tag}] ${line}` : line);
    const b = answerLine(rev.before_snapshot);
    const a = answerLine(rev.after_snapshot);
    if (b) before.push(mark(b));
    if (a) after.push(mark(a));
  }

  for (const field of fields) {
    const b = snapshotFieldText(rev.before_snapshot, field);
    const a = snapshotFieldText(rev.after_snapshot, field);
    const diff = diffLines(b.split("\n"), a.split("\n"));
    // ★공백만 다른 줄은 버린다 — 본문 끝 빈 줄 하나가 바뀌어도 "변경"으로 잡혀
    //   내용 없는 정오표 항목(변경 전 — / 변경 후 —)이 발행됐다(P-5839, 2026-08-21).
    const text = (l: { text: string }) => l.text;
    const bLines = diff
      .filter((l) => l.kind === "removed")
      .map(text)
      .filter((t) => t.trim());
    const aLines = diff
      .filter((l) => l.kind === "added")
      .map(text)
      .filter((t) => t.trim());
    // 있던 것이 사라졌으면 「삭제」, 없던 것이 생겼으면 「없음」 — 빈칸으로 두지 않는다.
    if (b.trim() && !a.trim()) aLines.push(DELETED_MARK);
    if (!b.trim() && a.trim()) bLines.push(ABSENT_MARK);
    const tag = sectionLabel(field, shape);
    if (tag) {
      if (bLines[0]) bLines[0] = `[${tag}] ${bLines[0]}`;
      if (aLines[0]) aLines[0] = `[${tag}] ${aLines[0]}`;
    }
    before.push(...bLines);
    after.push(...aLines);
  }
  return {
    beforeText: cut(before.join("\n")),
    afterText: cut(after.join("\n")),
  };
}

/**
 * 필드별 diff 를 변경 전/후 문구로 잇는다 — **구간 라벨이 없는 축**(도해)용.
 * 도해의 필드는 blocks jsonb 안의 텍스트 경로라 [지문]·[해설] 같은 구간 개념이 없다.
 * 공백만 다른 줄은 버린다 — 끝의 빈 줄 하나 때문에 내용 없는 항목이 발행됐다(P-5839).
 */
export function joinFieldDiffs(
  fieldDiffs: ReadonlyArray<{ beforeText: string; afterText: string }>,
): { beforeText: string; afterText: string } {
  const before: string[] = [];
  const after: string[] = [];
  for (const fd of fieldDiffs) {
    const diff = diffLines(fd.beforeText.split("\n"), fd.afterText.split("\n"));
    const pick = (kind: "removed" | "added") =>
      diff
        .filter((l) => l.kind === kind)
        .map((l) => l.text)
        .filter((t) => t.trim());
    before.push(...pick("removed"));
    after.push(...pick("added"));
  }
  return { beforeText: cut(before.join("\n")), afterText: cut(after.join("\n")) };
}
