// problems.explanation_md 안의 markdown 파이프 표를 HTML <table> + rowspan/colspan 으로 변환.
//
// 변환 규칙:
//  - 첫 행 → <thead><tr><th>...</th></tr></thead>
//  - 두 번째 행이 구분선(--- 만) 이면 skip; 아니면 sub-header 후보.
//  - 빈 셀(공백만) 분기:
//      1. 같은 행에서 왼쪽으로 walk 해 첫 non-empty 셀 → 그 셀의 colspan 후보.
//      2. 같은 열에서 위로 walk 해 첫 non-empty 셀 → 그 셀의 rowspan 후보.
//      3. 둘 다 가능하면 "해당 column 이 후속 데이터 행에서도 빈 column 인지" 로 판단:
//         - 후속 행에 content 있으면 (= data column) → ROWSPAN.
//         - 후속 행도 모두 비어 있으면 (= 헤더 colspan) → COLSPAN.
//  - 셀 안 raw text 는 HTML escape (& < > → &amp;/&lt;/&gt;).
//
// 사용법:
//   node scripts/convert-md-tables-to-html.mjs           # dry-run (변환된 HTML 만 출력)
//   node scripts/convert-md-tables-to-html.mjs --apply   # DB 업데이트
//   node scripts/convert-md-tables-to-html.mjs --pid <problem_id>   # 단일 문제만

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정 (SUPABASE_URL / SERVICE_ROLE_KEY)");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const PID_INDEX = ARGS.indexOf("--pid");
const ONLY_PID = PID_INDEX >= 0 ? ARGS[PID_INDEX + 1] : null;

// markdown 표는 한 줄의 `| col | col |` + 다음 줄의 `| --- | --- |` 구분선 + 데이터 행으로 구성.
// 표 블록 전체를 잡는 정규식. 표 시작은 "라인 시작에서 |" + 다음 줄 구분선.
const TABLE_BLOCK_RE = /(^|\n)((?:\|[^\n]*\|[ \t]*\n)(?:\|[ \-:|\t]+\|[ \t]*\n)(?:\|[^\n]*\|[ \t]*(?:\n|$))+)/g;

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^[\s\-:]*$/.test(c));
}

function splitRow(line) {
  // "| a | b | c |" → ["a", "b", "c"]. 양 끝 파이프 제거 후 split.
  const trimmed = line.replace(/^\s*\|/, "").replace(/\|\s*$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function parseTable(block) {
  const lines = block.trim().split("\n");
  const rows = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    rows.push(splitRow(line));
  }
  if (rows.length < 2) return null;
  if (!isSeparatorRow(rows[1])) return null;
  // 정규화 — 모든 행이 같은 열 수를 갖도록 padding (방어적).
  const ncols = Math.max(...rows.map((r) => r.length));
  for (const r of rows) {
    while (r.length < ncols) r.push("");
  }
  const header = rows[0];
  const body = rows.slice(2);
  return { header, body, ncols };
}

// 빈 셀에 owner 좌표를 할당. 그 결과로 colspan/rowspan 을 계산.
// rows: 2차원 string 배열 (header + body 통합 표현용 — 단순화 위해).
// 반환: { owner: [[r,c], ...][[]], skip: boolean[][] } — owner 가 (r,c) 자기 자신이면 렌더, 아니면 skip.
function computeOwners(rows) {
  const R = rows.length;
  const C = rows[0]?.length ?? 0;
  const owner = Array.from({ length: R }, () =>
    Array.from({ length: C }, () => null),
  );
  const isEmpty = (r, c) => rows[r][c].trim() === "";

  // column c 에서 (startR+1)..(R-1) 행에 non-empty 가 한 번이라도 있는가? — data column 판정.
  const columnHasFutureContent = (startR, c) => {
    for (let rr = startR + 1; rr < R; rr++) {
      if (!isEmpty(rr, c)) return true;
    }
    return false;
  };

  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isEmpty(r, c)) {
        owner[r][c] = [r, c];
        continue;
      }
      // 빈 셀.
      // left 후보 — 같은 행에서 왼쪽으로 walk 해 first non-empty.
      let leftCol = -1;
      for (let cc = c - 1; cc >= 0; cc--) {
        if (!isEmpty(r, cc)) {
          leftCol = cc;
          break;
        }
      }
      // above 후보 — 같은 열에서 위로 walk 해 first non-empty.
      let aboveRow = -1;
      for (let rr = r - 1; rr >= 0; rr--) {
        if (!isEmpty(rr, c)) {
          aboveRow = rr;
          break;
        }
      }
      let chosen;
      if (leftCol < 0 && aboveRow < 0) {
        chosen = [r, c]; // 둘 다 없음 — 그냥 빈 셀.
      } else if (leftCol < 0) {
        chosen = [aboveRow, c]; // ROWSPAN
      } else if (aboveRow < 0) {
        chosen = [r, leftCol]; // COLSPAN
      } else {
        // 둘 다 있음 — column c 가 data column 이면 ROWSPAN, 아니면 COLSPAN.
        const isDataCol = columnHasFutureContent(r, c);
        chosen = isDataCol ? [aboveRow, c] : [r, leftCol];
      }
      // chosen 의 owner 를 따라 root 까지 resolve (chain).
      let [or, oc] = chosen;
      while (owner[or][oc] && (owner[or][oc][0] !== or || owner[or][oc][1] !== oc)) {
        const [nr, nc] = owner[or][oc];
        if (nr === or && nc === oc) break;
        or = nr;
        oc = nc;
      }
      // chain 의 root 가 빈 셀인 케이스 방어.
      if (isEmpty(or, oc)) {
        owner[r][c] = [r, c];
      } else {
        owner[r][c] = [or, oc];
      }
    }
  }
  return owner;
}

