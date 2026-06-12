// 법령(민법·민사소송법 등) 조문 적재 — 공식 법령 HWPX → articles + article_revisions.
//
// 국가법령정보센터 공식 HWPX(제N조(제목) 본문 + 편/장/절/관 계층)를 파싱한다. 교재 파서
// (parse-*-articles.mjs)와 형식이 다르므로 전용. body_json 은 article-body.tsx 렌더 계약과
// 동일(block clause/item/sub/para, inline text/amendment_note — 제N조제M항 상호참조·<개정>
// 노트는 렌더러가 본문 text 에서 자동 인식하므로 평문 text 로 둔다).
//
// 사용:
//   node scripts/seed-law-articles.mjs --law=civil-procedure --ltree=cprocedure \
//     --hwpx="source/민사소송법/민사소송법(법률)(제19516호)(20250712).hwpx" \
//     --effective=2025-07-12 --revnum="법률 제19516호" --parse   # 검증(DB 무변경)
//   ... --seed                                                    # 적재(기존 wipe 후 재적재)
//
// 레벨: 편→part, 장→chapter, 절→section, 관→section(enum 에 subsection 없음, display_label 로 구분),
//       조→article. 트리는 parent_id/path(ltree). importance 는 0(별 없음) — 강사가 추후 부여.
// ltree 라벨은 [A-Za-z0-9_] 만 허용 → law_code 에 하이픈이 있으면(civil-procedure) --ltree 로 별도 지정.
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "mcgdoplovrjgklbxmozi";

const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] ?? true;
}
const LAW_CODE = args.law;
const HWPX = args.hwpx;
const LTREE = args.ltree || LAW_CODE; // ltree 루트 라벨(하이픈 불가)
const EFFECTIVE = args.effective || null;
const PROMULGATED = args.promulgated || EFFECTIVE;
const REVNUM = args.revnum || "seed";
const PUBLICATION = args.publication || "";
const MODE = args.seed ? "--seed" : args.parse ? "--parse" : null;

if (!LAW_CODE || !HWPX) throw new Error("필수: --law=<code> --hwpx=<path>");
if (!/^[A-Za-z0-9_]+$/.test(LTREE)) throw new Error(`ltree prefix '${LTREE}' 무효(영문/숫자/_ 만). --ltree 지정 필요`);
const OUT_JSON = `source/_converted/parsed-articles-${LAW_CODE}.json`;

// ---------- HWPX 추출 ----------
function extractParagraphs(hwpxPath) {
  const zip = new AdmZip(hwpxPath);
  const xml = zip
    .getEntries()
    .filter((e) => /^Contents\/section\d+\.xml$/.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName))
    .map((e) => e.getData().toString("utf8"))
    .join("\n");
  const $ = cheerio.load(xml, { xmlMode: true });
  const out = [];
  $("hp\\:p, p").each((_, el) => {
    let t = "";
    $(el)
      .find("hp\\:t, t")
      .each((__, n) => {
        t += $(n).text();
      });
    out.push(t);
  });
  return out;
}

// ---------- 파싱 ----------
const CIRCLED_RE = /^([①-⑳])\s*(.*)$/;
const ITEM_RE = /^(\d{1,3})\.\s+(.*)$/;
const SUB_RE = /^([가-힣])\.\s+(.*)$/;
const PART_RE = /^제(\d+)편\s+(.+)$/;
const CHAP_RE = /^제(\d+)장\s+(.+)$/;
const SEC_RE = /^제(\d+)절\s+(.+)$/;
const SUBSEC_RE = /^제(\d+)관\s+(.+)$/;
const ART_RE = /^제(\d+)조(?:의(\d+))?\s*(?:\(([^)]*)\))?\s*(.*)$/;
const BUCHIK_RE = /^부\s*칙/;
const AMEND_RE =
  /<[^<>]*(?:개정|신설|삭제|시행|전문개정|본조신설|제목개정|타법개정|대통령령|법률)[^<>]*>|\[[^[\]]*(?:개정|신설|삭제|전문개정|본조신설|제목개정|타법개정|법률\s*제)[^[\]]*\]/g;

