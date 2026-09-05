// 도해특허법 제20판 hwpx → dohae-patent.json (전체 주제 파싱 + 조문 참조 + PDF 페이지 매핑)
//
//   node scripts/dohae/parse-dohae-book.mjs
//
// 문서 규약 (tmp/dohae/parse-test.mjs 로 검증):
//   - 장(章): 간지 그림 문단("[간지] 도해특허법 (제20판)-NN.png") + 사이드바 도형(그 장의 주제 목록)
//   - 주제 헤더: 도형 그룹 텍스트 "제목(法 refs)" + "번호" + "묶음 개체입니다."
//   - 참고자료 헤더: 참고자료 아이콘 그림 + 같은 문단 텍스트 "N.M 제목"
//   - 소제목: 일반 텍스트 + 로마숫자 배지 도형(Ⅰ…Ⅹ)
//   - 조문 원문·도해 본문: hp:tbl / 다이어그램: 절대배치 도형 무리(내부 표는 별도 추출)
//
// 출력: source/_converted/dohae-patent.json
//   { publication, chapters:[{no,title,sidebarTopics}], units:[{kind,chapter,no,refNo,title,lawRefs,pdfPage,blocks}] }

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const ROOT = resolve(import.meta.dirname, "../..");
const HWPX = resolve(ROOT, "source/특허법/도해특허법/[완0227+내지] 도해특허법 (제20판).hwpx");
const PDF = resolve(ROOT, "source/특허법/도해특허법/[완0227+내지] 도해특허법 (제20판).pdf");
const OUT_DIR = resolve(ROOT, "source/_converted");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = resolve(OUT_DIR, "dohae-patent.json");

// ── HWPX 트리 유틸 ──
const zip = new AdmZip(HWPX);
const xml = zip.getEntry("Contents/section2.xml").getData().toString("utf8");
const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  attributeNamePrefix: "@_",
  trimValues: false,
});
const tree = parser.parse(xml);

const childrenOf = (node) => {
  const keys = Object.keys(node).filter((k) => k !== ":@");
  if (keys.length !== 1) return [];
  const v = node[keys[0]];
  return Array.isArray(v) ? v : [];
};
const tagOf = (node) => Object.keys(node).filter((k) => k !== ":@")[0] ?? null;
const attrsOf = (node) => node[":@"] ?? {};

// ── 원본 서식표(header.xml) — 칸 배경·문단 정렬·글꼴 ──────────────────────────
// ★도해 표의 라벨 칸은 원본이 직접 표시한다: 배경 #F0F0F0 + CENTER + 돋움체 Bold.
//   (hp:tc/@header 는 전부 0 이라 못 쓰고, 굵게도 hh:bold 가 아니라 **글꼴 이름**으로
//   들어간다 — 702개 charPr 중 hh:bold 는 12개뿐.) 글자수·열 위치로 짐작하던 규칙을
//   전부 걷어내고 이 세 값을 그대로 옮긴다(원장 지시 2026-08-17 "원본 형식에 맞춰줘").
const headerTree = parser.parse(
  zip.getEntry("Contents/header.xml").getData().toString("utf8"),
);
const FILL_FACE = new Map(); // borderFill id → faceColor
const PARA_ALIGN = new Map(); // paraPr id → LEFT|CENTER|RIGHT|JUSTIFY
const CHAR_FONT = new Map(); // charPr id → { boldish, rank }
// 글꼴을 못 찾은 자리(문단 구분 개행 등)의 기본값 — 보통 굵기.
const DEFAULT_FONT = { boldish: false, rank: 2 };
const SEPARATOR_FONT = { boldish: false, rank: 0 };
{
  const fontFace = new Map(); // font id → 이름
  (function walk(n) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const t = tagOf(n);
    const a = attrsOf(n);
    if (t === "hh:font") fontFace.set(a["@_id"], a["@_face"] ?? "");
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@" || k.startsWith("@_")) continue;
      walk(v);
    }
  })(headerTree);
  (function walk(n) {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    const t = tagOf(n);
    const a = attrsOf(n);
    if (t === "hh:borderFill") {
      let face = "";
      (function f(x) {
        if (tagOf(x) === "hc:winBrush") face = attrsOf(x)["@_faceColor"] ?? face;
        childrenOf(x).forEach(f);
      })(n);
      FILL_FACE.set(a["@_id"], face);
    } else if (t === "hh:paraPr") {
      const al = childrenOf(n).find((c) => tagOf(c) === "hh:align");
      PARA_ALIGN.set(a["@_id"], attrsOf(al ?? {})["@_horizontal"] ?? "");
    } else if (t === "hh:charPr") {
      const fr = childrenOf(n).find((c) => tagOf(c) === "hh:fontRef");
      const face = fontFace.get(attrsOf(fr ?? {})["@_hangul"]) ?? "";
      // ★교재는 본문 강조를 **글꼴을 바꿔서** 한다 — 본문 「KoPubWorld바탕체 Light」 →
      //   강조 「KoPubWorld돋움체 Medium」. 이름에 Bold 가 든 것만 보면 그 강조가 통째로
      //   사라진다(원장 보고 2026-08-23, p40 「컴퓨터 프로그램 관련 발명」 등 228곳).
      //
      // 그래서 두 가지를 따로 둔다.
      //   boldish — **그 자체로** 굵은 글꼴(hh:bold·Bold·EB·태고딕…). 라벨 칸 판정용.
      //   rank    — 굵기 등급(1 Light / 2 보통·Medium / 3 Bold 이상). 칸 안에서 **주변보다
      //             무거운** run 을 강조로 보는 데 쓴다.
      //   ★등급만으로 강조를 정하면 안 된다 — 참고 2.1 처럼 칸 전체가 고딕이면 그건
      //     그 칸의 본문 글꼴이지 강조가 아니다(인쇄본 p84 확인).
      const heavy = /bold|\bEB\b|heavy|black|태고딕|견고딕/i.test(face);
      const light = /light|thin|\bL$/i.test(face);
      CHAR_FONT.set(a["@_id"], {
        boldish: childrenOf(n).some((c) => tagOf(c) === "hh:bold") || heavy,
        rank: heavy ? 3 : light ? 1 : 2,
      });
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === ":@" || k.startsWith("@_")) continue;
      walk(v);
    }
  })(headerTree);
}
// 음영 = 흰색·없음이 아닌 배경. 교재는 라벨 칸에만 회색(#F0F0F0)을 깐다.
const isShaded = (fillId) => {
  const f = (FILL_FACE.get(fillId) ?? "").toLowerCase();
  return f !== "" && f !== "none" && f !== "#ffffff";
};

const SHAPE_TAGS = new Set([
  "hp:rect", "hp:line", "hp:polygon", "hp:curve", "hp:connectLine",
  "hp:container", "hp:ellipse", "hp:arc",
]);
const ROMAN = /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ]$/;

// 그리기 도형(선·타원·다각형·연결선). 사각형은 뺀다 — 도해는 **내용 상자**를 rect 로 두르므로
// rect 하나로는 그림이라 할 수 없다. 다만 글자를 품은 rect(=라벨 상자)가 여럿이면 도해다.
const DRAW_TAGS = new Set([
  "hp:line", "hp:polygon", "hp:curve", "hp:connectLine", "hp:ellipse", "hp:arc",
]);
const LABELED_RECT_MIN = 3;
// 칸이 이만큼 비어 있으면 내용이 표 밖(도형)에 그려져 있다는 뜻 — HTML 로 내보내면 빈 표가 뜬다.
const EMPTY_CELL_RATIO = 0.4;


// ── 셀·표 파싱 ──
/**
 * 칸의 글 + **굵게 구간**.
 * ★칸 단위 bold 하나로는 원본을 못 옮긴다 — 교재는 한 칸 안에서 소제목만 굵게 쓴다
 *   (t65 「공통점」 칸: "▪주체적 사유" 만 굵음). 종전엔 run 하나라도 굵으면 칸 전체를
 *   굵게 칠해, 굵지 않아야 할 본문까지 굵어졌다(원장 지적 2026-08-22 "공통점에서 볼드
 *   없애기"). 반대로 조문 비교표는 조문 제목만 굵어야 하는데 같은 이유로 칸 전체가 굵었다.
 * 반환 { text, boldRanges } — 칸 전체가 굵으면 호출부에서 bold 플래그로 접는다.
 */
