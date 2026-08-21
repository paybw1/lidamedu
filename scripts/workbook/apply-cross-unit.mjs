// 워크북 기울임체(타 단원 지문) → problem_choices.cross_unit / problem_box_items.cross_unit.
//
// extract-cross-unit.mjs 가 뽑은 JSON 을 운영 DB 문항에 맞춘다.
//
// ★매칭은 문제 단위로 앵커를 잡는다. 지문 텍스트만으로 전역 매칭하면 "③심판을 청구할 수
//   있는 기간" 같은 짧은 문구가 여러 문제에 걸쳐 충돌하고, 의약발명 지문처럼 연도만 다른
//   준-중복도 많다. 그래서 ① 워크북 문제의 지문들을 DB 지문 색인에 던져 가장 많이 겹치는
//   DB 문항을 고르고 ② 그 문항 안에서만 지문을 정확 일치로 대응시킨다.
//
//   node scripts/workbook/apply-cross-unit.mjs tmp/cu-kicheul.json tmp/cu-yesang.json
//   node scripts/workbook/apply-cross-unit.mjs tmp/*.json --apply
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const inputs = argv.filter((a) => !a.startsWith("--"));
if (inputs.length === 0) {
  console.error(
    "사용: node scripts/workbook/apply-cross-unit.mjs <extract.json…> [--apply]",
  );
  process.exit(1);
}

const PROD_REF = "mcgdoplovrjgklbxmozi";
if (!process.env.SUPABASE_URL?.includes(PROD_REF))
  throw new Error("운영 DB 가 아니다 — 중단");
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

/** 대조용 정규화 — 마커·공백·문장부호 차이를 흡수한다. 판별력은 남기려고 글자는 지우지 않는다. */
function norm(s) {
  return String(s ?? "")
    .replace(/^[\s①-⑩㈀-㈞㉠-㉾ㄱ-ㅎ.·]+/, "")
    .replace(/\[IMG:[^\]]+\]/g, "")
    .replace(/[\s·･·,()（）'"“”‘’]/g, "")
    .replace(/[．.]/g, "")
    .toLowerCase();
}

async function pageAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const { data: law } = await sb
  .from("laws")
  .select("law_id")
  .eq("law_code", "patent")
  .maybeSingle();
if (!law) throw new Error("patent 법령 없음");

const problems = await pageAll(() =>
  sb
    .from("problems")
    .select("problem_id, display_no, year, origin, scope, body_md")
    .eq("law_id", law.law_id)
    .eq("exam_round", "first")
    .is("deleted_at", null)
    .order("problem_id"),
);
const problemIds = problems.map((p) => p.problem_id);
console.log(`DB 특허 1차 문항 ${problems.length}`);

async function fetchByProblem(table, cols) {
  const rows = [];
  for (let i = 0; i < problemIds.length; i += 150) {
    const slice = problemIds.slice(i, i + 150);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from(table)
        .select(cols)
        .in("problem_id", slice)
        .order("problem_id")
        .range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < 1000) break;
    }
  }
  return rows;
}

const choices = await fetchByProblem(
  "problem_choices",
  "choice_id, problem_id, choice_index, body_md, cross_unit",
);
const boxItems = await fetchByProblem(
  "problem_box_items",
  "box_item_id, problem_id, position_index, marker, body_md, cross_unit",
);
console.log(`DB 선지 ${choices.length} · 보기 ${boxItems.length}`);

// 문항별 지문 색인 + 전역 역색인(정규화 텍스트 → 문항 후보).
const itemsByProblem = new Map();
const problemsByText = new Map();
const push = (row, kind) => {
  const key = norm(row.body_md);
  if (!key) return;
  const rec = {
    kind,
    id: kind === "choice" ? row.choice_id : row.box_item_id,
    problemId: row.problem_id,
    key,
    crossUnit: row.cross_unit,
    marker: kind === "choice" ? String(row.choice_index) : row.marker,
    // 번호 대응(fallback)용 순서 — 조회 순서에 기대지 않는다.
    ord: kind === "choice" ? row.choice_index : row.position_index,
  };
  const list = itemsByProblem.get(row.problem_id) ?? [];
  list.push(rec);
  itemsByProblem.set(row.problem_id, list);
  const cands = problemsByText.get(key) ?? new Set();
  cands.add(row.problem_id);
  problemsByText.set(key, cands);
};
choices.forEach((c) => push(c, "choice"));
boxItems.forEach((b) => push(b, "box"));

const targets = { choice: new Set(), box: new Set() };
const unmatchedProblems = [];
const unmatchedItems = [];
let wbProblemCount = 0;
let wbItalicCount = 0;

const CHOICE_MARKS = "①②③④⑤⑥⑦⑧⑨⑩";