const circledToNum = (ch) => ch.charCodeAt(0) - 0x2460 + 1;
const pad = (n, w) => String(n).padStart(w, "0");

function tokenizeInline(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(AMEND_RE)) {
    if (m.index > last) out.push({ type: "text", text: text.slice(last, m.index) });
    out.push({ type: "amendment_note", text: m[0].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out.length ? out : [{ type: "text", text }];
}

function buildBlocks(lines) {
  const blocks = [];
  let clause = null;
  let item = null;
  let leadPara = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = CIRCLED_RE.exec(line))) {
      clause = { kind: "clause", number: circledToNum(m[1]), label: m[1], inline: tokenizeInline(m[2]), children: [] };
      blocks.push(clause);
      item = null;
      leadPara = null;
    } else if ((m = ITEM_RE.exec(line))) {
      item = { kind: "item", number: Number(m[1]), label: `${m[1]}.`, inline: tokenizeInline(m[2]), children: [] };
      (clause ? clause.children : blocks).push(item);
      leadPara = null;
    } else if ((m = SUB_RE.exec(line)) && (item || clause)) {
      const sub = { kind: "sub", letter: m[1], label: `${m[1]}.`, inline: tokenizeInline(m[2]), children: [] };
      (item ? item.children : clause.children).push(sub);
    } else {
      const target = item || clause;
      if (target) target.inline.push(...tokenizeInline(` ${line}`));
      else if (leadPara) leadPara.inline.push(...tokenizeInline(` ${line}`));
      else {
        leadPara = { kind: "para", inline: tokenizeInline(line) };
        blocks.push(leadPara);
      }
    }
  }
  return blocks;
}