function cellRich(tcNode) {
  const parts = [];
  // 그림이 글 **사이**에 낀 칸(t79 국내단계에서의 보정)을 위해 그림이 나온 자리를 적어 둔다.
  // 앞뒤를 안 나누면 화면에서 그림이 글 위나 아래로 밀려 순서가 뒤집힌다.
  const diagramAtParts = [];
  const tableAtParts = [];
  let pendingGap = false;
  (function walk(n) {
    const tag = tagOf(n);
    if (tag === "hp:tbl" || SHAPE_TAGS.has(tag) || tag === "hp:shapeComment") return;
    if (tag === "hp:p") {
      if (drawingScore(n).draw > 0) diagramAtParts.push(parts.length);
      // 속표가 이 문단에 있으면 그 자리를 적어 둔다 — 글 뒤에 몰아 그리면 순서가 뒤집힌다
      // (t22 「다항제 기재방법…」은 【예】 상자가 【해설】보다 **위**다).
      (function t(x) {
        if (tagOf(x) === "hp:tbl") { tableAtParts.push(parts.length); return; }
        for (const c of childrenOf(x)) t(c);
      })(n);
      const chars = [];
      const bolds = [];
      (function tw(m, root, bold) {
        const mt = tagOf(m);
        if (mt === "#text") {
          for (const ch of String(m["#text"] ?? "")) { chars.push(ch); bolds.push(bold); }
          return;
        }
        if (mt === "hp:tbl" || SHAPE_TAGS.has(mt) || mt === "hp:shapeComment") return;
        if (!root && mt === "hp:p") return;
        const b =
          mt === "hp:run"
            ? (CHAR_FONT.get(attrsOf(m)["@_charPrIDRef"]) ?? { boldish: false, rank: 2 })
            : bold;
        for (const c of childrenOf(m)) tw(c, false, b);
      })(n, true, DEFAULT_FONT);
      // 공백 정규화(연속 공백 → 1개, 앞뒤 잘라내기)를 글자와 굵기에 나란히 적용한다.
      const outC = [];
      const outB = [];
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (ch === " " || ch === "\t") {
          if (outC[outC.length - 1] === " ") continue;
          outC.push(" ");
          outB.push(bolds[i]);
          continue;
        }
        outC.push(ch);
        outB.push(bolds[i]);
      }
      while (outC.length && outC[0] === " ") { outC.shift(); outB.shift(); }
      while (outC.length && outC[outC.length - 1] === " ") { outC.pop(); outB.pop(); }
      // ★빈 문단은 교재가 문단 사이를 띄우려고 넣은 것이다 — 지우면 화면에서 글이 한 덩어리로
      //   붙는다(원장 지시 2026-08-22 "줄바꿈할 때 한 줄 뛰우기(원본 확인)"). 내용 사이에
      //   있는 것만, 연속돼도 한 줄만 남긴다.
      if (!outC.length) { if (parts.length) pendingGap = true; return; }
      if (pendingGap) { parts.push({ text: "", bolds: [] }); pendingGap = false; }
      parts.push({ text: outC.join(""), bolds: outB });
      return;
    }
    for (const c of childrenOf(n)) walk(c);
  })(tcNode);

  const text = parts.map((x) => x.text).join("\n");
  // 글자별 글꼴 → 굵게 여부.
  // ★"그 자체로 굵은 글꼴" 이거나, **이 칸의 본문 글꼴보다 무거운** run 이면 강조다.
  //   칸 전체가 고딕인 표(참고 2.1)는 그게 본문 글꼴이라 강조가 아니다(인쇄본 p84 확인).
  const fonts = [];
  parts.forEach((x, i) => {
    // 문단 구분 개행 — rank 0 이라 어떤 본문 글꼴보다도 가볍다(굵게로 잡히지 않는다).
    if (i > 0) fonts.push(SEPARATOR_FONT);
    fonts.push(...x.bolds);
  });
  const seen = new Map();
  text.split("").forEach((ch, i) => {
    if (!ch.trim()) return;
    const r = fonts[i]?.rank ?? 2;
    seen.set(r, (seen.get(r) ?? 0) + 1);
  });
  let baseRank = 2;
  let most = -1;
  for (const [r, n] of seen) if (n > most || (n === most && r < baseRank)) { most = n; baseRank = r; }
  const flags = fonts.map((f) => !!f && (f.boldish || (f.rank ?? 2) > baseRank));
  const boldRanges = [];
  for (let i = 0; i < flags.length; i++) {
    if (!flags[i]) continue;
    let j = i;
    while (j + 1 < flags.length && flags[j + 1]) j++;
    boldRanges.push([i, j + 1]);
    i = j;
  }
  // 글자 없는 구간(쉼표·공백만)은 굵기로 치지 않는다 — 원고에 자주 남는 조판 잔재라
  // 그대로 옮기면 본문 한가운데 쉼표 하나가 굵게 찍힌다(t65 「공통점」).
  // 구간 앞뒤의 공백·개행은 굵게에서 뺀다 — <strong> 안에 개행이 들어가면 지저분하다.
  for (const r of boldRanges) {
    while (r[0] < r[1] && !text[r[0]].trim()) r[0]++;
    while (r[1] > r[0] && !text[r[1] - 1].trim()) r[1]--;
  }
  const meaningful = (r) => /[\p{L}\p{N}]/u.test(text.slice(r[0], r[1]));
  for (let i = boldRanges.length - 1; i >= 0; i--) if (!meaningful(boldRanges[i])) boldRanges.splice(i, 1);

  // 그림·속표 자리를 글자 오프셋으로 환산(문단 앞뒤 사이).
  const offsetOf = (k) => parts.slice(0, k).map((x) => x.text).join("\n").length;
  const offsets = [...new Set(diagramAtParts)]
    .map(offsetOf)
    .filter((v) => v > 0 && v <= text.length);
  const tablesAt = tableAtParts.map(offsetOf);
  return { text, boldRanges, diagramAt: offsets[0] ?? null, tablesAt };
}

function cellNestedTables(tcNode) {
  const out = [];
  (function walk(n, root) {
    if (!root && tagOf(n) === "hp:tbl") { out.push(n); return; }
    for (const c of childrenOf(n)) walk(c, false);
  })(tcNode, true);
  return out;
}

// 셀 내부 이미지 binId 들 (도표 속 그림 — 표장 등).
function cellImages(tcNode) {
  const out = [];
  (function walk(n) {
    if (tagOf(n) === "hp:tbl") return;
    const ref = attrsOf(n)["@_binaryItemIDRef"] ?? attrsOf(n)["@_BinaryItemIDRef"];
    if (ref && !out.includes(ref)) out.push(ref);
    for (const c of childrenOf(n)) walk(c);
  })(tcNode);
  return out;
}

/**
 * 칸의 원본 서식 → { shade?, align?, bold? }.
 * 중첩 표(hp:tbl)·도형 안 내용은 건너뛴다 — 그 칸의 서식이 아니라 자식 표의 서식이다.
 */
function cellStyle(tcNode) {
  const aligns = [];
  let any = false;
  (function walk(n) {
    const tag = tagOf(n);
    if (tag === "hp:tbl" || SHAPE_TAGS.has(tag) || tag === "hp:shapeComment") return;
    if (tag === "hp:p") {
      let text = "";
      (function t(x) {
        if (tagOf(x) === "hp:t") {
          for (const c of childrenOf(x)) if (typeof c["#text"] === "string") text += c["#text"];
        }
        childrenOf(x).forEach(t);
      })(n);
      if (text.trim()) {
        any = true;
        aligns.push(PARA_ALIGN.get(attrsOf(n)["@_paraPrIDRef"]) ?? "");
      }
      return;
    }
    childrenOf(n).forEach(walk);
  })(tcNode);
  const align = any && aligns.every((a) => a === "CENTER") ? "center" : null;
  return {
    ...(isShaded(attrsOf(tcNode)["@_borderFillIDRef"]) ? { shade: true } : {}),
    ...(align ? { align } : {}),
  };
}

function parseTable(tblNode) {
  const cellRows = [];
  (function walk(n) {
    if (tagOf(n) === "hp:tr") {
      const rich = [];
      (function cw(m) {
        if (tagOf(m) === "hp:tc") {
          let colSpan = 1, rowSpan = 1, width = 0;
          const style = cellStyle(m);
          (function findSpan(x) {
            const t = tagOf(x);
            if (t === "hp:cellSpan") {
              const a = attrsOf(x);
              colSpan = Number(a["@_colSpan"] ?? 1) || 1;
              rowSpan = Number(a["@_rowSpan"] ?? 1) || 1;
              return;
            }
            // 칸 너비 — 원본 열 비율을 살리기 위해 함께 보관한다(렌더에서 colgroup 으로).
            if (t === "hp:cellSz") {
              width = Number(attrsOf(x)["@_width"] ?? 0) || 0;
              return;
            }
            if (t === "hp:subList") return;
            for (const ch of childrenOf(x)) findSpan(ch);
          })(m);
          const nested = cellNestedTables(m).map(parseTable);
          const imgs = cellImages(m);
          const { text, boldRanges, diagramAt, tablesAt } = cellRich(m);
          // 칸 전체가 굵으면 구간 대신 플래그로 — 라벨 칸이 대부분이라 jsonb 가 짧아진다.
          const bodyLen = text.replace(/\n/g, "").length;
          const boldLen = boldRanges.reduce((a, [s, e]) => a + (e - s), 0);
          const allBold = bodyLen > 0 && boldLen >= bodyLen;
          rich.push({
            text,
            colSpan,
            rowSpan,
            ...(width > 0 ? { width } : {}),
            ...style,
            ...(allBold ? { bold: true } : boldRanges.length ? { boldRanges } : {}),
            ...(diagramAt != null ? { diagramAt } : {}),
            ...(nested.length ? { tables: nested } : {}),
            // 속표가 글 앞이나 중간에 있는 경우에만 자리를 남긴다(끝이면 기본 렌더와 같다).
            ...(nested.length &&
            tablesAt.length === nested.length &&
            tablesAt.some((v) => v < text.length)
              ? { tablesAt }
              : {}),
            ...(imgs.length ? { imgs } : {}),
          });
          return;
        }
        for (const c of childrenOf(m)) cw(c);
      })(n);
      cellRows.push(rich);
      return;
    }
    for (const c of childrenOf(n)) walk(c);
  })(tblNode);
  return cellRows;
}

