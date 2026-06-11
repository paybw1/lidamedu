// 민법(civil) 조문 적재 — 공식 법령 HWPX → articles + article_revisions.
//
// 입력: source/민법/민법(법률)(제21454호)(20260317).hwpx (국가법령정보센터 공식)
// 출력: source/_converted/parsed-articles-civil.json (중간 산출), 운영 DB(mcgdoplo) 적재.
//
// 기존 parse-*-articles.mjs 는 교재(리담 조문집) HTML 을 파싱하지만, 공식 HWPX 는
// 형식이 달라(제N조(제목) 본문 + 편/장/절/관 계층) 전용 파서를 둔다. body_json 형태는
// app/features/laws/components/article-body.tsx 의 렌더 계약과 동일하게 맞춘다
// (block: clause/item/sub/para, inline: text/amendment_note — 조문 상호참조 "제N조제M항"·
//  <개정...> 노트는 렌더러가 본문 text 에서 자동 인식하므로 평문 text 로 둔다).
//
// 사용:
//   node scripts/seed-civil-articles.mjs --parse   # DB 무변경. JSON 작성 + 통계 출력(검증용)
//   node scripts/seed-civil-articles.mjs --seed     # 기존 civil 골격 wipe 후 전량 적재(파괴적)
//
// 레벨: 편→part, 장→chapter, 절→section, 관→section(enum 에 subsection 없음, display_label 로 구분),
//       조→article. 트리는 parent_id/path(ltree) 기반.
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import AdmZip from "adm-zip";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const PROD_REF = "mcgdoplovrjgklbxmozi";
const HWPX = "source/민법/민법(법률)(제21454호)(20260317).hwpx";
const OUT_JSON = "source/_converted/parsed-articles-civil.json";
const LAW_CODE = "civil";
const EFFECTIVE = "2026-03-17";
const PROMULGATED = "2026-03-17";
const REVNUM = "법률 제21454호";
const PUBLICATION = "[시행 2026. 3. 17.] [법률 제21454호, 2026. 3. 17., 일부개정]";

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
const CIRCLED_RE = /^([①-⑳])\s*(.*)$/; // 항 ①..⑳
const ITEM_RE = /^(\d{1,3})\.\s+(.*)$/; // 호 1.
const SUB_RE = /^([가-힣])\.\s+(.*)$/; // 목 가.
const PART_RE = /^제(\d+)편\s+(.+)$/;
const CHAP_RE = /^제(\d+)장\s+(.+)$/;
const SEC_RE = /^제(\d+)절\s+(.+)$/;
const SUBSEC_RE = /^제(\d+)관\s+(.+)$/;
const ART_RE = /^제(\d+)조(?:의(\d+))?\s*(?:\(([^)]*)\))?\s*(.*)$/;
const BUCHIK_RE = /^부\s*칙/;
// <개정 ...> / [전문개정 ...] 등 — 본문 안 개정 메타
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

// 한 조문의 본문 라인들 → block 트리
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
      clause = {
        kind: "clause",
        number: circledToNum(m[1]),
        label: m[1],
        inline: tokenizeInline(m[2]),
        children: [],
      };
      blocks.push(clause);
      item = null;
      leadPara = null;
    } else if ((m = ITEM_RE.exec(line))) {
      item = {
        kind: "item",
        number: Number(m[1]),
        label: `${m[1]}.`,
        inline: tokenizeInline(m[2]),
        children: [],
      };
      (clause ? clause.children : blocks).push(item);
      leadPara = null;
    } else if ((m = SUB_RE.exec(line)) && (item || clause)) {
      const sub = {
        kind: "sub",
        letter: m[1],
        label: `${m[1]}.`,
        inline: tokenizeInline(m[2]),
        children: [],
      };
      (item ? item.children : clause.children).push(sub);
    } else {
      // 마커 없는 줄 — 직전 블록의 연속(append) 또는 조 본문 직속 para
      const target = item || clause;
      if (target) {
        target.inline.push(...tokenizeInline(` ${line}`));
      } else if (leadPara) {
        leadPara.inline.push(...tokenizeInline(` ${line}`));
      } else {
        leadPara = { kind: "para", inline: tokenizeInline(line) };
        blocks.push(leadPara);
      }
    }
  }
  return blocks;
}

