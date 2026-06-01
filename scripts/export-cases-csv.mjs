// 판례 리스트 → CSV.
//   컬럼 : 법원, 선고일, 사건번호, 사건유형, 사건명
//   필터 : deleted_at IS NULL
//   정렬 : 선고일 desc, 사건번호 asc
//   출력 : cases-export.csv (repo root)
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// court enum → 한글
const COURT_KR = {
  supreme:        "대법원",
  patent_court:   "특허법원",
  high_court:     "고등법원",
  district_court: "지방법원",
};

// page 단위 1000 row 제한 → 페이지네이션
const PAGE = 1000;
let all = [];
let from = 0;
while (true) {
  const { data, error } = await supa
    .from("cases")
    .select("court, decided_at, case_number, case_type, case_title")
    .is("deleted_at", null)
    .order("decided_at", { ascending: false })
    .order("case_number", { ascending: true })
    .range(from, from + PAGE - 1);
  if (error) {
    console.error("query failed:", error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  all = all.concat(data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`fetched ${all.length} cases`);

// CSV escape — 콤마/큰따옴표/개행 안전
const esc = (v) => {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
};

const header = "법원,선고일,사건번호,사건유형,사건명";
const lines = all.map((r) =>
  [
    esc(COURT_KR[r.court] ?? r.court ?? ""),
    esc(r.decided_at ?? ""),
    esc(r.case_number ?? ""),
    esc(r.case_type ?? ""),
    esc(r.case_title ?? ""),
  ].join(",")
);

const OUT = join(process.cwd(), "cases-export.csv");
// Excel 한글 호환 위해 UTF-8 BOM 포함
writeFileSync(OUT, "﻿" + header + "\n" + lines.join("\n") + "\n", "utf8");
console.log(`written: ${OUT}`);

// 분포 보고
const byCourt = {};
const byType = {};
for (const r of all) {
  byCourt[COURT_KR[r.court] ?? r.court] = (byCourt[COURT_KR[r.court] ?? r.court] ?? 0) + 1;
  byType[r.case_type ?? "(없음)"] = (byType[r.case_type ?? "(없음)"] ?? 0) + 1;
}
console.log("\nby court:", JSON.stringify(byCourt));
console.log("by case_type top 10:");
const topTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [k, v] of topTypes) console.log(`  ${k}: ${v}`);