// ── 문단 정보 ──
/**
 * 도형 프레임(표를 품은 hp:subList)의 **문서 순서** 를 그대로 뽑는다.
 * ★프레임 안에서 글과 표가 번갈아 나오는데(t44 구체적 예: 판례 소개 → 표 → 다음 판례 →
 *   표), 종전엔 글을 몰아서 먼저 내고 표를 뒤에 몰아 내어 순서가 무너졌다. t23 의 표 밑
 *   각주(*, **)는 아예 사라졌다 — 도형 글자로 취급돼 다이어그램 probe 로만 남았다
 *   (원장 지적 2026-08-22).
 */
function frameSequences(paraNode) {
  const hasTbl = (n) => {
    let f = false;
    (function s(x) { if (tagOf(x) === "hp:tbl") { f = true; return; } for (const c of childrenOf(x)) s(c); })(n);
    return f;
  };
  // ★프레임은 여러 겹으로 감싸여 있다 — 표를 품은 subList 가 바깥·안쪽에 겹쳐 있으면
  //   바깥쪽은 그냥 껍데기다. 다 모은 뒤 **가장 안쪽만** 남긴다(바깥 것을 쓰면 글 문단이
  //   "표를 품은 문단" 으로 잡혀 글이 사라진다 — t25 에서 실제로 그랬다).
  const candidates = [];
  (function w(node, inShape) {
    if (Array.isArray(node)) return node.forEach((x) => w(x, inShape));
    const tag = tagOf(node);
    // ★표 안으로는 내려가지 않는다 — 칸(hp:tc)의 subList 도 표를 품을 수 있어서,
    //   내려가면 속표가 프레임으로 잡혀 바깥 표에서 떨어져 나온다(r2-2 에서 실제로 그랬다).
    if (tag === "hp:tbl") return;
    if (tag === "hp:subList" && inShape && hasTbl(node)) {
      const ps = [];
      (function f(x) { if (tagOf(x) === "hp:p") { ps.push(x); return; } for (const c of childrenOf(x)) f(c); })(node);
      const items = [];
      const tables = new Set();
      const texts = [];
      for (const p of ps) {
        if (hasTbl(p)) {
          (function f(x) {
            if (tagOf(x) === "hp:tbl") { items.push({ type: "table", node: x }); tables.add(x); return; }
            for (const c of childrenOf(x)) f(c);
          })(p);
          continue;
        }
        const nodes = [];
        let t = "";
        (function tw(m, root) {
          const mt = tagOf(m);
          if (mt === "#text") { t += String(m["#text"] ?? ""); nodes.push(m); return; }
          if (mt === "hp:tbl" || SHAPE_TAGS.has(mt) || mt === "hp:shapeComment") return;
          if (!root && mt === "hp:p") return;
          for (const c of childrenOf(m)) tw(c, false);
        })(p, true);
        t = t.replace(/[ \t]+/g, " ").trim();
        if (!t) continue;
        items.push({ type: "p", text: t });
        texts.push(...nodes);
      }
      if (items.length) candidates.push({ items, tables, texts });
    }
    for (const c of childrenOf(node)) w(c, inShape || SHAPE_TAGS.has(tag));
  })(paraNode, false);

  // 같은 표를 감싼 후보가 여럿이면(껍데기 ⊃ 알맹이) 글을 더 많이 담은 안쪽 것만 남기고,
  // 다른 후보의 표를 통째로 품은 바깥 후보는 버린다. 안 그러면 같은 표가 두 번 실린다.
  const tid = new Map();
  const idsOf = (c) => [...c.tables].map((t) => { if (!tid.has(t)) tid.set(t, tid.size); return tid.get(t); }).sort((a, b) => a - b);
  const bySig = new Map();
  for (const c of candidates) {
    const sig = idsOf(c).join(",");
    const cur = bySig.get(sig);
    if (!cur || c.items.length > cur.items.length) bySig.set(sig, c);
  }
  const picked = [...bySig.values()];
  const inner = picked.filter(
    (c) => !picked.some((o) => o !== c && o.tables.size < c.tables.size && [...o.tables].every((t) => c.tables.has(t))),
  );
  const frames = inner.map((c) => c.items);
  const consumedText = new Set(inner.flatMap((c) => c.texts));
  const consumedTables = new Set(inner.flatMap((c) => [...c.tables]));
  return { frames, consumedText, consumedTables };
}

function paraInfo(p) {
  let plain = "";
  const shapeTexts = [];
  const tables = [];
  const shapeTables = []; // 도형 프레임 안에 중첩된 표 — 다이어그램 뒤에 별도 블록으로
  const pics = []; // 본문 그림 binId
  let shapeDraw = 0; // 도형 영역의 그리기 도형(선·타원·다각형…) 수
  let shapeLabeledRect = 0; // 글자를 품은 사각형(라벨 상자) 수
  const { frames, consumedText, consumedTables } = frameSequences(p);
  (function w(n, root, inShape) {
    const tag = tagOf(n);
    if (tag === "#text") {
      const s = String(n["#text"] ?? "");
      if (inShape) { if (s.trim() && !consumedText.has(n)) shapeTexts.push(s.trim()); }
      else plain += s;
      return;
    }
    if (tag === "hp:shapeComment") return; // 그림 캡션("그림입니다…") 제외
    if (tag === "hp:tbl") {
      if (!consumedTables.has(n)) (inShape ? shapeTables : tables).push(n);
      return;
    }
    if (inShape && DRAW_TAGS.has(tag)) shapeDraw++;
    if (inShape && tag === "hp:rect") {
      let labeled = false;
      (function f(m) {
        if (tagOf(m) === "hp:drawText") labeled = true;
        for (const c of childrenOf(m)) f(c);
      })(n);
      if (labeled) shapeLabeledRect++;
    }
    if (tag === "hp:pic") {
      const ref = attrsOf(n)["@_binaryItemIDRef"] ?? attrsOf(n)["@_BinaryItemIDRef"];
      if (ref) pics.push(ref);
      // pic 내부로 계속 (binData 자식에서 ref 를 얻는 경우)
    }
    const ref = attrsOf(n)["@_binaryItemIDRef"] ?? attrsOf(n)["@_BinaryItemIDRef"];
    if (ref && tag !== "hp:pic" && !inShape && !pics.includes(ref)) pics.push(ref);
    if (!root && tag === "hp:p" && !inShape) return;
    const nowShape = inShape || SHAPE_TAGS.has(tag);
    for (const c of childrenOf(n)) w(c, false, nowShape);
  })(p, true, false);
  return {
    plain: plain.replace(/[ \t]+/g, " ").trim(),
    shapeTexts, tables, shapeTables, pics, shapeDraw, shapeLabeledRect, frames,
  };
}

let section = null;
for (const n of tree) if (tagOf(n) === "hs:sec") section = n;
const paragraphs = [];
(function c(n) {
  if (tagOf(n) === "hp:p") { paragraphs.push(n); return; }
  for (const x of childrenOf(n)) c(x);
})(section);
const paras = paragraphs.map(paraInfo);
console.log("최상위 문단:", paras.length);

