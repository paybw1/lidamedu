// 특허법 체계도(systematic_nodes) + article_systematic_links 시드.
//
// 입력: source/_converted/systematic-tree-patent.json
// 흐름:
//   1. 기존 patent law 의 systematic_nodes / article_systematic_links 삭제 (재시드 안전)
//   2. articles 테이블에서 patent law 의 모든 (article_number, article_id) 매핑 로드
//   3. JSON 트리 walk 하면서:
//      - systematic_nodes 삽입 (path = ltree, parent_id 연결, ord)
//      - leaf 의 ref 약식 표기를 article_number 집합으로 expand
//      - 매칭되는 article_id 들과 article_systematic_links 삽입
//
// 약식 표기 처리 규칙 (體系圖 image 기준):
//   - "法" / "발진법" 으로 시작 — "발진법" 으로 시작하면 외부 법(발명진흥법) → 매핑 skip
//   - 콤마(,) 로 분리된 개별 ref
//   - 각 토큰:
//       단일: "29", "29의2", "81의3"
//       범위: "89~93", "28~28의5", "132의2~132의15", "199~214"
//       조항 첨부: "5②~10" (항/호 첨부는 article 단위 매핑이라 무시 — "5"~"10" 로 처리)
//       특수: "181/98" — 슬래시 분리 다중 ref
//       원숫자: "①" "②" 등 — clause level 이라 article 단위 매핑에서 무시
//   - "29~33" 같은 정수 range 는 articles 에 존재하는 모든 "29", "30", ..., "33" 을 매핑.
//   - "29~30의2" 같이 끝이 가지조면 정수 부분 + 끝의 가지조까지 포함.
//   - "법" 글자(法) 만 떼어내고 숫자/한자 부분만 파싱.
//
// 주의: SUPABASE_SERVICE_ROLE_KEY 필요.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const JSON_PATH = resolve(ROOT, "source/_converted/systematic-tree-patent.json");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const tree = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const LAW_CODE = tree.law_code;

// ───────────────────── 유틸: 약식 표기 → article_number 집합 ─────────────────────

// 한 토큰(콤마 분리된 단위)을 articleNumber 배열로 변환.
//   "29" → ["29"]
//   "29의2" → ["29의2"]
//   "89~93" → ["89","90","91","92","93"]
//   "28~28의5" → ["28","28의1","28의2","28의3","28의4","28의5"] (실제 존재 article 만)
//   "132의2~132의15" → ["132의2",...,"132의15"]
//   "5②~10" → ["5","6","7","8","9","10"] (원숫자 등 제거)
//   "181/98" → ["181","98"]
//   "①", "②" → []  (조 단위 아님)
function expandToken(token, allKnownNumbers) {
  // 슬래시 분리: "181/98" → ["181","98"] 처리 후 합집합
  if (token.includes("/")) {
    const parts = token.split("/").map((s) => s.trim()).filter(Boolean);
    return parts.flatMap((p) => expandToken(p, allKnownNumbers));
  }

  // 원숫자/괄호숫자 마커 제거 — clause/item 단위는 article 매핑에서 무시.
  // 예: "5②~10" → "5~10", "29③-29⑦" → "29-29"
  const stripped = token.replace(/[①-⑳㉑-㉟㊱-㊿]+/g, "");

  // 범위 분해 — "~" 또는 "-" 둘 다 허용 (체계도2 는 "-" 사용)
  if (/[~\-]/.test(stripped)) {
    const parts = stripped.split(/[~\-]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length !== 2) return [];
    const [aRaw, bRaw] = parts;
    const a = parseRefHead(aRaw);
    const b = parseRefHead(bRaw);
    if (a == null || b == null) return [];
    return expandRange(a, b, allKnownNumbers);
  }

  // 단일
  const head = parseRefHead(stripped.trim());
  if (head == null) return [];
  return [formatRef(head)];
}

// "29의2" → {n:29, branch:2}
// "29"   → {n:29, branch:0}
// "29본문", "29각호" 같은 trailing 한글은 무시 (article 단위 매핑이라 본문/각호 구분 의미 없음).
// 잘못된 형식이면 null
function parseRefHead(s) {
  if (!s) return null;
  // prefix 매칭: 첫 정수(+가지조) 만 추출, 뒤따르는 한글/문자는 무시.
  const m = s.match(/^(\d+)(?:의(\d+))?/);
  if (!m) return null;
  return { n: Number(m[1]), branch: m[2] ? Number(m[2]) : 0 };
}

function formatRef({ n, branch }) {
  return branch === 0 ? String(n) : `${n}의${branch}`;
}

