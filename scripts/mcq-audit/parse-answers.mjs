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
  if (name === "•" || name === "·") return "__TOC__"; // 목차 표(`| • | 특허권의 발생 | |`)
  if (!name || name.length > 25 || /[①②③④⑤]/.test(name)) return null;
  if (cells.length === 1) return name;
  if (cells.length === 3 && cells[1].trim() === "") return name;
  return null;
}
// 괄호 없는 단원 헤딩 — "진보성29②", "벌칙225-232", "참가인155, 156", "절차의 정지20-24".
// (괄호형 `신규성(29①각호)30` 은 SECTION_RE 가 잡는다.)
// 해설 본문과 섞이지 않도록 좁게 판정한다: 짧고 · 문장부호가 없고 · 조문번호/페이지로 끝난다.
//   "특허법 제100조제3항" 은 '항'(한글)으로 끝나 걸리지 않고,
//   "특허법 제52조제2항제1호." 는 마침표가 있어 걸리지 않는다.
function sectionFromPlain(text) {
  if (text.length > 30) return null;
  if (/[.。!?]/.test(text)) return null;
  if (/^[①-⑳ⅰ-ⅹ]/.test(text)) return null;
  // 조문번호 뒤에 한글 꼬리가 붙는 형태도 있다 — "신규성29①각호", "산업상 이용가능성29①본문".
  const m = text.match(/^([가-힣A-Za-z][가-힣A-Za-z\s·・]*?)\s*\d[\d\s,\-–의①-⑳]*(각호|본문|단서|호|항)?$/);
  if (!m) return null;
  const name = m[1].trim();
  return name.length >= 2 ? name : null;
}

// 항목 머리글. 정답이 있는 형태(`03 ⑤`)와 **정답 없음** 형태(`05 답없음`, `17 없음`) 둘 다.
// ★후자를 못 읽으면 그 항목이 생성되지 않아 해설이 앞 항목 끝에 들러붙는다.
const ANSWER_HEADER_RE = /^(\d{2})\s*(?:([①②③④⑤]+)|(?:정?답?\s*없음))\s*$/;

function parseAnswers(paragraphs) {
  const entries = [];
  let chapter = null, section = null, inToc = true, seen = false, cur = null;
  let lastIdxs = null; // 직전 선지 마커 문단의 선지 번호들 — 이어지는 문단을 붙일 대상
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
    // 목차 표는 단원을 바꾸지 않는다 — 진행 중 항목만 닫고 넘어간다.
    if (t === "__TOC__") { flush(); lastIdxs = null; continue; }
    if (t) { flush(); section = t; continue; }
    const s = text.match(SECTION_RE);
    if (s && /[①-⑳\d]/.test(s[2])) { flush(); section = s[1].trim(); continue; }
    const pl = sectionFromPlain(text);
    if (pl) { flush(); section = pl; continue; }
    const h = text.match(ANSWER_HEADER_RE);
    if (h) {
      flush();
      cur = { chapter, section, number: +h[1],
              // 정답 없음 항목은 correct = [] (출제오류로 정답취소된 기출).
              correct: h[2] ? [...h[2]].map((c) => CIRCLED.indexOf(c) + 1).sort((a, z) => a - z) : [],
              perChoice: {}, cont: {} };
      lastIdxs = null;
      continue;
    }
    if (!cur) continue;
    if (text === "해설") continue;
    const m = text.match(/^(?:해설\s*)?([①②③④⑤]+)\s*(.+)$/s);
    if (m) {
      const body = m[2].trim();
      lastIdxs = [...m[1]].map((c) => CIRCLED.indexOf(c) + 1);
      for (const i of lastIdxs) {
        cur.perChoice[i] = cur.perChoice[i] ? cur.perChoice[i] + " " + body : body;
      }
      continue;
    }
    // 선지 마커로 시작하지 않는 문단 = 직전 선지 해설의 '이어지는 문단'.
    // 교재에는 있는데 적재 때 통째로 버려지던 부분(2026-08-15 발견). perChoice 는
    // 기존 소비처(감사 대조)를 위해 그대로 두고 cont 에 따로 모은다.
    if (lastIdxs) {
      for (const i of lastIdxs) (cur.cont[i] ??= []).push(text);
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