// ── 헤더 판정 ──
// 주제: 텍스트·표 없는 문단의 도형 텍스트가 정확히 [제목, 번호] 쌍이고, 번호가
//   전역 연번(직전+1)일 때만 인정 — 도해 다이어그램의 우연한 [글, 숫자] 조합 오탐 차단.
//   ("묶음 개체입니다." 그룹 캡션은 shapeComment 라 텍스트에서 제외됨)
let lastTopicNo = 0;
function topicHeaderOf(p) {
  if (p.plain || p.tables.length > 0 || p.shapeTables.length > 0) return null;
  const s = p.shapeTexts.filter((t) => t.length > 0);
  if (s.length < 2 || s.length > 5) return null;
  const nums = s.filter((t) => /^\d{1,2}$/.test(t));
  // 제목이 여러 run 으로 쪼개진 헤더 존재 — ["특허권의 침해","(法 97, …)","45"].
  // 숫자 아닌 조각을 순서대로 결합("(" 시작이면 붙여쓰기)해 제목 복원.
  const frags = s.filter((t) => !/^\d{1,2}$/.test(t));
  if (nums.length !== 1 || frags.length === 0) return null;
  const no = Number(nums[0]);
  if (no !== lastTopicNo + 1) return null;
  let title = "";
  for (const f of frags) title += title && !/^[()~,]/.test(f) ? ` ${f}` : f;
  title = title.replace(/\s+\)/g, ")").replace(/\(\s+/g, "(").trim();
  if (ROMAN.test(title) || title.length < 2) return null;
  return { no, title };
}
// 참고자료: 아이콘 그림 + 같은 문단 "N.M 제목" 텍스트.
// ★제8장 참고자료는 장에 하나뿐이라 가지번호 없이 "8 제목" 으로 적혀 있다. 소수점을
//   강제하던 종전 정규식이 이걸 흘려, 「참고 8 우리나라 특허법 규정에 반영된 특허협력
//   조약(PCT)」한 장이 통째로 누락됐다(원장 지적 2026-08-22 "원본에서 찾아서 붙이기").
function refHeaderOf(p) {
  if (p.pics.length === 0) return null;
  const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(p.plain);
  if (!m) return null;
  return { refNo: m[1], title: m[2].trim() };
}
// 간지(장 표지): 사이드바 도형에 "묶음 개체" 없이 다수 주제 텍스트 + 그림 문단.
const COVER_RE = /간지.*도해특허법.*-(\d{2})\.png/;
function coverOf(p, node) {
  // 캡션은 shapeComment 로 제외했으므로 원본 텍스트에서 직접 탐지
  let cap = "";
  (function w(n) {
    if (tagOf(n) === "#text") { cap += String(n["#text"] ?? ""); return; }
    for (const c of childrenOf(n)) w(c);
  })(node);
  const m = COVER_RE.exec(cap);
  return m ? { chapterNo: Number(m[1]) } : null;
}

// ── 장 제목 — PDF 러닝헤더("제N장 ○○ · 쪽")에서 추출(매핑 단계에서 채움) ──
const CHAPTER_TITLES = {};

// ── 순회: 장/주제/참고자료 경계 + 블록 수집 ──
const chapters = [];
const units = [];
let curChapter = 0;
let curUnit = null;

function pushBlock(b) {
  if (curUnit) curUnit.blocks.push(b);
}

// ── 표가 사실은 그림인가 ────────────────────────────────────────────────────

function drawingScore(node) {
  let draw = 0;
  let labeledRect = 0;
  (function w(n) {
    const tag = tagOf(n);
    if (DRAW_TAGS.has(tag)) draw++;
    if (tag === "hp:rect") {
      let labeled = false;
      (function f(m) {
        if (tagOf(m) === "hp:drawText") labeled = true;
        for (const c of childrenOf(m)) f(c);
      })(n);
      if (labeled) labeledRect++;
    }
    for (const c of childrenOf(n)) w(c);
  })(node);
  return { draw, labeledRect };
}

/** 표의 최상위 행(hp:tr) — parseTable 의 cellRows 와 같은 순서·개수여야 한다. */
function topRows(tblNode) {
  const rows = [];
  (function walk(n) {
    if (tagOf(n) === "hp:tr") {
      rows.push(n);
      return;
    }
    for (const c of childrenOf(n)) walk(c);
  })(tblNode);
  return rows;
}

/** 표의 최상위 칸(hp:tc) 노드 — parseTable 의 cells 와 행·열 순서가 같다. */
function topCellNodes(tblNode) {
  return topRows(tblNode).map((tr) => {
    const cells = [];
    (function walk(n) {
      if (tagOf(n) === "hp:tc") {
        cells.push(n);
        return;
      }
      for (const c of childrenOf(n)) walk(c);
    })(tr);
    return cells;
  });
}

/**
 * 이 칸 안에 **그림**이 그려져 있는가.
 * ★칸에서는 라벨 상자 개수를 쓰지 않는다 — 교재는 「A + B + C」 같은 짧은 식을 글자마다
 *   상자에 담아 조판한다(t45 침해 유형별 검토). 그건 그림이 아니라 글이라 아래
 *   shapeBoxText 로 글을 되살린다.
 */
function cellIsDrawing(tcNode) {
  return drawingScore(tcNode).draw > 0;
}

/**
 * 그리기 도형 없이 **글상자만** 놓인 칸의 글 — 상자 좌표(hp:offset)로 읽기 순서를 복원한다.
 * 도형 순서 그대로 이으면 "+A+BC" 가 된다(원본은 「A + B + C」).
 */
function shapeBoxText(tcNode) {
  const items = [];
  (function w(n, ox, oy) {
    const tag = tagOf(n);
    if (tag === "hp:shapeComment" || tag === "hp:tbl") return;
    let x = ox;
    let y = oy;
    if (SHAPE_TAGS.has(tag)) {
      const off = childrenOf(n).find((c) => tagOf(c) === "hp:offset");
      const a = attrsOf(off ?? {});
      x += Number(a["@_x"] ?? 0) || 0;
      y += Number(a["@_y"] ?? 0) || 0;
    }
    if (tag === "hp:drawText") {
      let t = "";
      (function tw(m) {
        if (tagOf(m) === "#text") { t += String(m["#text"] ?? ""); return; }
        for (const c of childrenOf(m)) tw(c);
      })(n);
      t = t.replace(/\s+/g, " ").trim();
      if (t) items.push({ x, y, t });
      return;
    }
    for (const c of childrenOf(n)) w(c, x, y);
  })(tcNode, 0, 0);
  if (items.length === 0) return "";
  // 같은 줄(세로 차 900 이내 = 약 0.3cm) 끼리 묶어 x 순으로 잇는다.
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= 900) last.parts.push(it);
    else lines.push({ y: it.y, parts: [it] });
  }
  return lines
    .map((ln) => {
      ln.parts.sort((a, b) => a.x - b.x);
      let s = "";
      ln.parts.forEach((p, i) => {
        if (i === 0) { s = p.t; return; }
        const prev = ln.parts[i - 1].t;
        // 한두 글자짜리 조각(A, +, C')끼리는 붙여 쓴다 — 식이기 때문이다.
        s += prev.length <= 2 && p.t.length <= 2 ? p.t : ` ${p.t}`;
      });
      return s;
    })
    .join("\n");
}

function tableIsDrawing(node, cells) {
  const { draw, labeledRect } = drawingScore(node);
  if (draw > 0 || labeledRect >= LABELED_RECT_MIN) return true;
  const flat = cells.flat();
  if (!flat.length) return true;
  // ★중첩 표를 품은 칸은 "빈 칸"이 아니다 — 내용이 자식 표에 있을 뿐이다.
  //   이걸 빠뜨려서 참고 1.2 「분류」(바깥 1칸 안에 표 6개)가 그림으로 분류돼
  //   글표가 이미지로 바뀌었다(원장 지적 2026-08-22).
  const isEmpty = (c) =>
    !String(c.text ?? "").trim() && !(c.tables?.length > 0);
  const empty = flat.filter(isEmpty).length;
  return empty / flat.length >= EMPTY_CELL_RATIO;
}

/**
 * 그림이 글보다 **앞에** 몰려 있는가.
 * ★글 사이에 그림이 끼어 있으면 가르면 안 된다 — 크롭은 세로 구간이라 그림 사이의 글까지
 *   이미지에 들어가고, 그 글을 텍스트로도 내보내면 화면에 두 번 나온다(7 기일과 기간의
 *   예1~예3 이 그렇다). 그럴 땐 종전대로 통째로 그림.
 */
function shapesComeFirst(node) {
  const seq = [];
  (function w(n, inShape) {
    const tag = tagOf(n);
    if (tag === "hp:shapeComment") return;
    if (tag === "#text") {
      const s = String(n["#text"] ?? "").trim();
      if (s) seq.push(inShape ? "S" : "T");
      return;
    }
    const now = inShape || SHAPE_TAGS.has(tag);
    for (const c of childrenOf(n)) w(c, now);
  })(node, false);
  const firstText = seq.indexOf("T");
  return firstText < 0 || !seq.slice(firstText).includes("S");
}

/** 도형 안 글자만 — 그림/글을 가를 때 그림 쪽 probe 로 쓴다. */
function shapeTextsIn(node) {
  const out = [];
  (function w(n, inShape) {
    const tag = tagOf(n);
    if (tag === "hp:shapeComment") return;
    if (tag === "#text") {
      if (!inShape) return;
      const s = String(n["#text"] ?? "").trim();
      if (s) out.push(s);
      return;
    }
    const now = inShape || SHAPE_TAGS.has(tag);
    for (const c of childrenOf(n)) w(c, now);
  })(node, false);
  return [...new Set(out)]
    .filter((t) => t.length >= 2 && !/묶음 개체/.test(t))
    .slice(0, 12);
}

/** 크롭 스크립트의 페이지 매칭 probe — 도형 안 글자(drawText)까지 포함해 긁는다. */
function allTextsIn(node) {
  const out = [];
  (function w(n) {
    const tag = tagOf(n);
    if (tag === "#text") {
      const s = String(n["#text"] ?? "").trim();
      if (s) out.push(s);
      return;
    }
    if (tag === "hp:shapeComment") return;
    for (const c of childrenOf(n)) w(c);
  })(node);
  return [...new Set(out)].filter((t) => t.length >= 3).slice(0, 12);
}

