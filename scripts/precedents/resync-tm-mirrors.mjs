// 상표 판례 미러·순번 재동기화 — 재파싱으로 교재 구조가 바뀐 뒤 실행.
//   ① 검색·목록 미러(summary_items/summary_title/reasoning_md/comment_body_md)를
//      tm-precedents.json 기준으로 재계산해 덮어씀 (병기 판례 분리로 오염된 호스트 정화)
//   ② source_seq 를 교재 순서(주제 순 → 주제 내 순, 최초 수록 기준)로 전체 재부여
//   식별 필드(사건번호·법원·선고일)와 배치(primary_node_id)는 건드리지 않는다.
//
//   node scripts/precedents/resync-tm-mirrors.mjs --apply
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const data = JSON.parse(readFileSync("source/_converted/tm-precedents.json", "utf8"));

// ★밑줄 마커도 벗긴다 — 미러(목록 제목·검색 tsv·요지)는 글자만 담는다.
//   렌더용 밑줄은 book_sections 안에만 있다(규칙 1).
const stripMarkers = (s) =>
  s.replace(/⟦IMG:[^⟧]*⟧/g, "").replace(/⟦TBL⟧/g, "").replace(/<\/?u>/g, "");
const stripNum = (s) => stripMarkers(s).replace(/^\[\d+\]\s*/, "").replace(/^\(\d+\)\s*/, "").trim();
const mdEscapeCell = (s) => stripMarkers(s).replace(/\|/g, "\\|").replace(/\n/g, "<br>");
function tableMd(rows) {
  const width = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => [...r, ...Array(width - r.length).fill("")]);
  return [
    `| ${norm[0].map(mdEscapeCell).join(" | ")} |`,
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...norm.slice(1).map((r) => `| ${r.map(mdEscapeCell).join(" | ")} |`),
  ].join("\n");
}
function buildReasoningMd(c) {
  const parts = [];
  const sec = c.sections;
  const tbl = (key) => c.infoTables.filter((t) => t.section === key).map((t) => tableMd(t.rows));
  for (const t of tbl("preamble")) parts.push(t);
  if (sec.preamble?.length) parts.push(stripMarkers(sec.preamble.join("\n\n")));
  for (const [key, label] of [
    ["facts", "사실관계"],
    ["lower", c.court === "대법원" ? "원심의 판단" : "원심(하급심)의 판단"],
    ["doctrine", "관련 법리"],
    ["holding", c.court === "대법원" ? "대법원의 판단" : "법원의 판단"],
  ]) {
    const body = [];
    if (sec[key]?.length) body.push(stripMarkers(sec[key].join("\n\n")));
    body.push(...tbl(key));
    if (body.length) parts.push(`### ${label}\n\n${body.join("\n\n")}`);
  }
  return parts.length ? stripMarkers(parts.join("\n\n")) : null;
}
function buildCommentMd(c) {
  const parts = [];
  if (c.sections.comment?.length) parts.push(stripMarkers(c.sections.comment.join("\n\n")));
  if (c.sections.index?.length) parts.push(`**[Index]** ${stripMarkers(c.sections.index.join(" / "))}`);
  return parts.length ? parts.join("\n\n") : null;
}

// 교재 순서(최초 수록) + seq
const order = [];
const seen = new Set();
let seq = 0;
for (const t of data.topics) {
  for (const c of t.cases) {
    seq++;
    if (seen.has(c.caseNumber)) continue;
    seen.add(c.caseNumber);
    order.push({ seq, c });
  }
}
console.log("교재 고유:", order.length);

const { data: rows, error } = await sb
  .from("cases")
  .select("case_id, case_number, source_seq")
  .contains("subject_laws", ["trademark"])
  .is("deleted_at", null);
if (error) throw error;
const byNum = new Map(rows.map((r) => [r.case_number, r]));

let updated = 0, missing = 0;
for (const { seq: s, c } of order) {
  const row = byNum.get(c.caseNumber);
  if (!row) {
    missing++;
    console.log("? DB 미존재:", c.caseNumber);
    continue;
  }
  const issues = (c.sections.issues ?? [])
    .flatMap((t) => t.split(/\n+/))
    .map(stripNum)
    .filter(Boolean);
  const summaryItems = issues.map((t) => ({ title: t.slice(0, 500), body: "" }));
  const commentMd = buildCommentMd(c);
  const patch = {
    source_seq: s,
    // ★별칭도 교재를 따른다 — 제16판은 별칭을 헤더 괄호에서 별도 줄로 옮기면서
    //   몇 건의 오배정(2018다221676 "독점적 통상실시권"→"올란자핀")을 바로잡았다.
    nickname: c.nickname ?? null,
    summary_items: summaryItems,
    summary_title: summaryItems[0]?.title ?? null,
    summary_body_md: null,
    case_title: summaryItems[0]?.title ?? c.caseName ?? c.caseNumber,
    reasoning_md: buildReasoningMd(c),
    comment_body_md: commentMd,
    comment_source: commentMd ? "리담상표법 판례 [제16판]" : null,
  };
  if (APPLY) {
    const { error: uErr } = await sb.from("cases").update(patch).eq("case_id", row.case_id);
    if (uErr) console.log("!", c.caseNumber, uErr.message);
    else updated++;
  }
}
console.log(`${APPLY ? "적용" : "dry-run"}: 갱신 ${updated} / DB 미존재 ${missing}`);