function parse(paragraphs) {
  const groups = []; // {level, number, path, parentPath, display_label}
  const seenGroupPath = new Set();
  const articles = [];
  let part = null;
  let chapter = null;
  let section = null;
  let subsection = null;
  let cur = null; // 현재 조문 {.., bodyLines:[]}
  const flush = () => {
    if (!cur) return;
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
    if (BUCHIK_RE.test(line)) break; // 부칙 — 본조 파싱 종료
    let m;
    if ((m = PART_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      part = { number: n, path: `${LAW_CODE}.pt${pad(n, 2)}` };
      chapter = section = subsection = null;
      addGroup({ level: "part", number: n, path: part.path, parentPath: null, display_label: line });
    } else if ((m = CHAP_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      const base = part ? part.path : LAW_CODE;
      chapter = { number: n, path: `${base}.ch${pad(n, 2)}` };
      section = subsection = null;
      addGroup({ level: "chapter", number: n, path: chapter.path, parentPath: part ? part.path : null, display_label: line });
    } else if ((m = SEC_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      const base = chapter ? chapter.path : part ? part.path : LAW_CODE;
      section = { number: n, path: `${base}.s${pad(n, 2)}` };
      subsection = null;
      addGroup({ level: "section", number: n, path: section.path, parentPath: base === LAW_CODE ? null : base, display_label: line });
    } else if ((m = SUBSEC_RE.exec(line))) {
      flush();
      const n = Number(m[1]);
      const base = section ? section.path : chapter ? chapter.path : part ? part.path : LAW_CODE;
      subsection = { number: n, path: `${base}.gw${pad(n, 2)}` };
      // 관: enum 에 subsection 없음 → section 으로 적재(트리는 parent_id/path 기반, display_label 로 구분)
      addGroup({ level: "section", number: n, path: subsection.path, parentPath: base === LAW_CODE ? null : base, display_label: line });
    } else if ((m = ART_RE.exec(line))) {
      flush();
      const number = Number(m[1]);
      const branch = m[2] ? Number(m[2]) : null;
      const title = (m[3] ?? "").trim();
      const rest = (m[4] ?? "").trim();
      const parentGroup = subsection || section || chapter || part;
      const parentPath = parentGroup ? parentGroup.path : null;
      const seg = `a${pad(number, 4)}${branch ? `_${pad(branch, 2)}` : ""}`;
      const apath = `${parentPath ?? LAW_CODE}.${seg}`;
      const deleted = /^삭제/.test(rest);
      const branchSuffix = branch ? `의${branch}` : "";
      const articleNumber = `${number}${branchSuffix}`; // DB 필드: patent 규칙 "14의2"
      const display_label = deleted // 표시: 제14조의2 (의M 은 조 뒤)
        ? `제${number}조${branchSuffix} (삭제)`
        : `제${number}조${branchSuffix}${title ? ` ${title}` : ""}`;
      cur = {
        number,
        branch,
        title,
        deleted,
        importance: 1,
        article_number: articleNumber,
        path: apath,
        parentPath,
        display_label,
        bodyLines: rest ? [rest] : [],
      };
    } else if (cur) {
      cur.bodyLines.push(line); // 조문 본문 연속 라인
    }
    // (그 외: 편/장 앞 머리말·표 등은 무시)
  }
  flush();
  return { groups, articles };
}

// ---------- 통계 ----------
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
    withItems: a.filter((x) =>
      x.blocks.some((b) => b.kind === "item" || b.children?.some?.((c) => c.kind === "item")),
    ).length,
    minNo: Math.min(...a.map((x) => x.number)),
    maxNo: Math.max(...a.map((x) => x.number)),
  };
}

// ---------- Management API (wipe + current_revision_id 조인 업데이트) ----------
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
    const chunk = rows.slice(i, i + 500);
    let q = sb.from(table).insert(chunk);
    if (returning) q = q.select(returning);
    const { data, error } = await q;
    if (error) throw new Error(`${table} insert: ${error.message}`);
    if (returning && data) out.push(...data);
  }
  return out;
}