for (let i = 0; i < paras.length; i++) {
  const p = paras[i];
  const cover = coverOf(p, paragraphs[i]);
  if (cover) {
    curChapter = cover.chapterNo;
    // 사이드바 주제 목록(숫자|제목 교차) — 기대값 검증용
    const sidebar = [];
    for (let k = 0; k < p.shapeTexts.length; k++) {
      const num = p.shapeTexts[k];
      if (/^\d{1,2}$/.test(num) && p.shapeTexts[k + 1] && !/^\d{1,2}$/.test(p.shapeTexts[k + 1])) {
        sidebar.push({ no: Number(num), title: p.shapeTexts[k + 1] });
      }
    }
    chapters.push({ no: curChapter, title: CHAPTER_TITLES[curChapter] ?? "", sidebarTopics: sidebar });
    curUnit = null; // 간지 이후 첫 헤더까지 버림
    continue;
  }
  const th = topicHeaderOf(p);
  if (th) {
    lastTopicNo = th.no;
    curUnit = { kind: "topic", chapter: curChapter, no: th.no, title: th.title, blocks: [] };
    units.push(curUnit);
    continue;
  }
  const rh = refHeaderOf(p);
  if (rh) {
    curUnit = { kind: "reference", chapter: curChapter, refNo: rh.refNo, title: rh.title, blocks: [] };
    units.push(curUnit);
    continue;
  }
  // 후미 자료(저자 소개·판권지)는 어느 주제에도 속하지 않는다. 종전엔 문서 끝까지
  // 마지막 주제(81 특허법과 실용신안법의 비교)에 붙어, 발행일·인쇄소 표가 본문 표로
  // 딸려 들어갔다(원장 신고 2026-08-17).
  if (p.plain && p.plain.replace(/\s/g, "") === "저자소개") {
    console.log(`후미 자료 시작('저 자 소 개') — 문단 ${i} 이후 수집 중단`);
    break;
  }
  if (!curUnit) continue;

  const badge = p.shapeTexts.find((t) => ROMAN.test(t));
  const nonBadgeShapes = p.shapeTexts.filter((t) => !ROMAN.test(t) && !/묶음 개체/.test(t));
  if (p.plain && badge && p.tables.length === 0) {
    pushBlock({ type: "h", numeral: badge, text: p.plain });
  } else if (p.plain && !/^\d{2}$/.test(p.plain)) {
    pushBlock({ type: "p", text: p.plain });
  }
  if (p.pics.length > 0) pushBlock({ type: "image", binIds: p.pics });
  // ★그림이 하나도 없는 도형 상자는 다이어그램이 아니다 — 글상자다.
  //   종전엔 도형 텍스트만 있으면 무조건 diagram 으로 잡아, 해설 글상자까지 PDF 크롭
  //   대상이 됐다. 그런 블록은 크롭 좌표가 잡히지 않아 페이지 전체를 긁어오고, 결국
  //   앞 절의 표까지 이미지에 들어간다(t44·t68·t79 — 2026-08-21 원장이 본 중복의 정체).
  //   글상자는 글로 내보낸다 — 텍스트라 하이라이트·포스트잇도 그대로 붙는다.
  if (nonBadgeShapes.length > 0) {
    if (p.shapeDraw > 0 || p.shapeLabeledRect >= LABELED_RECT_MIN) {
      pushBlock({ type: "diagram", texts: nonBadgeShapes });
    } else {
      pushBlock({ type: "p", text: nonBadgeShapes.join("\n") });
    }
  }
  // 도형 프레임 안 내용은 **원본 순서대로** — 글·표가 번갈아 나온다.
  for (const items of p.frames)
    for (const it of items) {
      if (it.type === "p") pushBlock({ type: "p", text: it.text });
      else pushTable(it.node, true);
    }
  for (const t of p.shapeTables) pushTable(t, true);
  for (const t of p.tables) pushTable(t, false);

  // ★표 칸 안에 그려진 그림은 HTML 로 옮길 수 없다 — 표로 내보내면 화면에서 그림이 통째로
  //   사라진다(원장 보고 2026-08-21: 참고 1.2 Ⅲ · 7 Ⅴ 기간의 계산 사례 · 참고 3.1).
  //   종전 파서는 **도형에 글자가 있을 때만** diagram 을 만들었고(`nonBadgeShapes.length > 0`),
  //   표 안으로는 아예 내려가지 않아 그림이 어디에도 안 잡혔다.
  //   → 그림을 품은 표는 표 대신 **다이어그램(PDF 크롭)** 으로 내보낸다. 표+그림이 한 상자에
  //     섞여 있으면 쪼갤 수 없으므로 상자째 이미지로 가는 게 맞다(하이브리드 원칙의 그림 쪽).
  //   실측(표 255개): 그림 없는 표 247 · 그림 품은 표 8 — 경계가 뚜렷해 오분류 여지가 작다.
  /**
   * 조문 박스(한 칸짜리 표)에서 조와 조 사이를 한 줄 띄운다.
   * ★원고는 조 사이 빈 줄을 넣은 곳도 있고 안 넣은 곳도 있다(t07 은 있고 t08·t20 은 없다).
   *   화면에서는 조가 붙어 나와 어디서 끊기는지 안 보인다(원장 지시 2026-08-22).
   *   글자 오프셋이 밀리므로 boldRanges·diagramAt·tablesAt 도 같이 옮긴다.
   */
  function spaceOutArticles(cell) {
    const text = String(cell.text ?? "");
    const re = /(?:^|\n)((?:[가-힣]{2,8}법\s*)?제\d+조(?:의\d+)?\s*【)/g;
    const heads = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      heads.push(m.index + (text[m.index] === "\n" ? 1 : 0));
      re.lastIndex = m.index + 1;
    }
    if (heads.length < 2) return;
    const cuts = heads.filter((at) => at > 0 && text[at - 2] !== "\n");
    if (cuts.length === 0) return;
    let out = "";
    let prev = 0;
    for (const c of cuts) { out += `${text.slice(prev, c - 1)}\n\n`; prev = c; }
    cell.text = out + text.slice(prev);
    const shift = (p) => p + cuts.filter((c) => c <= p).length;
    if (cell.boldRanges) cell.boldRanges = cell.boldRanges.map(([s, e]) => [shift(s), shift(e)]);
    if (cell.diagramAt != null) cell.diagramAt = shift(cell.diagramAt);
    if (cell.tablesAt) cell.tablesAt = cell.tablesAt.map(shift);
  }

  /**
   * 조문 비교표(한 행에 좌우로 조문 원문을 나란히 둔 표)의 **조문 제목 줄을 굵게** 맞춘다.
   * ★원고가 표마다 제각각이다 — t41·t71 은 제목이 굵고 t48 은 굵지 않다. 화면에서는 어디가
   *   조문 경계인지 안 보인다(원장 지시 2026-08-22 "제목은 볼드로 표시하기 · 조문비교는
   *   모두 동일하니 전수검사").
   */
  function boldArticleTitles(cells) {
    const ART_TITLE = /^(?:[가-힣]{2,8}법\s*)?제\d+조(?:의\d+)?\s*【[^\n】]*】/;
    const rows = cells.filter(
      (row) => row.filter((c) => ART_TITLE.test(String(c.text ?? ""))).length >= 2,
    );
    if (rows.length === 0) return;
    for (const row of cells)
      for (const c of row) {
        const m = ART_TITLE.exec(String(c.text ?? ""));
        if (!m) continue;
        const end = m[0].length;
        const ranges = c.boldRanges ?? [];
        if (c.bold || ranges.some(([s, e]) => s <= 0 && e >= end)) continue;
        c.boldRanges = [[0, end], ...ranges.filter(([s]) => s >= end)].sort((a, b) => a[0] - b[0]);
      }
  }

  /**
   * 조문 비교표의 좌우를 **항의 소제목끼리** 같은 줄에서 시작하게 맞춘다.
   *
   * ★교재는 오른쪽 칸에 빈 문단을 7개씩 넣어 이 줄맞춤을 만든다(제90조 ⑥ 출원서의 보정 ↔
   *   제92조의3 ④ 출원서의 보정). 화면은 글꼴 크기가 바뀌므로 빈 줄로는 맞출 수 없다 —
   *   항을 표의 행으로 쪼개 브라우저가 맞추게 한다(원장 보고 2026-08-22 "제89조의 제2항과
   *   제92조의2 제2항이 시작줄이 일치해야 해").
   * 짝짓기는 소제목 문자열의 최장공통부분수열(LCS) — 한쪽에만 있는 항은 반대쪽을 비운다.
   */
  function alignArticleComparison(cells) {
    const ART_TITLE = /^(?:[가-힣]{2,8}법\s*)?제\d+조(?:의\d+)?\s*【[^\n】]*】/;
    const HANG = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫])\s*(?:\(([^)]{1,20})\))?/;
    const isArt = (c) => ART_TITLE.test(String(c.text ?? ""));
    if (cells.filter((row) => row.filter(isArt).length >= 2).length === 0) return cells;

    // 칸 글을 [제목, 항, 항 …] 으로 나눈다. 굵게 구간도 함께 옮긴다.
    const split = (c) => {
      const lines = String(c.text ?? "").split("\n");
      const segs = [];
      let at = 0;
      for (const line of lines) {
        const start = at;
        at += line.length + 1; // 개행 포함
        if (!line.trim()) continue; // 줄맞춤용 빈 문단은 버린다 — 행으로 맞추기 때문
        if (segs.length === 0 || HANG.test(line.trim())) segs.push({ from: start, lines: [] });
        segs[segs.length - 1].lines.push({ text: line, from: start });
      }
      return segs.map((s) => {
        const text = s.lines.map((l) => l.text).join("\n");
        // 원본 오프셋 → 이 조각 안 오프셋
        const map = [];
        let cur = 0;
        for (const l of s.lines) {
          map.push({ from: l.from, to: l.from + l.text.length, shift: cur - l.from });
          cur += l.text.length + 1;
        }
        const ranges = [];
        for (const [rs, re] of c.boldRanges ?? [])
          for (const m of map) {
            const lo = Math.max(rs, m.from);
            const hi = Math.min(re, m.to);
            if (hi > lo) ranges.push([lo + m.shift, hi + m.shift]);
          }
        const head = HANG.exec(s.lines[0].text.trim());
        // 짝짓기 열쇠 — 소제목에서 ":" 뒤 갈래("연장기간: 일반")를 떼어 같은 소제목끼리
        // 맞춘다. 소제목이 없는 항은 항 번호로 맞춘다.
        const label = head?.[2] ?? null;
        return {
          text,
          ranges,
          key: label ? label.replace(/[:：].*$/, "").replace(/\s+/g, "") : head ? `#${head[1]}` : null,
        };
      });
    };

    /**
     * 소제목이 같은 항을 기준점(LCS)으로 삼고, 기준점 사이에 남은 항들은 **순서대로** 짝짓는다.
     * ★소제목만으로 맞추면 이름이 서로 다른 첫 항이 어긋난다 — t71 은 왼쪽이 「(요건)」,
     *   오른쪽이 「(주체적 및 객체적 요건)」이라 ①끼리 안 붙었다(원장 보고 2026-08-22).
     *   순서 짝짓기를 덧붙이면 ①↔①·②↔②가 맞고, 한쪽에만 있는 항은 그대로 비워 둔다.
     */
    const lcs = (a, b) => {
      const n = a.length, m = b.length;
      const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
      for (let i = n - 1; i >= 0; i--)
        for (let j = m - 1; j >= 0; j--)
          dp[i][j] = a[i] && b[j] && a[i] === b[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
      // 1) 소제목이 같은 자리(기준점)만 뽑는다.
      const anchors = [];
      {
        let i = 0, j = 0;
        while (i < n && j < m) {
          if (a[i] && b[j] && a[i] === b[j]) { anchors.push([i, j]); i++; j++; }
          else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
          else j++;
        }
      }
      // 2) 기준점 사이의 남은 항들을 순서대로 맞춘다.
      const pairs = [];
      let i = 0, j = 0;
      for (const [mi, mj] of [...anchors, [n, m]]) {
        const lg = [];
        const rg = [];
        while (i < mi) lg.push(i++);
        while (j < mj) rg.push(j++);
        for (let k = 0; k < Math.max(lg.length, rg.length); k++)
          pairs.push([lg[k] ?? null, rg[k] ?? null]);
        if (mi < n) { pairs.push([mi, mj]); i = mi + 1; j = mj + 1; }
      }
      return pairs;
    };

    const out = [];
    for (const row of cells) {
      const artAt = row.map((c, i) => (isArt(c) ? i : -1)).filter((i) => i >= 0);
      if (artAt.length !== 2) { out.push(row); continue; }
      const [li, ri] = artAt;
      const L = split(row[li]);
      const R = split(row[ri]);
      const pairs = [[0, 0], ...lcs(L.slice(1).map((s) => s.key), R.slice(1).map((s) => s.key))
        .map(([a, b]) => [a === null ? null : a + 1, b === null ? null : b + 1])];
      if (pairs.length <= 1) { out.push(row); continue; }
      const mk = (src, seg, last, first) => ({
        ...src,
        text: seg ? seg.text : "",
        rowSpan: 1,
        ...(seg?.ranges.length ? { boldRanges: seg.ranges } : { boldRanges: undefined }),
        ...(first ? {} : { contRow: true }),
        ...(last ? {} : { contMore: true }),
      });
      pairs.forEach(([a, b], k) => {
        const first = k === 0;
        const last = k === pairs.length - 1;
        const newRow = [];
        if (first)
          row.forEach((c, i) => {
            if (i === li || i === ri) return;
            newRow.push({ ...c, rowSpan: (c.rowSpan ?? 1) * pairs.length });
          });
        newRow.push(mk(row[li], a === null ? null : L[a], last, first));
        newRow.push(mk(row[ri], b === null ? null : R[b], last, first));
        out.push(newRow);
      });
    }
    return out;
  }

  function pushTable(node, fromShape) {
    let cells = parseTable(node);
    if (cells.length === 1 && cells[0].length === 1) spaceOutArticles(cells[0][0]);
    boldArticleTitles(cells);
    cells = alignArticleComparison(cells);
    // ★그림이 **일부 칸에만** 있으면 표를 살리고 그 칸에만 그림을 넣는다.
    //   표를 통째로 이미지로 바꾸면 수험생이 하이라이트·포스트잇을 못 붙인다
    //   (원장 지시 2026-08-22 "표 안에 그림이 있으면 표를 살려야 해").
    //   칸 크롭 좌표는 crop-diagrams.mjs 가 그 칸의 도형 글자로 잡는다.
    {
      const nodes = topCellNodes(node);
      const shaped = nodes.length === cells.length &&
        nodes.every((row, ri) => row.length === cells[ri].length);
      if (shaped) {
        // (1) 글상자만 놓인 칸 → 도형 글을 칸 글로 되살린다(t45 「A + B + C」).
        let restored = 0;
        nodes.forEach((row, ri) =>
          row.forEach((tc, ci) => {
            const s = drawingScore(tc);
            if (s.draw > 0 || s.labeledRect === 0) return;
            if (String(cells[ri][ci].text ?? "").trim()) return;
            const t = shapeBoxText(tc);
            if (!t) return;
            cells[ri][ci].text = t;
            restored++;
          }),
        );
        // (2) 진짜 그림이 그려진 칸 세기
        let drawn = 0;
        let textOnly = 0;
        nodes.forEach((row, ri) =>
          row.forEach((tc, ci) => {
            if (cellIsDrawing(tc)) drawn++;
            else if (String(cells[ri][ci].text ?? "").trim() || cells[ri][ci].tables?.length)
              textOnly++;
          }),
        );
        const keepTable = () =>
          pushBlock(
            fromShape
              ? { type: "table", fromShape: true, cells }
              : { type: "table", cells },
          );
        // 그림 칸과 글 칸이 함께 있을 때만 — 전부 그림이면 가를 게 없다(종전대로 통째 이미지).
        if (drawn > 0 && textOnly > 0) {
          nodes.forEach((row, ri) =>
            row.forEach((tc, ci) => {
              if (!cellIsDrawing(tc)) return;
              cells[ri][ci].diagram = true;
              cells[ri][ci].diagramTexts = shapeTextsIn(tc);
              if (process.env.DOHAE_DEBUG_CELLS) {
                const s = drawingScore(tc);
                console.log(`  [칸그림] ${curUnit?.no ?? curUnit?.refNo} r${ri}c${ci} draw=${s.draw} rect=${s.labeledRect} texts=${JSON.stringify(shapeTextsIn(tc)).slice(0, 120)}`);
              }
            }),
          );
          keepTable();
          return;
        }
        // 그림은 없고 글상자만 있던 표 — 이제 글로 다 찼으니 표 그대로.
        if (drawn === 0 && restored > 0 && textOnly > 0) {
          if (process.env.DOHAE_DEBUG_CELLS)
            console.log(`  [글상자복원] ${curUnit?.no ?? curUnit?.refNo} ${restored}칸`);
          keepTable();
          return;
        }
      }
    }
    if (tableIsDrawing(node, cells)) {
      // ★그림과 글이 한 표에 섞여 있으면 통째로 이미지로 보내지 않는다 — 글이 이미지가 되면
      //   검색·하이라이트를 잃는다(원장 지시 2026-08-22: "그림 삽입 외에 나머지는 텍스트로").
      //   그림 행이 **앞쪽에 몰려 있을 때만** 그림/글로 가른다. 중간에 끼어 있으면 순서가
      //   뒤집히므로 종전대로 통째로 그림.
      const rows = topRows(node);
      if (rows.length === cells.length && rows.length > 1) {
        const drawRow = rows.map((r) => {
          const { draw, labeledRect } = drawingScore(r);
          return draw > 0 || labeledRect >= LABELED_RECT_MIN;
        });
        const lastDraw = drawRow.lastIndexOf(true);
        const firstDraw = drawRow.indexOf(true);
        const textAfter = cells
          .slice(lastDraw + 1)
          .filter((row) => row.some((c) => String(c.text ?? "").trim() || c.tables?.length));
        if (firstDraw === 0 && lastDraw >= 0 && textAfter.length > 0) {
          pushBlock({
            type: "diagram",
            fromTable: true,
            texts: allTextsIn({ [tagOf(rows[0])]: rows.slice(0, lastDraw + 1).flatMap(childrenOf) }),
          });
          pushBlock(
            fromShape
              ? { type: "table", fromShape: true, cells: cells.slice(lastDraw + 1) }
              : { type: "table", cells: cells.slice(lastDraw + 1) },
          );
          return;
        }
      }
      // ★한 칸 안에 그림 + 글 + 속표가 다 들어 있는 경우(참고 1.2 Ⅲ) — 행으로는 못 가른다.
      //   칸 안을 갈라 그림만 이미지로 내고, 글과 속표는 그대로 텍스트로 낸다.
      const rows0 = topRows(node);
      const flatCells = cells.flat();
      if (rows0.length === 1 && flatCells.length === 1) {
        const only = flatCells[0];
        const prose = String(only.text ?? "").trim();
        const nested = only.tables ?? [];
        const shapeOnly = shapeTextsIn(node);
        if (shapeOnly.length > 0 && (prose || nested.length > 0) && shapesComeFirst(node)) {
          pushBlock({ type: "diagram", fromTable: true, texts: shapeOnly });
          if (prose) pushBlock({ type: "p", text: prose });
          for (const t of nested) pushBlock({ type: "table", cells: t });
          return;
        }
      }
      pushBlock({ type: "diagram", fromTable: true, texts: allTextsIn(node) });
      return;
    }
    pushBlock(
      fromShape
        ? { type: "table", fromShape: true, cells }
        : { type: "table", cells },
    );
  }
}