function buildSpans(rows, owner) {
  const R = rows.length;
  const C = rows[0]?.length ?? 0;
  const rowspan = Array.from({ length: R }, () =>
    Array.from({ length: C }, () => 1),
  );
  const colspan = Array.from({ length: R }, () =>
    Array.from({ length: C }, () => 1),
  );
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const [or, oc] = owner[r][c];
      if (or === r && oc === c) continue;
      if (or === r) {
        // 같은 행 — colspan 확장.
        colspan[or][oc] += 1;
      } else if (oc === c) {
        rowspan[or][oc] += 1;
      } else {
        // 대각선 — 드물지만 owner 가 (or, oc) 인데 r,c 가 그 셀의 직사각형 영역의 일부.
        // 단순화: 더 가까운 축으로 카운트.
        const dr = r - or;
        const dc = c - oc;
        if (dr >= dc) rowspan[or][oc] += 1;
        else colspan[or][oc] += 1;
      }
    }
  }
  return { rowspan, colspan };
}

function renderHtml(headerCells, bodyRows) {
  // 통합 행 배열 만들어 owner 계산 — header 도 포함해야 sub-header (row 1) 와 헤더 column 의
  // rowspan 을 정상 추론할 수 있음.
  const allRows = [headerCells, ...bodyRows];
  // sub-header detection — body 의 첫 행이 대부분 비어 있으면 (>= 절반) 헤더로 흡수.
  let headerRowCount = 1;
  if (bodyRows.length > 0) {
    const r1 = bodyRows[0];
    const emptyCount = r1.filter((v) => v.trim() === "").length;
    if (emptyCount >= Math.ceil(r1.length / 2)) {
      headerRowCount = 2;
    }
  }
  const owner = computeOwners(allRows);
  const { rowspan, colspan } = buildSpans(allRows, owner);

  const renderRow = (r, tag) => {
    const tds = [];
    for (let c = 0; c < allRows[r].length; c++) {
      const [or, oc] = owner[r][c];
      if (or !== r || oc !== c) continue; // skip — owned by another cell.
      const text = escapeHtml(allRows[r][c]);
      const rs = rowspan[r][c];
      const cs = colspan[r][c];
      const attrs = [];
      if (rs > 1) attrs.push(`rowspan="${rs}"`);
      if (cs > 1) attrs.push(`colspan="${cs}"`);
      const open = attrs.length ? `<${tag} ${attrs.join(" ")}>` : `<${tag}>`;
      tds.push(`${open}${text}</${tag}>`);
    }
    return `<tr>${tds.join("")}</tr>`;
  };

  const headRows = [];
  for (let r = 0; r < headerRowCount; r++) {
    headRows.push(renderRow(r, "th"));
  }
  const bodyHtml = [];
  for (let r = headerRowCount; r < allRows.length; r++) {
    bodyHtml.push(renderRow(r, "td"));
  }
  return `<table>\n<thead>\n${headRows.join("\n")}\n</thead>\n<tbody>\n${bodyHtml.join("\n")}\n</tbody>\n</table>`;
}