// a..b 범위를 article_number 문자열 배열로 펼침.
//
// 보수적 룰: 정수 range "X~Y" (둘 다 본조) 는 X..Y **본조만** 매핑. 가지조는 별도 토큰으로 명시되어야 한다.
// 이유: "126~132" 같은 range 가 132의2~132의15 (별도 노드의 가지조) 까지 끌어들이는 over-match 방지.
// 양 끝점이 가지조로 명시된 경우 (a.branch>0 또는 b.branch>0) 만 가지조 펼침.
//
// 케이스:
//   X의A~X의B            → X의A..X의B
//   X~X의B               → X 본조 + X의1..X의B
//   X의A~Y (Y>X 본조)     → X의A..X의(maxBr) + (X+1)..Y 본조
//   X~Y의B (Y>X)          → X..(Y) 본조 + Y의1..Y의B
//   X의A~Y의B (Y>X)       → X의A..X의(maxBr) + (X+1)..(Y-1) 본조 + Y 본조 + Y의1..Y의B
//   X~Y (둘 다 본조)      → X..Y 본조만 (가지조 미포함, 별도 토큰 명시 필요)
function expandRange(a, b, allKnownNumbers) {
  const out = [];

  // 케이스 1: X의A~X의B (같은 정수 가지조 range)
  if (a.n === b.n && a.branch > 0 && b.branch > 0 && b.branch >= a.branch) {
    for (let i = a.branch; i <= b.branch; i++) {
      const k = `${a.n}의${i}`;
      if (allKnownNumbers.has(k)) out.push(k);
    }
    return out;
  }

  // 케이스 2: X~X의B (같은 정수, 본조 + 가지조 끝까지)
  if (a.n === b.n && a.branch === 0 && b.branch > 0) {
    if (allKnownNumbers.has(String(a.n))) out.push(String(a.n));
    for (let i = 1; i <= b.branch; i++) {
      const k = `${a.n}의${i}`;
      if (allKnownNumbers.has(k)) out.push(k);
    }
    return out;
  }

  // 케이스 3: 일반 정수 range. 가지조는 양 끝에서 명시된 경우만 포함.
  for (let n = a.n; n <= b.n; n++) {
    const includeBase = !(n === a.n && a.branch > 0);
    if (includeBase && allKnownNumbers.has(String(n))) out.push(String(n));

    let brStart = 0;
    let brEnd = 0;
    if (n === a.n && a.branch > 0) {
      // start 가 가지조 → a.branch 부터 그 정수의 가지조 끝까지
      brStart = a.branch;
      brEnd =
        n === b.n && b.branch > 0
          ? b.branch
          : findMaxBranch(n, allKnownNumbers);
    } else if (n === b.n && b.branch > 0 && n !== a.n) {
      // end 가 가지조 → 1..b.branch
      brStart = 1;
      brEnd = b.branch;
    }
    for (let br = brStart; br <= brEnd; br++) {
      const k = `${n}의${br}`;
      if (allKnownNumbers.has(k)) out.push(k);
    }
  }

  return out;
}

function findMaxBranch(n, allKnownNumbers) {
  let max = 0;
  const prefix = `${n}의`;
  for (const k of allKnownNumbers) {
    if (k.startsWith(prefix)) {
      const br = Number(k.slice(prefix.length));
      if (Number.isFinite(br) && br > max) max = br;
    }
  }
  return max;
}

// 전체 ref 문자열 → article_number 배열
// 처리 형태:
//   "法 29~33, 95"  : 法 토큰
//   "法 81의3, 103~105, 122, 발진법10①" : 法 + 발진법 혼합 — 발진법 부분만 분리해서 skip
//   "발진법 2, 10~19, 58" : 전체가 발진법 — 매핑 skip
function expandRef(refStr, allKnownNumbers) {
  if (!refStr) return { numbers: [], external: false };

  // 발진법/발명진흥법 prefix 가 등장하면 그 시점에서 분리. prefix 이후 부분은 외부 법으로 skip.
  let lawPart = refStr;
  let hasExternal = false;
  const m = refStr.match(/^(.*?)(발진법|발명진흥법)/);
  if (m) {
    hasExternal = true;
    lawPart = m[1].replace(/,\s*$/, "").trim();
  }

  if (!lawPart) {
    return { numbers: [], external: hasExternal };
  }

  // "法" 또는 "법" prefix 제거 (선택적)
  const stripped = lawPart.replace(/^[\s法법]+/, "").trim();
  if (!stripped) {
    return { numbers: [], external: hasExternal };
  }

  const tokens = stripped.split(",").map((t) => t.trim()).filter(Boolean);
  const out = new Set();
  for (const tk of tokens) {
    for (const a of expandToken(tk, allKnownNumbers)) out.add(a);
  }
  return { numbers: [...out], external: hasExternal };
}

// ───────────────────── 유틸: ltree path 라벨 ─────────────────────

// systematic_nodes.path: 'patent.b1.b1_2.b1_2_3' 같이 부모 ord 기반.
// label 자체를 path 에 넣지 않는 이유: ltree label 제약 (영문/숫자/_ 만 허용).
function nodeLabel(ord) {
  return `b${ord}`;
}