/**
 * 워크북 문제를 "선지 번호가 단조 증가하는 덩어리"로 쪼갠다.
 * ★원문에서 다음 문제의 머리가 앞 문제 마지막 선지에 붙어버리는 조판이 몇 건 있어,
 *   한 wb 문제 안에 두 문항의 선지가 섞이는 경우가 있다. 그대로 앵커를 잡으면 뒤 문항이
 *   이겨서 앞 문항의 기울임 지문이 엉뚱한 곳에 찍힌다.
 */
function splitGroups(wb) {
  const groups = [];
  let cur = null;
  let lastOrd = 0;
  for (const it of wb.items) {
    const ord = it.inTable ? 0 : CHOICE_MARKS.indexOf(it.marker) + 1;
    if (!cur || (ord > 0 && ord <= lastOrd)) {
      cur = [];
      groups.push(cur);
      lastOrd = 0;
    }
    if (ord > 0) lastOrd = ord;
    cur.push(it);
  }
  return groups;
}

for (const file of inputs) {
  const { problems: wbProblems, source } = JSON.parse(
    fs.readFileSync(file, "utf8"),
  );
  console.log(`\n■ ${path.basename(file)} — ${source}`);
  let matched = 0;
  let hitItems = 0;
  let byIndex = 0;
  for (const wb of wbProblems) {
    for (const group of splitGroups(wb)) {
      const italic = group.filter((i) => i.italic);
      if (italic.length === 0) continue;
      wbProblemCount += 1;
      wbItalicCount += italic.length;

      // ① 문항 앵커 — 이 덩어리의 지문들과 가장 많이 겹치는 DB 문항.
      const score = new Map();
      for (const it of group) {
        for (const pid of problemsByText.get(norm(it.text)) ?? []) {
          score.set(pid, (score.get(pid) ?? 0) + 1);
        }
      }
      const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
      const best = ranked[0];
      // 겹침이 1개뿐이거나 1등이 2등과 동점이면 애매하다 — 손대지 않는다.
      if (!best || best[1] < 2 || (ranked[1] && ranked[1][1] === best[1])) {
        unmatchedProblems.push({
          file: path.basename(file),
          wb,
          ranked: ranked.slice(0, 3),
        });
        continue;
      }
      matched += 1;
      const dbItems = [...(itemsByProblem.get(best[0]) ?? [])].sort(
        (a, b) => a.ord - b.ord,
      );
      // 번호 대응(fallback)이 안전한가 — 덩어리와 DB 의 지문 개수가 같을 때만.
      const sameCount = (kind, inTable) =>
        group.filter((i) => i.inTable === inTable).length ===
        dbItems.filter((d) => d.kind === kind).length;
      const posOk = {
        choice: sameCount("choice", false),
        box: sameCount("box", true),
      };

      // ② 문항 안에서 정확 일치로 지문 대응.
      for (const it of italic) {
        const key = norm(it.text);
        const hits = dbItems.filter((d) => d.key === key);
        if (hits.length === 1) {
          targets[hits[0].kind].add(hits[0].id);
          hitItems += 1;
          continue;
        }
        // 원문이 한 지문을 여러 문단으로 쪼갠 경우 DB 쪽이 더 길 수 있다 — 접두 일치로 한 번 더.
        const pref =
          key.length >= 20
            ? dbItems.filter((d) => d.key.startsWith(key.slice(0, 40)))
            : [];
        if (pref.length === 1) {
          targets[pref[0].kind].add(pref[0].id);
          hitItems += 1;
          continue;
        }
        // ★교재 개정으로 문구가 달라진 지문이 있다. 문항이 확정됐고 지문 개수까지 같으면
        //   번호로 대응해도 안전하다 — 그 밖에는 손대지 않고 보고한다.
        const kind = it.inTable ? "box" : "choice";
        const idx = it.inTable
          ? group.filter((i) => i.inTable).indexOf(it)
          : CHOICE_MARKS.indexOf(it.marker);
        const sameKind = dbItems.filter((d) => d.kind === kind);
        if (posOk[kind] && idx >= 0 && sameKind[idx]) {
          targets[kind].add(sameKind[idx].id);
          hitItems += 1;
          byIndex += 1;
          continue;
        }
        unmatchedItems.push({
          file: path.basename(file),
          stem: wb.stem.slice(0, 40),
          marker: it.marker,
          text: it.text.slice(0, 70),
          hits: hits.length,
        });
      }
    }
  }
  console.log(
    `  기울임 보유 덩어리 매칭 ${matched} · 지문 매칭 ${hitItems} (번호 대응 ${byIndex})`,
  );
}