// 선지 해설(problem_choices)에도 같은 변환이 필요해 export — 아래 CLI 본문은
// 직접 실행할 때만 돈다(import 시에는 DB 조회가 일어나지 않도록).
export function convertMarkdownTablesInText(text) {
  let count = 0;
  const replaced = text.replace(TABLE_BLOCK_RE, (match, pre, block) => {
    const parsed = parseTable(block);
    if (!parsed) return match;
    const html = renderHtml(parsed.header, parsed.body);
    count += 1;
    return `${pre}${html}\n`;
  });
  return { text: replaced, count };
}

// --choices: 문제 단위 해설(problems.explanation_md) 대신 **선지별 해설**
//   (problem_choices.explanation_md)을 대상으로 한다. 교재 표는 대부분 선지 해설에 붙어 있고,
//   병합 셀이 파이프 표로 변환되며 빈 칸으로 뭉개져 있었다(2026-08-16 신고).
const CHOICES = ARGS.includes("--choices");

let candidates;
if (CHOICES) {
  const q = supa
    .from("problem_choices")
    .select("choice_id, problem_id, choice_index, explanation_md");
  const { data, error: err } = ONLY_PID
    ? await q.eq("problem_id", ONLY_PID)
    : await q.like("explanation_md", "%|%---%|%");
  if (err) {
    console.error(err);
    process.exit(1);
  }
  candidates = (data ?? [])
    .filter((c) => (c.explanation_md ?? "").includes("|"))
    .map((c) => ({
      key: c.choice_id,
      pid: c.problem_id,
      label: `pid=${c.problem_id} 선지${c.choice_index}`,
      text: c.explanation_md ?? "",
    }));
} else {
  const query = supa
    .from("problems")
    .select("problem_id, body_md, explanation_md")
    .is("deleted_at", null);
  const { data: problems, error } = ONLY_PID
    ? await query.eq("problem_id", ONLY_PID)
    : await query.like("explanation_md", "%|%---%|%");
  if (error) {
    console.error(error);
    process.exit(1);
  }
  candidates = (problems ?? [])
    .filter((p) => (p.explanation_md ?? "").includes("|"))
    .map((p) => ({
      key: p.problem_id,
      pid: p.problem_id,
      label: `pid=${p.problem_id}  body=${(p.body_md ?? "").slice(0, 60)}…`,
      text: p.explanation_md ?? "",
    }));
}

candidates = candidates.filter((c) =>
  /\|[^\n]*\|\n\|[\s\-:|]+\|/.test(c.text),
);

console.log(`후보 ${candidates.length} 건${CHOICES ? " (선지 해설)" : ""}`);

let updated = 0;
let totalTables = 0;
for (const c of candidates) {
  const before = c.text;
  const { text: after, count } = convertMarkdownTablesInText(before);
  if (count === 0 || after === before) continue;
  totalTables += count;
  console.log("---");
  console.log(`${c.label}  표 ${count} 개`);
  if (!APPLY) {
    console.log(after.slice(0, 800) + (after.length > 800 ? "…(truncated)" : ""));
  } else {
    const { error: upErr } = CHOICES
      ? await supa
          .from("problem_choices")
          .update({ explanation_md: after })
          .eq("choice_id", c.key)
      : await supa
          .from("problems")
          .update({ explanation_md: after })
          .eq("problem_id", c.key);
    if (upErr) {
      console.error(`  ✗ ${c.key}: ${upErr.message}`);
    } else {
      updated += 1;
    }
  }
}

console.log("---");
console.log(`표 ${totalTables} 개 / 문제 ${candidates.length} 건`);
if (APPLY) console.log(`업데이트 완료: ${updated} 건`);
else console.log("dry-run — 적용하려면 --apply 추가");
