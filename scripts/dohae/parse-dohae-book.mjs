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
const CHAR_FONT = new Map(); // charPr id → { boldish }
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
      CHAR_FONT.set(a["@_id"], {
        boldish:
          childrenOf(n).some((c) => tagOf(c) === "hh:bold") || /bold/i.test(face),
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


// ── 셀·표 파싱 (검증본 그대로) ──
function cellText(tcNode) {
  const parts = [];
  (function walk(n) {
    const tag = tagOf(n);
    if (tag === "hp:tbl" || SHAPE_TAGS.has(tag) || tag === "hp:shapeComment") return;
    if (tag === "hp:p") {
      let t = "";
      (function tw(m, root) {
        const mt = tagOf(m);
        if (mt === "#text") { t += String(m["#text"] ?? ""); return; }
        if (mt === "hp:tbl" || SHAPE_TAGS.has(mt) || mt === "hp:shapeComment") return;
        if (!root && mt === "hp:p") return;
        for (const c of childrenOf(m)) tw(c, false);
      })(n, true);
      t = t.replace(/[ \t]+/g, " ").trim();
      if (t) parts.push(t);
      return;
    }
    for (const c of childrenOf(n)) walk(c);
  })(tcNode);
  return parts.join("\n");
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
  let bold = false;
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
        if (tagOf(x) === "hp:run") {
          const f = CHAR_FONT.get(attrsOf(x)["@_charPrIDRef"]);
          let runText = "";
          (function r(y) {
            if (tagOf(y) === "hp:t")
              for (const c of childrenOf(y)) if (typeof c["#text"] === "string") runText += c["#text"];
            childrenOf(y).forEach(r);
          })(x);
          if (runText.trim() && f?.boldish) bold = true;
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
    ...(bold ? { bold: true } : {}),
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
          rich.push({
            text: cellText(m),
            colSpan,
            rowSpan,
            ...(width > 0 ? { width } : {}),
            ...style,
            ...(nested.length ? { tables: nested } : {}),
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
function paraInfo(p) {
  let plain = "";
  const shapeTexts = [];
  const tables = [];
  const shapeTables = []; // 도형 프레임 안에 중첩된 표 — 다이어그램 뒤에 별도 블록으로
  const pics = []; // 본문 그림 binId
  let shapeDraw = 0; // 도형 영역의 그리기 도형(선·타원·다각형…) 수
  let shapeLabeledRect = 0; // 글자를 품은 사각형(라벨 상자) 수
  (function w(n, root, inShape) {
    const tag = tagOf(n);
    if (tag === "#text") {
      const s = String(n["#text"] ?? "");
      if (inShape) { if (s.trim()) shapeTexts.push(s.trim()); }
      else plain += s;
      return;
    }
    if (tag === "hp:shapeComment") return; // 그림 캡션("그림입니다…") 제외
    if (tag === "hp:tbl") {
      (inShape ? shapeTables : tables).push(n);
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
    shapeTexts, tables, shapeTables, pics, shapeDraw, shapeLabeledRect,
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
function refHeaderOf(p) {
  if (p.pics.length === 0) return null;
  const m = /^(\d+\.\d+)\s+(.+)$/.exec(p.plain);
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
  for (const t of p.shapeTables) pushTable(t, true);
  for (const t of p.tables) pushTable(t, false);

  // ★표 칸 안에 그려진 그림은 HTML 로 옮길 수 없다 — 표로 내보내면 화면에서 그림이 통째로
  //   사라진다(원장 보고 2026-08-21: 참고 1.2 Ⅲ · 7 Ⅴ 기간의 계산 사례 · 참고 3.1).
  //   종전 파서는 **도형에 글자가 있을 때만** diagram 을 만들었고(`nonBadgeShapes.length > 0`),
  //   표 안으로는 아예 내려가지 않아 그림이 어디에도 안 잡혔다.
  //   → 그림을 품은 표는 표 대신 **다이어그램(PDF 크롭)** 으로 내보낸다. 표+그림이 한 상자에
  //     섞여 있으면 쪼갤 수 없으므로 상자째 이미지로 가는 게 맞다(하이브리드 원칙의 그림 쪽).
  //   실측(표 255개): 그림 없는 표 247 · 그림 품은 표 8 — 경계가 뚜렷해 오분류 여지가 작다.
  function pushTable(node, fromShape) {
    const cells = parseTable(node);
    if (tableIsDrawing(node, cells)) {
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
      const range = /^(\d+(?:의\d+)?)\s*~\s*(\d+(?:의\d+)?)/.exec(tok);
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