// ── 조문 참조 파싱 ──
// "(法 20~24, 78, 164)" / "(발진법 2, 10~19, 58)" / "(法 3② 및 5)" / "(法 132의2~132의15)"
const LAW_NAME = { 法: "patent", 발진법: "invention_promotion", 실용신안법: "utility_model" };
function parseLawRefs(title) {
  const refs = [];
  const groupRe = /\(((?:法|발진법|실용신안법)[^)]*)\)/g;
  let g;
  while ((g = groupRe.exec(title)) !== null) {
    const body = g[1];
    const lawM = /^(法|발진법|실용신안법)\s*/.exec(body);
    const law = LAW_NAME[lawM[1]];
    const rest = body.slice(lawM[0].length);
    const tokens = rest.split(/[,、]|\s및\s/).map((t) => t.trim()).filter(Boolean);
    const articles = [];
    for (const tok0 of tokens) {
      // ★항·호 표시(①②…)를 먼저 걷어낸다. 종전엔 범위 정규식이 "~" 바로 앞의 숫자만
      //   보게 돼 있어 "5②~10" 이 "5" 하나로 잘렸다 — 제6~10조가 통째로 누락
      //   (t04 대리인이 3·5·12 만 연결됨. 원장 신고 2026-08-17).
      const tok = tok0.replace(/[①-⑳㉑-㉟㊱-㊿]/g, "");
      // 범위는 전개하지 않고 원형 보존("20~24"·"215~224의5") — 해소 단계(resolve-articles)가
      // DB 조문 목록 기반으로 전개한다(범위 안 "103의2" 같은 곁가지 조문 포함 목적).
      // ★범위 기호는 물결표만이 아니다 — 교재는 붙임표도 쓴다("法 16, 28-28의5").
      //   물결표만 받으면 "28-28의5" 가 "28" 하나로 잘려 제28조의2~5 가 통째로 빠진다
      //   (t08 특허에 관한 절차 일반. 원장 신고 2026-09-05 — 2026-08-17 의 "5②~10" 과 같은 계열).
      const range = /^(\d+(?:의\d+)?)\s*[~\-–—∼]\s*(\d+(?:의\d+)?)/.exec(tok);
      if (range) { articles.push(`${range[1]}~${range[2]}`); continue; }
      const single = /^(\d+(?:의\d+)?)/.exec(tok);
      if (single) articles.push(single[1]);
    }
    if (articles.length > 0) refs.push({ law, articles, raw: body });
  }
  // 폴백: "(法 …)" 그룹이 없고 제목이 "제29조(…)과 제36조(…)" 처럼 조문을 직접 들면 특허법으로.
  if (refs.length === 0) {
    const arts = [...title.matchAll(/제(\d+(?:의\d+)?)조/g)].map((m) => m[1]);
    if (arts.length > 0) refs.push({ law: "patent", articles: [...new Set(arts)], raw: title });
  }
  return refs;
}
for (const u of units) u.lawRefs = parseLawRefs(u.title);

