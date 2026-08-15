// v5 — 정답뿐 아니라 '선지별 해설'까지 원본과 대조.
//  v4 의 한계: 정답만 봤다. 해설 오배정(다른 문제 해설이 붙은 것)은 못 잡는다.
//  해시 중복 검출기의 한계: 엔트리가 1회만 소비되면 '유일하지만 틀린' 해설이 되어 중복이 안 생긴다.
//  → 원본(해설편 paragraph JSON)에서 (장, 단원, 번호) → {정답, 선지별해설} 을 만들고 DB 와 직접 비교.
import { readFileSync, writeFileSync } from "node:fs";
import "dotenv/config";
// import { createClient } from "@supabase/supabase-js";

const CIRCLED = "①②③④⑤";
const CHAPTER_RE = /^제(\d+)장\s+(.+)$/;
const SECTION_RE = /^([^()]+?)\s*\(\s*([\d①-⑳의\s,\-]+)\s*\)\s*(\d+)?\s*$/;
const SECTION_BULLET_RE = /^[•·]\s*([^()]+?)\s*\(\s*([\d①-⑳의\s,\-]+)\s*\)\s*(\d+)?\s*$/;
// 단원 헤더는 표 한 줄로 온다. 실제 형태 3종:
//   `| 특허료의 납부 |  | 79-86 |`       — 3칸, 가운데 빈칸
//   `| 직무발명 |  | 발진법2, 10-19, 58 |` — 3칸, 조문참조에 한글 포함
//   `| 실용신안법 |`                      — 1칸(조문참조 없음)
// 해설 본문의 표(`| 구 분 | 특 허 | 노 하 우 |`)는 가운데 칸이 비어있지 않아 걸러진다.
function sectionFromTable(firstLine) {
  if (!firstLine.startsWith("|")) return null;
  const cells = firstLine.split("|").slice(1, -1);
  const name = (cells[0] ?? "").trim();
  if (!name || name.length > 25 || /[①②③④⑤]/.test(name)) return null;
  if (cells.length === 1) return name;
  if (cells.length === 3 && cells[1].trim() === "") return name;
  return null;
}
const ANSWER_HEADER_RE = /^(\d{2})\s*([①②③④⑤]+)\s*$/;

function parseAnswers(paragraphs) {
  const entries = [];
  let chapter = null, section = null, inToc = true, seen = false, cur = null;
  const flush = () => { if (cur) entries.push(cur); cur = null; };
  for (const p of paragraphs) {
    const text = (p.text ?? "").trim();
    if (!text) continue;
    if (/정답\s*및\s*해설/.test(text)) { seen = true; inToc = false; continue; }
    const ch = text.match(CHAPTER_RE);
    if (ch && seen) { flush(); chapter = +ch[1]; section = null; continue; }
    if (inToc) continue;
    const b = text.match(SECTION_BULLET_RE);
    if (b && /[①-⑳\d]/.test(b[2])) { flush(); section = b[1].trim(); continue; }
    const t = sectionFromTable(text.split(/\n/)[0]);
    if (t) { flush(); section = t; continue; }
    const s = text.match(SECTION_RE);
    if (s && /[①-⑳\d]/.test(s[2])) { flush(); section = s[1].trim(); continue; }
    const h = text.match(ANSWER_HEADER_RE);
    if (h) {
      flush();
      cur = { chapter, section, number: +h[1],
              correct: [...h[2]].map((c) => CIRCLED.indexOf(c) + 1).sort((a, z) => a - z),
              perChoice: {} };
      continue;
    }
    if (!cur) continue;
    if (text === "해설") continue;
    const m = text.match(/^(?:해설\s*)?([①②③④⑤]+)\s*(.+)$/s);
    if (m) {
      const body = m[2].trim();
      for (const c of m[1]) {
        const i = CIRCLED.indexOf(c) + 1;
        cur.perChoice[i] = cur.perChoice[i] ? cur.perChoice[i] + " " + body : body;
      }
    }
  }
  flush();
  return entries;
}

// 해설 앞머리의 표기 차이는 무시한다:
//   원본 `✕, 종업원 등이…` / `○, 특허법 제99조…`  ↔ DB `종업원 등이…`  (정오 표기만 뺀 것)
//   원본 `는 제척원인 이외에…`                      ↔ DB `제척원인 이외에…` (선지마커 뒤 조사 잔재)
const stripLead = (s) => (s ?? "").replace(/^\s*(?:[○◯✕×ⅹx]\s*,?\s*)?(?:는|은|이|가)?\s*/i, "");
const norm = (s) => stripLead(s).replace(/[\s.,·․‧・ㆍ‘’“”"'()（）]/g, "").toLowerCase();
const bare = (s) => (s ?? "").replace(/^\s*(\[\d+\]|\d+)\s*/, "").replace(/[\s·․‧∙・ㆍ,()[\]]/g, "").toLowerCase();
// 플랫폼 체계도 단원명 ↔ 교재 단원명이 다른 곳 (경로 전체로 키를 잡아 동음이의 오매칭을 막는다).
const UNIT_ALIAS = new Map([
  // ★"심판 > 정정심판/특허의 정정" 은 교재의 정정심판·정정청구 두 단원을 합친 것이라
  //   번호가 1:1 이 아니다. 별칭으로 묶으면 오매칭 되므로 아래 해설 앵커링 패스에 맡긴다.
  ["특허권>소멸", "특허권의소멸및특허권자의의무"],
  ["심사>진행", "심사의진행"],
  ["심판>청구", "심판의청구"],
  ["심사>주체", "심사일반및심사의주체"],
]);
const normUnit = (s) => {
  const path = (s ?? "").split(">").map((x) => bare(x)).filter(Boolean).join(">");
  return UNIT_ALIAS.get(path) ?? bare((s ?? "").split(">").pop());
};


export { parseAnswers, norm, normUnit };