async function seed(parsed) {
  const sb = adminClient();
  const { data: law, error: le } = await sb
    .from("laws")
    .select("law_id")
    .eq("law_code", LAW_CODE)
    .single();
  if (le || !law) throw new Error(`law civil 없음: ${le?.message}`);
  const lawId = law.law_id;
  const esc = (s) => s.replace(/'/g, "''");

  // 1. wipe (기존 골격) — 순환 FK 회피 위해 current_revision_id null → revisions → articles → law_revisions
  console.log("wipe 기존 civil...");
  await mgmtSql(`
    update public.articles set current_revision_id=null where law_id='${lawId}';
    delete from public.article_revisions where article_id in (select article_id from public.articles where law_id='${lawId}');
    delete from public.articles where law_id='${lawId}';
    delete from public.law_revisions where law_id='${lawId}';
  `);

  // 2. law_revision
  const { data: rev, error: re } = await sb
    .from("law_revisions")
    .insert({
      law_id: lawId,
      revision_number: REVNUM,
      promulgated_at: PROMULGATED,
      effective_date: EFFECTIVE,
      reason_md: `민법 ${PUBLICATION} 조문 시드`,
      revision_kind: "act",
    })
    .select("law_revision_id")
    .single();
  if (re || !rev) throw new Error(`law_revision: ${re?.message}`);
  const lawRevisionId = rev.law_revision_id;

  // 3. 그룹 노드(편/장/절/관) — 깊이 오름차순으로 부모 먼저 삽입
  const pathToId = new Map();
  const byDepth = [...parsed.groups].sort(
    (a, b) => a.path.split(".").length - b.path.split(".").length,
  );
  let depthCursor = 0;
  while (depthCursor < byDepth.length) {
    const depth = byDepth[depthCursor].path.split(".").length;
    const layer = [];
    while (
      depthCursor < byDepth.length &&
      byDepth[depthCursor].path.split(".").length === depth
    ) {
      layer.push(byDepth[depthCursor]);
      depthCursor++;
    }
    const rows = layer.map((g) => ({
      law_id: lawId,
      parent_id: g.parentPath ? (pathToId.get(g.parentPath) ?? null) : null,
      level: g.level,
      path: g.path,
      article_number: null,
      display_label: g.display_label,
      importance: 1,
    }));
    const ins = await insertBatched(sb, "articles", rows, "article_id, path");
    for (const r of ins) pathToId.set(r.path, r.article_id);
  }

  // 4. 조문(article) 노드
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

  // 5. article_revisions (본문 body_json)
  // effective_date=NULL: protect_in_force 트리거(시행중 revision 삭제·수정 차단)를 피해
  // staff 편집·재시드 가능 상태로 둔다(제네릭 시더 기본값과 동일). 렌더는 current_revision_id 로.
  const revRows = parsed.articles.map((a) => ({
    article_id: artPathToId.get(a.path),
    law_revision_id: lawRevisionId,
    body_json: { blocks: a.blocks },
    effective_date: null,
    change_kind: a.deleted ? "deleted" : "created",
  }));
  await insertBatched(sb, "article_revisions", revRows, null);

  // 6. current_revision_id 채움 (조문당 revision 1개 → 조인 업데이트 1방)
  console.log("current_revision_id 연결...");
  await mgmtSql(`
    update public.articles a
    set current_revision_id = r.revision_id
    from public.article_revisions r
    where r.article_id = a.article_id and a.law_id='${lawId}'
  `);

  // 검증
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
  console.log(`완료: article 노드 ${artCnt}, 본문 연결 ${revCnt}`);
}

// ---------- main ----------
const mode = process.argv[2];
const paragraphs = extractParagraphs(HWPX);
const parsed = parse(paragraphs);
const st = stats(parsed);
console.log("파싱 통계:", JSON.stringify(st, null, 2));

if (mode === "--parse") {
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), source: HWPX, publication: PUBLICATION, stats: st, ...parsed },
      null,
      2,
    ),
  );
  console.log(`\n→ ${OUT_JSON} 작성 (DB 무변경). 샘플 검수 후 --seed 로 적재.`);
} else if (mode === "--seed") {
  await seed(parsed);
} else {
  console.log("\n사용: --parse (검증) | --seed (적재)");
  process.exit(1);
}