// ── 검증 1: 간지 사이드바 목록 vs 실제 파싱된 주제 ──
let sidebarMismatch = 0;
for (const ch of chapters) {
  const got = units.filter((u) => u.kind === "topic" && u.chapter === ch.no).map((u) => u.no).sort((a, b) => a - b);
  const want = ch.sidebarTopics.map((t) => t.no).sort((a, b) => a - b);
  // 사이드바는 제목 선행형(숫자 미검출) 장이 있어 부분 목록일 수 있음 — 누락만 경고.
  const missing = want.filter((n) => !got.includes(n));
  if (missing.length) {
    sidebarMismatch++;
    console.log(`⚠ 제${ch.no}장 주제 누락 — 사이드바 기대 [${missing}]`);
  }
}

// ── 원고 정정 ────────────────────────────────────────────────────────────────
// ★DB 를 직접 고치면 안 된다 — 재파싱·동기화가 원고 그대로 되돌려 놓는다(2026-08-22에
//   실제로 되돌아갔다). 원고(hwpx)와 인쇄본이 다른 곳은 여기에 적어 파싱 직후 고친다.
const CORRECTIONS = [
  {
    unit: "t02",
    why: "원고에 사건번호가 두 번 들어갔다. ③ 은 인쇄본에 사건번호가 없다(원장 확인 2026-08-22).",
    replace: [
      ["大判 98후27098후270", "大判 98후270"],
      ["大判 2000후22482000후2248", "大判 2000후2248"],
      ["×(大判 2000후2248法 36④)", "×(法 36④)"],
    ],
    // 「관련문제」 칸의 굵게 해제(원장 지시)는 별도 정정이 필요 없다 — 칸 단위 bold 를
    // 구간 단위(boldRanges)로 바꾸면서 속표의 굵기가 부모 칸으로 번지지 않게 됐다.
  },
  {
    unit: "t68",
    why: "인쇄본은 사례 표(정정 전/후 명세서)가 먼저고 【해 설】이 그 아래다. 원고는 글상자와 표가 서로 다른 도형이라 문서 순서로는 순서를 알 수 없다(원장 지시 2026-08-22).",
    swapWithNextTable: ["해 설"],
  },
];

{
  const keyOf = (u) =>
    u.kind === "topic" ? `t${String(u.no).padStart(2, "0")}` : `r${u.refNo.replace(".", "-")}`;
  for (const fix of CORRECTIONS) {
    const u = units.find((x) => keyOf(x) === fix.unit);
    if (!u) throw new Error(`정정 대상 유닛 없음: ${fix.unit}`);
    let hits = 0;
    for (const b of u.blocks) {
      for (const row of b.cells ?? []) {
        for (const c of row) {
          for (const [from, to] of fix.replace ?? []) {
            if (typeof c.text === "string" && c.text.includes(from)) {
              c.text = c.text.split(from).join(to);
              hits++;
            }
          }
        }
      }
    }
    for (const t of fix.unbold ?? []) {
      const c = u.blocks[t.block]?.cells?.[t.row]?.[t.col];
      if (!c) throw new Error(`정정 대상 칸 없음: ${fix.unit} b${t.block} r${t.row} c${t.col}`);
      delete c.bold;
      delete c.boldRanges;
      hits++;
    }
    // 글 블록과 바로 뒤 표의 자리를 맞바꾼다(원고의 도형 순서가 인쇄본과 다른 경우).
    for (const prefix of fix.swapWithNextTable ?? []) {
      const i = u.blocks.findIndex(
        (b) => b.type === "p" && String(b.text ?? "").startsWith(prefix),
      );
      if (i < 0 || u.blocks[i + 1]?.type !== "table")
        throw new Error(`정정 대상 없음(swapWithNextTable): ${fix.unit} "${prefix}"`);
      const [p] = u.blocks.splice(i, 1);
      u.blocks.splice(i + 1, 0, p);
      hits++;
    }
    if (hits === 0) throw new Error(`정정이 하나도 적용되지 않음: ${fix.unit} — 원고가 바뀐 듯`);
    console.log(`정정 ${fix.unit}: ${hits}건`);
  }
}