function parse(paragraphs) {
  const groups = [];
  const seenGroupPath = new Set();
  const seenArtPath = new Set();
  const articles = [];
  let part = null;
  let chapter = null;
  let section = null;
  let subsection = null;
  let cur = null;
  // 공식 텍스트는 개정 조문을 "현행(먼저) + 시행예정([시행일: ...] 마커, 나중)"으로 병기한다.
  // 현행만 적재한다 → 시행일 마커가 붙은 occurrence 와 path 중복(안전망)은 버린다.
  const flush = () => {
    if (!cur) return;
    const fullText = cur.bodyLines.join("\n");
    const isFuture = /\[\s*시행일\s*[:：]/.test(fullText);
    if (isFuture || seenArtPath.has(cur.path)) {
      cur = null;
      return;
    }
    seenArtPath.add(cur.path);
    cur.blocks = buildBlocks(cur.bodyLines);
    delete cur.bodyLines;
    articles.push(cur);
    cur = null;
  };
  const addGroup = (g) => {
    if (seenGroupPath.has(g.path)) return;
    seenGroupPath.add(g.path);
    groups.push(g);
  };

  for (const raw of paragraphs) {
    const line = raw.trim();
    if (!line) continue;
    if (BUCHIK_RE.test(line)) break;
    let m;
    if ((m = PART_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      part = { number: n, path: `${LTREE}.pt${pad(n, 2)}` };
      chapter = section = subsection = null;
      addGroup({ level: "part", number: n, path: part.path, parentPath: null, display_label: line });
    } else if ((m = CHAP_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      const base = part ? part.path : LTREE;
      chapter = { number: n, path: `${base}.ch${pad(n, 2)}` };
      section = subsection = null;
      addGroup({ level: "chapter", number: n, path: chapter.path, parentPath: part ? part.path : null, display_label: line });
    } else if ((m = SEC_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      const base = chapter ? chapter.path : part ? part.path : LTREE;
      section = { number: n, path: `${base}.s${pad(n, 2)}` };
      subsection = null;
      addGroup({ level: "section", number: n, path: section.path, parentPath: base === LTREE ? null : base, display_label: line });
    } else if ((m = SUBSEC_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      const base = section ? section.path : chapter ? chapter.path : part ? part.path : LTREE;
      subsection = { number: n, path: `${base}.gw${pad(n, 2)}` };
      addGroup({ level: "section", number: n, path: subsection.path, parentPath: base === LTREE ? null : base, display_label: line });
    } else if ((m = ART_RE.exec(line))) {
      flush();
      const number = Number(m[1]);
      const branch = m[2] ? Number(m[2]) : null;
      const title = (m[3] ?? "").trim();
      const rest = (m[4] ?? "").trim();
      const parentGroup = subsection || section || chapter || part;
      const parentPath = parentGroup ? parentGroup.path : null;
      const seg = `a${pad(number, 4)}${branch ? `_${pad(branch, 2)}` : ""}`;
      const apath = `${parentPath ?? LTREE}.${seg}`;
      const deleted = /^삭제/.test(rest);
      const branchSuffix = branch ? `의${branch}` : "";
      const articleNumber = `${number}${branchSuffix}`;
      const display_label = deleted
        ? `제${number}조${branchSuffix} (삭제)`
        : `제${number}조${branchSuffix}${title ? ` ${title}` : ""}`;
      cur = {
        number,
        branch,
        title,
        deleted,
        importance: 0,
        article_number: articleNumber,
        path: apath,
        parentPath,
        display_label,
        bodyLines: rest ? [rest] : [],
      };
    } else if (cur) {
      cur.bodyLines.push(line);
    }
  }
  flush();
  return { groups, articles };
}

function stats(parsed) {
  const g = parsed.groups;
  const a = parsed.articles;
  return {
    parts: g.filter((x) => x.level === "part").length,
    chapters: g.filter((x) => x.level === "chapter").length,
    sectionsAndSubsections: g.filter((x) => x.level === "section").length,
    articles: a.length,
    branchArticles: a.filter((x) => x.branch).length,
    deleted: a.filter((x) => x.deleted).length,
    withClauses: a.filter((x) => x.blocks.some((b) => b.kind === "clause")).length,
    minNo: Math.min(...a.map((x) => x.number)),
    maxNo: Math.max(...a.map((x) => x.number)),
  };
}

// ---------- DB ----------
async function mgmtSql(query) {
  const tok = process.env.SUPABASE_ACCESS_TOKEN;
  if (!tok) throw new Error("missing SUPABASE_ACCESS_TOKEN");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`mgmtSql HTTP ${res.status}: ${text}`);
  return JSON.parse(text);
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!String(url).includes(PROD_REF)) throw new Error(`SAFETY: SUPABASE_URL not ${PROD_REF}`);
  if (!key) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function insertBatched(sb, table, rows, returning) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    let q = sb.from(table).insert(rows.slice(i, i + 500));
    if (returning) q = q.select(returning);
    const { data, error } = await q;
    if (error) throw new Error(`${table} insert: ${error.message}`);
    if (returning && data) out.push(...data);
  }
  return out;
}

async function seed(parsed) {
  const sb = adminClient();
  const { data: law, error: le } = await sb.from("laws").select("law_id").eq("law_code", LAW_CODE).single();
  if (le || !law) throw new Error(`law ${LAW_CODE} 없음: ${le?.message}`);
  const lawId = law.law_id;

  console.log(`wipe 기존 ${LAW_CODE}...`);
  await mgmtSql(`
    update public.articles set current_revision_id=null where law_id='${lawId}';
    delete from public.article_revisions where article_id in (select article_id from public.articles where law_id='${lawId}');
    delete from public.articles where law_id='${lawId}';
    delete from public.law_revisions where law_id='${lawId}';
  `);

  const { data: rev, error: re } = await sb
    .from("law_revisions")
    .insert({
      law_id: lawId,
      revision_number: REVNUM,
      promulgated_at: PROMULGATED,
      effective_date: EFFECTIVE,
      reason_md: `${LAW_CODE} ${PUBLICATION} 조문 시드`,
      revision_kind: "act",
    })
    .select("law_revision_id")
    .single();
  if (re || !rev) throw new Error(`law_revision: ${re?.message}`);
  const lawRevisionId = rev.law_revision_id;

  // 그룹 노드 — 깊이 오름차순(부모 먼저)
  const pathToId = new Map();
  const byDepth = [...parsed.groups].sort((a, b) => a.path.split(".").length - b.path.split(".").length);
  let i = 0;
  while (i < byDepth.length) {
    const depth = byDepth[i].path.split(".").length;
    const layer = [];
    while (i < byDepth.length && byDepth[i].path.split(".").length === depth) layer.push(byDepth[i++]);
    const rows = layer.map((g) => ({
      law_id: lawId,
      parent_id: g.parentPath ? (pathToId.get(g.parentPath) ?? null) : null,
      level: g.level,
      path: g.path,
      article_number: null,
      display_label: g.display_label,
      importance: 0,
    }));
    const ins = await insertBatched(sb, "articles", rows, "article_id, path");
    for (const r of ins) pathToId.set(r.path, r.article_id);
  }

  // 조문 노드
  const artRows = parsed.articles.map((a) => ({
    law_id: lawId,
    parent_id: a.parentPath ? (pathToId.get(a.parentPath) ?? null) : null,
    level: "article",
    path: a.path,
    article_number: a.article_number,
    display_label: a.display_label,
    importance: a.importance,
    deleted_at: null,
  }));
  const artIns = await insertBatched(sb, "articles", artRows, "article_id, path");
  const artPathToId = new Map(artIns.map((r) => [r.path, r.article_id]));

  // article_revisions (effective_date=NULL → protect_in_force 트리거 회피, 편집·재시드 가능)
  const revRows = parsed.articles.map((a) => ({
    article_id: artPathToId.get(a.path),
    law_revision_id: lawRevisionId,
    body_json: { blocks: a.blocks },
    effective_date: null,
    change_kind: a.deleted ? "deleted" : "created",
  }));
  await insertBatched(sb, "article_revisions", revRows, null);

  console.log("current_revision_id 연결...");
  await mgmtSql(`
    update public.articles a set current_revision_id = r.revision_id
    from public.article_revisions r
    where r.article_id = a.article_id and a.law_id='${lawId}'
  `);

  const { count: artCnt } = await sb
    .from("articles")
    .select("article_id", { count: "exact", head: true })
    .eq("law_id", lawId)
    .eq("level", "article");
  const { count: revCnt } = await sb
    .from("articles")
    .select("article_id", { count: "exact", head: true })
    .eq("law_id", lawId)
    .eq("level", "article")
    .not("current_revision_id", "is", null);
  console.log(`완료(${LAW_CODE}): article 노드 ${artCnt}, 본문 연결 ${revCnt}`);
}

// ---------- main ----------
const paragraphs = extractParagraphs(HWPX);
const parsed = parse(paragraphs);
const st = stats(parsed);
console.log(`[${LAW_CODE} / ltree=${LTREE}] 파싱 통계:`, JSON.stringify(st, null, 2));

if (MODE === "--parse") {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ generatedAt: new Date().toISOString(), law: LAW_CODE, ltree: LTREE, source: HWPX, publication: PUBLICATION, stats: st, ...parsed }, null, 2),
  );
  console.log(`\n→ ${OUT_JSON} 작성(DB 무변경). 검수 후 --seed.`);
} else if (MODE === "--seed") {
  await seed(parsed);
} else {
  console.log("\n사용: --law=<code> --hwpx=<path> [--ltree=<prefix>] [--effective=YYYY-MM-DD] [--revnum=..] (--parse | --seed)");
  process.exit(1);
}
