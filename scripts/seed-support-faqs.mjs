// 고객센터 FAQ 시드 — source/동영상사이트FAQ.xls(→CSV) 를 support_faqs 로 적재.
//   HTML 엔티티·태그 정리, 카테고리 정규화, 노출여부→published. 멱등(행 있으면 skip).
//   전제: LibreOffice 로 CSV 변환 후 경로 지정. node scripts/seed-support-faqs.mjs [csvPath]
import { readFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const CSV =
  process.argv[2] ??
  "C:/Users/paybw/AppData/Local/Temp/claude/C--project-lidamedu/7a39b930-ef42-4ceb-a3db-cbeb084a64b0/scratchpad/동영상사이트FAQ.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function clean(s) {
  return (s ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&middot;/g, "·")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cat(raw) {
  const t = (raw ?? "").replace(/[[\]]/g, "").trim();
  if (t.includes("동영상")) return "동영상·기기";
  if (t.includes("결제")) return "결제·취소·환불";
  if (t.includes("수강")) return "수강·교재";
  if (t.includes("회원")) return "회원정보";
  return t || "기타";
}

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { count } = await db
  .from("support_faqs")
  .select("*", { count: "exact", head: true })
  .is("deleted_at", null);
if ((count ?? 0) > 0) {
  console.log(`이미 ${count}건 존재 — 시드 건너뜀.`);
  process.exit(0);
}

const rows = parseCsv(readFileSync(CSV, "utf8"));
// 헤더 행(No,카테고리,...) 위치 찾기.
const headIdx = rows.findIndex((r) => r[0] === "No" && r[1] === "카테고리");
const dataRows = rows.slice(headIdx + 1).filter((r) => r[0] && r[4]);

const toInsert = dataRows.map((r) => ({
  category: cat(r[1]),
  question: clean(r[4]).slice(0, 300),
  answer: clean(r[5]),
  sort_order: Number.parseInt(r[8], 10) || 0,
  published: (r[9] ?? "").trim() === "노출",
}));

console.log(`파싱 ${toInsert.length}건 (노출 ${toInsert.filter((x) => x.published).length})`);
const { error } = await db.from("support_faqs").insert(toInsert);
if (error) {
  console.error("insert 실패:", error.message);
  process.exit(1);
}
console.log("done.");