// ── 검증 2: 통계 ──
const stats = { topics: 0, references: 0, blocks: 0, tables: 0, cells: 0, chars: 0, diagrams: 0, images: 0, emptyUnits: [] };
for (const u of units) {
  stats[u.kind === "topic" ? "topics" : "references"]++;
  stats.blocks += u.blocks.length;
  if (u.blocks.length === 0) stats.emptyUnits.push(`${u.chapter}-${u.no ?? u.refNo} ${u.title}`);
  for (const b of u.blocks) {
    if (b.type === "table") {
      stats.tables++;
      const flat = b.cells.flat();
      stats.cells += flat.length;
      stats.chars += flat.reduce((a, c) => a + c.text.length, 0);
    }
    if (b.type === "diagram") stats.diagrams++;
    if (b.type === "image") stats.images++;
  }
}

// ── PDF 페이지 매핑 ──
// 본문 페이지의 주제 헤더는 "제목 … 번호" 순(사이드바는 "번호 제목" 순) — 이 순서로 구분.
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const doc = await getDocument({ data: new Uint8Array(readFileSync(PDF)), useSystemFonts: true }).promise;
const pageTexts = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  pageTexts.push(tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " "));
}
console.log("PDF 텍스트 추출:", pageTexts.length, "페이지");

let cursor = 35; // 본문 시작(제1장 간지) 이전은 목차·머리말
let unmapped = 0;
const ns = (s) => s.replace(/\s+/g, "");
const pageNs = pageTexts.map(ns);

// 장 제목 — 러닝헤더 "제N장 ○○ · 쪽" 추출(다수결).
{
  const tally = new Map(); // chNo → Map<title, count>
  for (let p = 35; p < pageTexts.length; p++) {
    const m = /제(\d)장\s*([가-힣ㆍ·\s]+?)\s*[·∙]\s*\d/.exec(pageTexts[p]);
    if (!m) continue;
    const chNo = Number(m[1]);
    const title = m[2].trim();
    const t = tally.get(chNo) ?? new Map();
    t.set(title, (t.get(title) ?? 0) + 1);
    tally.set(chNo, t);
  }
  for (const [chNo, t] of tally) {
    const best = [...t.entries()].sort((a, b) => b[1] - a[1])[0][0];
    CHAPTER_TITLES[chNo] = best;
  }
  for (const ch of chapters) ch.title = CHAPTER_TITLES[ch.no] ?? "";
  console.log("장 제목(러닝헤더):", JSON.stringify(CHAPTER_TITLES));
}

// 유닛 제목 무공백 집합 — "나열 페이지"(비교표 등) 판정용.
const allTitleNs = units.map((u) => ns(u.title)).filter((t) => t.length >= 6);
function isListPage(t, selfTitle) {
  let others = 0;
  for (const tt of allTitleNs) {
    if (tt === selfTitle) continue;
    if (t.includes(tt) && ++others >= 3) return true;
  }
  return false;
}
// 간지 사이드바 시그니처 — "번호+제목" 인접형이 2개 이상(주제 수 적은 장 대응).
// 본문 헤더 페이지는 자기 것 1개뿐, 비교표는 번호 없이 제목만 인용 → 정확 판별.
const sidebarForms = units
  .filter((u) => u.kind === "topic")
  .map((u) => String(u.no).padStart(2, "0") + ns(u.title));
function isCoverPage(t) {
  let n = 0;
  for (const f of sidebarForms) if (t.includes(f) && ++n >= 2) return true;
  return false;
}

for (const u of units) {
  const label = u.kind === "topic" ? u.title : `${u.refNo} ${u.title}`;
  // 본문 헤더의 제목·번호는 텍스트 스트림 순서가 페이지마다 달라("제목 NN" / "NN 제목")
  // 순서 불문 — 제목 포함 + 나열 페이지(타 유닛 제목 3개 이상) 제외로 판정한다.
  const selfNs = u.kind === "topic" ? ns(u.title) : ns(`${u.refNo} ${u.title}`);
  // 1차: 헤더 인접형 — 본문 헤더의 텍스트 스트림 순서가 페이지마다 달라
  //   "제목+번호"/"번호+제목" 양쪽을 인정. 간지 사이드바·비교표(타 유닛 제목 3개+)는
  //   topic 에 한해 제외(참고자료 본문은 자체가 비교표라 적용 불가·목차는 cursor 로 배제).
  // 2차: 완화 — 제목 포함(참고자료는 번호+제목 앞 8자도) + 동일 제외 규칙.
  const nn = u.kind === "topic" ? String(u.no).padStart(2, "0") : null;
  const adjacency =
    u.kind === "topic"
      ? [ns(u.title) + nn, nn + ns(u.title)]
      : [ns(u.refNo) + ns(u.title), ns(u.refNo) + ns(u.title).slice(0, 8)];
  const loose = [selfNs, ...(u.kind === "reference" ? [ns(u.refNo) + ns(u.title).slice(0, 8)] : [])];
  let found = -1;
  for (const needles of [adjacency, loose]) {
    for (let p = cursor; p < pageNs.length && found < 0; p++) {
      const t = pageNs[p];
      if (!needles.some((x) => t.includes(x))) continue;
      if (isCoverPage(t)) continue;
      if (u.kind === "topic" && isListPage(t, ns(u.title))) continue;
      found = p + 1;
    }
    if (found > 0) break;
  }
  if (found > 0) {
    u.pdfPage = found;
    cursor = found - 1; // 같은 페이지에 다음 주제가 시작될 수 있음
  } else {
    u.pdfPage = null;
    unmapped++;
    console.log(`⚠ PDF 페이지 미매핑: [${u.chapter}장] ${label}`);
  }
}

// pdfPage 단조 증가 검증
let mono = true;
let prev = 0;
for (const u of units) {
  if (u.pdfPage == null) continue;
  if (u.pdfPage < prev) { mono = false; console.log(`⚠ 페이지 역행: ${u.title} p${u.pdfPage} < ${prev}`); }
  prev = u.pdfPage;
}

// ── 검증 3: 텍스트 유실 감사 — 유닛에 담긴 총 글자수 vs 원문 전체(hp:t) ──
function unitChars(u) {
  let c = 0;
  for (const b of u.blocks) {
    if (b.type === "p" || b.type === "h") c += b.text.length;
    if (b.type === "diagram") c += b.texts.join("").length;
    if (b.type === "table") {
      (function tw(cells) {
        for (const row of cells)
          for (const cell of row) {
            c += cell.text.length;
            for (const t of cell.tables ?? []) tw(t);
          }
      })(b.cells);
    }
  }
  return c + u.title.length;
}
const capturedChars = units.reduce((a, u) => a + unitChars(u), 0);
// 원문 텍스트 전량 = 태그 전체 제거(자식 요소 품은 hp:t 포함) — 상한 기준선.
const rawChars = xml.replace(/<[^>]*>/g, "").replace(/\s+/g, "").length;
const capturedNs = String(capturedChars); // 공백 제거 기준 비교를 위해 아래서 재계산
const capturedNoSpace = units.reduce((a, u) => {
  let s = u.title;
  for (const b of u.blocks) {
    if (b.type === "p" || b.type === "h") s += b.text;
    if (b.type === "diagram") s += b.texts.join("");
    if (b.type === "table")
      (function tw(cells) {
        for (const row of cells)
          for (const cell of row) {
            s += cell.text;
            for (const t of cell.tables ?? []) tw(t);
          }
      })(b.cells);
  }
  return a + s.replace(/\s+/g, "").length;
}, 0);
void capturedNs;

console.log("\n── 결과 ──");
console.log(`텍스트 포착(무공백): ${capturedNoSpace} / 원문 전체 ${rawChars} 자 (${((capturedNoSpace / rawChars) * 100).toFixed(1)}% — 잔여는 표지·머리말·간지·캡션)`);
const withRefs = units.filter((u) => u.lawRefs.length > 0).length;
console.log("조문 참조 보유:", withRefs, "/", units.length, "유닛 (미보유:", units.filter((u) => u.lawRefs.length === 0).map((u) => u.title).join(" · ").slice(0, 200), ")");
console.log("장:", chapters.length, "| 주제:", stats.topics, "| 참고자료:", stats.references);
console.log("블록:", stats.blocks, "| 표:", stats.tables, "| 셀:", stats.cells, "| 표 텍스트:", stats.chars, "자");
console.log("다이어그램:", stats.diagrams, "| 이미지:", stats.images);
console.log("빈 유닛:", stats.emptyUnits.length, stats.emptyUnits.slice(0, 5));
console.log("사이드바 불일치 장:", sidebarMismatch, "| PDF 미매핑:", unmapped, "| 페이지 단조:", mono);

writeFileSync(
  OUT,
  JSON.stringify({ publication: "도해특허법 제20판", chapters, units }, null, 1),
  "utf8",
);
console.log("저장:", OUT);
