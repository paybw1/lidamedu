// 리담 상표법 판례(제16판) 찾기·읽기 — DB cases(subject_laws ⊃ trademark) 읽기 전용 (feat-2-039).
// 사건번호 인용 전 반드시 여기서 실존·법원·쟁점(제목)을 눈으로 대조할 것(CLAUDE.md Non-negotiable 12).
// ★특허·상표 겹침 판례는 법률별 별도 행 — 이 도구는 trademark 행만 본다.
//
//   node scripts/jagwa/tm-case-find.mjs --find 사용에 의한 식별력      # 제목·본문에 키워드(쉼표=AND)
//   node scripts/jagwa/tm-case-find.mjs --case 2011후3698             # 교재 구조 전문 출력
//   node scripts/jagwa/tm-case-find.mjs --case 2011후3698 --section 본심   # 특정 섹션만(라벨 부분일치)
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);
const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : null;
};
const COLS =
  "case_id, case_number, court, decided_at, summary_title, book_sections, subject_laws";

function sectionText(sec) {
  const lines = [];
  for (const b of sec.blocks ?? []) {
    if (b.type === "p") lines.push(b.text);
    else if (b.type === "table") {
      for (const row of b.rows ?? [])
        lines.push(
          row.map((c) => (c.text ?? "").replace(/\n/g, " ")).join(" | "),
        );
    }
  }
  return lines.join("\n");
}
const stripU = (s) => s.replace(/<\/?u>/g, "");

async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supa
      .from("cases")
      .select(COLS)
      .contains("subject_laws", ["trademark"])
      .is("deleted_at", null)
      .order("decided_at")
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 500) break;
  }
  return out;
}

const find = opt("--find");
if (find) {
  const kws = find
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const rows = await fetchAll();
  for (const r of rows) {
    const secs = r.book_sections?.sections ?? [];
    const full = stripU(
      [r.case_number, r.summary_title ?? "", ...secs.map(sectionText)].join(
        "\n",
      ),
    );
    if (!kws.every((k) => full.includes(k))) continue;
    const i = full.indexOf(kws[0]);
    const snip = full.slice(Math.max(0, i - 50), i + 90).replace(/\s+/g, " ");
    console.log(
      `${r.case_number} | ${r.court} | ${r.decided_at} | ${r.summary_title ?? ""}\n    …${snip}…`,
    );
  }
  process.exit(0);
}

const cn = opt("--case");
if (cn) {
  const { data, error } = await supa
    .from("cases")
    .select(COLS)
    .contains("subject_laws", ["trademark"])
    .is("deleted_at", null)
    .eq("case_number", cn);
  if (error) throw new Error(error.message);
  if (!data.length) {
    console.log(
      `(없음) ${cn} — trademark 행에 없음. 특허 행일 수 있으니 법률 확인.`,
    );
    process.exit(0);
  }
  const only = opt("--section");
  for (const r of data) {
    console.log(
      `##### ${r.case_number} | ${r.court} | ${r.decided_at} | ${r.summary_title ?? ""} | laws=${r.subject_laws}`,
    );
    for (const sec of r.book_sections?.sections ?? []) {
      if (only && !(sec.label ?? "").includes(only)) continue;
      console.log(
        `\n== [${sec.label}]${sec.title ? " " + sec.title : ""}${sec.source ? " (출처: " + sec.source + ")" : ""}\n${stripU(sectionText(sec))}`,
      );
    }
  }
  process.exit(0);
}
console.error("사용: --find <kw[,kw]> | --case <사건번호> [--section <라벨>]");
process.exit(1);