console.log(
  `\n합계 — 워크북 기울임 문제 ${wbProblemCount} · 기울임 지문 ${wbItalicCount}` +
    ` → 매칭 선지 ${targets.choice.size} · 보기 ${targets.box.size}` +
    ` (미매칭 문제 ${unmatchedProblems.length} · 미매칭 지문 ${unmatchedItems.length})`,
);

if (unmatchedProblems.length) {
  console.log("\n[미매칭 문제]");
  for (const u of unmatchedProblems.slice(0, 30))
    console.log(
      `  ${u.file} ${u.wb.headerNo} ’${u.wb.year ?? "-"} ${u.wb.stem.slice(0, 55)} — 후보 ${JSON.stringify(u.ranked)}`,
    );
  if (unmatchedProblems.length > 30)
    console.log(`  … 외 ${unmatchedProblems.length - 30}건`);
}
if (unmatchedItems.length) {
  console.log("\n[미매칭 지문]");
  for (const u of unmatchedItems.slice(0, 30))
    console.log(`  ${u.file} [${u.stem}] ${u.marker} 후보${u.hits} ${u.text}`);
  if (unmatchedItems.length > 30)
    console.log(`  … 외 ${unmatchedItems.length - 30}건`);
}

// 검증 게이트 — 타 단원 지문은 종합문제에만 있어야 한다. 단원문제에 몰려 나오면
// 앵커가 엉뚱한 문항을 골랐다는 신호다.
{
  const scopeOf = new Map(problems.map((p) => [p.problem_id, p.scope]));
  const pidOf = new Map([
    ...choices.map((c) => [c.choice_id, c.problem_id]),
    ...boxItems.map((b) => [b.box_item_id, b.problem_id]),
  ]);
  const flaggedPids = new Set(
    [...targets.choice, ...targets.box]
      .map((id) => pidOf.get(id))
      .filter(Boolean),
  );
  const dist = {};
  for (const pid of flaggedPids) {
    const k = scopeOf.get(pid) ?? "null";
    dist[k] = (dist[k] ?? 0) + 1;
  }
  console.log(
    `\n표시된 문항 ${flaggedPids.size} — scope 분포 ${JSON.stringify(dist)}`,
  );
}

// 이미 true 인 것과 대비 — 재실행 시 변화량 확인용.
const already = {
  choice: choices.filter((c) => c.cross_unit).length,
  box: boxItems.filter((b) => b.cross_unit).length,
};
console.log(
  `\n현재 DB cross_unit — 선지 ${already.choice} · 보기 ${already.box}`,
);

if (!APPLY) {
  console.log("\n--apply 를 붙이면 반영합니다.");
  process.exit(0);
}

// ★되돌릴 수 있게 현재 값을 먼저 남긴다.
const backup = path.resolve(process.cwd(), "tmp/cross-unit-backup.json");
fs.writeFileSync(
  backup,
  JSON.stringify(
    {
      choices: choices.map((c) => ({
        id: c.choice_id,
        crossUnit: c.cross_unit,
      })),
      boxItems: boxItems.map((b) => ({
        id: b.box_item_id,
        crossUnit: b.cross_unit,
      })),
    },
    null,
    1,
  ),
  "utf8",
);
console.log(`백업 ${backup}`);

// 지문 표시 플래그는 추록 발행 대상이 아니다 — 개정 원장 억제(적재·표시 정정 성격).
const { data: win, error: winErr } = await sb.rpc("fn_open_suppress_window", {
  p_minutes: 30,
  p_reason: "워크북 기울임체 → 타 단원 지문 플래그 백필",
  p_scope: ["mcq"],
});
if (winErr) throw new Error(winErr.message);
try {
  const plans = [
    {
      table: "problem_choices",
      pk: "choice_id",
      all: choices.map((c) => c.choice_id),
      on: targets.choice,
    },
    {
      table: "problem_box_items",
      pk: "box_item_id",
      all: boxItems.map((b) => b.box_item_id),
      on: targets.box,
    },
  ];
  for (const p of plans) {
    const onIds = [...p.on];
    // 재실행 멱등 — 대상 밖인데 true 로 남은 행은 되돌린다.
    const offIds = p.all.filter((id) => !p.on.has(id));
    for (const [value, ids] of [
      [true, onIds],
      [false, offIds],
    ]) {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb
          .from(p.table)
          .update({ cross_unit: value })
          .in(p.pk, ids.slice(i, i + 200))
          .eq("cross_unit", !value);
        if (error) throw new Error(`${p.table} ${value}: ${error.message}`);
      }
    }
    console.log(`  ${p.table} → true ${onIds.length}건`);
  }
} finally {
  await sb.rpc("fn_close_suppress_window", { p_window_id: win });
}
console.log("반영 완료.");