// ───────────────────── 1. wipe ─────────────────────
async function wipe() {
  console.log("→ wipe systematic_nodes/links (law_code=patent)");
  // article_systematic_links 는 systematic_nodes cascade 로 정리됨.
  const { error, count } = await supa
    .from("systematic_nodes")
    .delete({ count: "exact" })
    .eq("law_code", LAW_CODE);
  if (error) throw new Error(`delete systematic_nodes: ${error.message}`);
  console.log(`  ✓ ${count ?? 0} systematic_nodes deleted`);
}

// ───────────────────── 2. articles 매핑 로드 ─────────────────────
async function loadArticleMap() {
  const { data: law, error: lawErr } = await supa
    .from("laws")
    .select("law_id")
    .eq("law_code", LAW_CODE)
    .single();
  if (lawErr) throw new Error(`law: ${lawErr.message}`);

  const { data: articles, error } = await supa
    .from("articles")
    .select("article_id, article_number")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null);
  if (error) throw new Error(`articles load: ${error.message}`);

  const map = new Map();
  for (const a of articles) {
    if (a.article_number) map.set(a.article_number, a.article_id);
  }
  console.log(`  ✓ articles loaded: ${map.size}`);
  return { lawId: law.law_id, articleByNumber: map };
}

// ───────────────────── 3. 트리 walk + insert ─────────────────────
async function seedTree(articleByNumber) {
  console.log("→ seed systematic_nodes");
  const knownNumbers = new Set(articleByNumber.keys());

  let nodeCount = 0;
  let linkCount = 0;
  let unmappedRefs = [];

  // 트리에 ord 가 누락된 자식들에는 1-based index 부여
  function withOrd(children) {
    return (children ?? []).map((c, i) => ({ ...c, ord: c.ord ?? i + 1 }));
  }

  async function walk(node, parentId, parentLtree, ord) {
    const labelToken = nodeLabel(ord);
    const path = parentLtree ? `${parentLtree}.${labelToken}` : labelToken;

    const { data: row, error } = await supa
      .from("systematic_nodes")
      .insert({
        law_code: LAW_CODE,
        parent_id: parentId,
        path,
        display_label: node.label,
        ord,
      })
      .select("node_id")
      .single();
    if (error) {
      throw new Error(
        `insert systematic_node "${node.label}" (path=${path}): ${error.message}`,
      );
    }
    nodeCount++;

    // ref 가 있으면 article_systematic_links 삽입.
    // external=true 는 ref 안에 발진법 등 외부 법 토큰이 *포함되어 있다*는 표시일 뿐,
    // 法 토큰이 같이 있다면 그 부분은 정상 매핑한다.
    if (node.ref) {
      const { numbers, external } = expandRef(node.ref, knownNumbers);
      if (numbers.length === 0) {
        // 매핑 가능한 法 토큰이 하나도 없을 때만 unmapped 로 기록 — 단, 전체가 외부 법이면 skip 정상.
        if (!external) {
          unmappedRefs.push({ label: node.label, ref: node.ref });
        }
      } else {
        const articleIds = numbers
          .map((n) => articleByNumber.get(n))
          .filter(Boolean);
        if (articleIds.length > 0) {
          const inserts = articleIds.map((aid) => ({
            article_id: aid,
            node_id: row.node_id,
          }));
          const { error: lErr } = await supa
            .from("article_systematic_links")
            .insert(inserts);
          if (lErr) {
            throw new Error(
              `insert links for "${node.label}": ${lErr.message}`,
            );
          }
          linkCount += inserts.length;
        }
        const missing = numbers.filter((n) => !articleByNumber.has(n));
        if (missing.length > 0) {
          unmappedRefs.push({
            label: node.label,
            ref: node.ref,
            missing,
          });
        }
      }
    }

    // 자식 walk
    const children = withOrd(node.children);
    for (const c of children) {
      await walk(c, row.node_id, path, c.ord);
    }
  }

  // 최상위 8개 분기
  for (const branch of withOrd(tree.tree)) {
    await walk(branch, null, `${LAW_CODE}`, branch.ord);
  }

  console.log(`  ✓ ${nodeCount} nodes / ${linkCount} article links`);
  if (unmappedRefs.length > 0) {
    console.log(`  ! 매핑 누락/부분 매핑: ${unmappedRefs.length}건`);
    for (const u of unmappedRefs.slice(0, 30)) {
      console.log(
        `    - ${u.label} :: ${u.ref}${u.missing ? ` (없음: ${u.missing.join(",")})` : ""}`,
      );
    }
    if (unmappedRefs.length > 30) {
      console.log(`    ... +${unmappedRefs.length - 30}건`);
    }
  }
}

async function main() {
  await wipe();
  const { articleByNumber } = await loadArticleMap();
  await seedTree(articleByNumber);

  // 검증
  const { count: nCount } = await supa
    .from("systematic_nodes")
    .select("*", { count: "exact", head: true })
    .eq("law_code", LAW_CODE);
  const { count: lCount } = await supa
    .from("article_systematic_links")
    .select("*", { count: "exact", head: true });
  console.log("");
  console.log("=== 결과 ===");
  console.log(`  systematic_nodes (patent): ${nCount}`);
  console.log(`  article_systematic_links: ${lCount}`);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
