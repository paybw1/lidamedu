// 종합해설 이미지 일괄 SVG 재작성 → PNG 렌더 → Storage 업로드 → DB URL 치환.
// scripts/lib/timeline-svg.mjs 의 renderTimelineSvg 또는 inline SVG 사용.
//
// 사용:
//   node scripts/redraw-all-images.mjs                # dry-run (PNG 만 로컬 저장)
//   node scripts/redraw-all-images.mjs --apply        # Storage + DB 적용
//   node scripts/redraw-all-images.mjs --only <pid>   # 특정 problem_id 만 처리
//   node scripts/redraw-all-images.mjs --batch 1      # 배치 1만 처리

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import "dotenv/config";
import { renderTimelineSvg } from "./lib/timeline-svg.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});
const BUCKET = "problem-explanations";

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const VERTICAL = ARGS.includes("--vertical"); // 세로 레이아웃 미리보기(timelineSpec 만)
const ONLY_INDEX = ARGS.indexOf("--only");
const ONLY_PID = ONLY_INDEX >= 0 ? ARGS[ONLY_INDEX + 1] : null;
const BATCH_INDEX = ARGS.indexOf("--batch");
const BATCH_NUM = BATCH_INDEX >= 0 ? parseInt(ARGS[BATCH_INDEX + 1], 10) : null;

const PREVIEW_DIR = "source/_converted/redrawn";
if (!existsSync(PREVIEW_DIR)) mkdirSync(PREVIEW_DIR, { recursive: true });

// 각 spec: { problemId, oldObjectName, batch, svg | timelineSpec }
const SPECS = [];

// ─────────────────────────────────────────────────────────────────────────
// BATCH 1
// ─────────────────────────────────────────────────────────────────────────

// 088db241 — 발명자 甲 발명 A,B 기재. 甲 청구범위 A 출원(1) → 출원공개(1) → 등록(1).
// 한편 乙이 甲의 출원 (B로부터 용이) 후출원(2) — 동일자 또는 약간 후일.
SPECS.push({
  problemId: "088db241-84de-49ea-88e9-ea489815e91e",
  oldObjectName: "261e797805f5db9b9a8a5ff1d0012290.png",
  batch: 1,
  timelineSpec: {
    width: 2400,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
    ],
    events: [
      { actor: "1", x: 0.13, side: "above", title: "특허출원(1)", lines: ["청구범위: A", "발명의 설명: A, B"], boxWidth: 540 },
      { actor: "2", x: 0.36, side: "below", title: "특허출원(2)", lines: ["청구범위: B' (B로부터 용이)", "발명의 설명: B'"], boxWidth: 580 },
      { actor: "1", x: 0.62, side: "above", title: "출원공개(1)", boxWidth: 360 },
      { actor: "1", x: 0.88, side: "above", title: "등록(1)", boxWidth: 280 },
    ],
  },
});

// 01579a08 — 甲 A 제품 판매 → 신제품 A+B 판매 → 특허출원(1) 공지예외적용주장(청구범위 1.A 2.B).
// 乙이 A+B 판매(중간), 丙이 B 출원(2), 丁이 출원(3)으로 1.A 2.B 출원.
SPECS.push({
  problemId: "01579a08-c353-49ea-b53b-e751a9d69122",
  oldObjectName: "623cd2c55c09e4a9458c90f475190204.png",
  batch: 1,
  timelineSpec: {
    width: 2600,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
      { id: "3", label: "丙" },
      { id: "4", label: "丁" },
    ],
    events: [
      { actor: "1", x: 0.10, title: "A 제품 판매", boxWidth: 320 },
      { actor: "1", x: 0.32, title: "신제품 A+B 판매", boxWidth: 360 },
      { actor: "1", x: 0.92, title: "특허출원(1) · 공지예외", lines: ["1. A", "2. B"], boxWidth: 500 },
      { actor: "2", x: 0.55, title: "A+B 판매", boxWidth: 280 },
      { actor: "3", x: 0.72, title: "B 출원(2)", boxWidth: 320 },
      { actor: "4", x: 0.92, title: "출원(3)", lines: ["1. A", "2. B"], boxWidth: 320 },
    ],
  },
});

// 0c3e655a — 甲 국내에서 공연히 알려지지 아니한 화합물 A 발명 → 특허출원(1) — A 제조방법 B → 출원공개(1).
// 乙 정당한 이유없이 업으로서 A 생산.
SPECS.push({
  problemId: "0c3e655a-e91c-4b32-904b-bd8b9d1c1706",
  oldObjectName: "e1dcc48fb55d27ac8481575e84c8980b.png",
  batch: 1,
  timelineSpec: {
    width: 2400,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
    ],
    events: [
      { actor: "1", x: 0.16, side: "above", title: "화합물 A 발명", lines: ["국내 공연 미공지"], boxWidth: 460 },
      { actor: "1", x: 0.40, side: "above", title: "특허출원(1)", lines: ["A 제조방법 B"], boxWidth: 420 },
      { actor: "1", x: 0.64, side: "above", title: "출원공개(1)", boxWidth: 360 },
      { actor: "2", x: 0.88, side: "below", title: "정당한 이유없이", lines: ["업으로서 A 생산"], boxWidth: 460 },
    ],
  },
});

// 3b4f631f — 甲 특허출원 [청구항 1.A / 2.1항+B / 3.B+C] 의 신규성 / 동일성 비교를 위한 특허공보 제5호 (A'+B, B), 제6호 (C) 인용발명.
// 박스 only, 타임라인 위에 출원, 아래에 공보 제5/6호.
SPECS.push({
  problemId: "3b4f631f-9c7a-47ca-a6c1-9e81fa4e26ad",
  oldObjectName: "3f039bd6cdac89d3070526d734e85a2c.png",
  batch: 1,
  timelineSpec: {
    width: 2400,
    actors: [{ id: "1", label: "甲" }],
    events: [
      { actor: "1", x: 0.78, side: "above", title: "특허출원", lines: ["1. A", "2. 1항에 있어서, B 부가", "3. B+C"], boxWidth: 540 },
      { actor: "1", x: 0.22, side: "below", title: "특허공보 제5호", lines: ["1. A'+B", "2. B"], boxWidth: 480 },
      { actor: "1", x: 0.50, side: "below", title: "특허공보 제6호", lines: ["1. C"], boxWidth: 480 },
    ],
  },
});

// 0b3ff4ff — 甲 A 발명 완성 후 연구노트 기재 → 乙이 A 무단 출원(1) → 출원공개(1) → 설정등록(1) → 등록공고(1).
// 丙·丁 공동 B 발명 완성 → 丁 단독 출원(2) → 출원공개(2) → 설정등록(2) → 등록공고(2).
SPECS.push({
  problemId: "0b3ff4ff-5ede-439e-b46c-d1f7fc6ec01a",
  oldObjectName: "973b395627975f10e1919150293ea226.png",
  batch: 1,
  timelineSpec: {
    width: 2800,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
      { id: "3", label: "丙" },
      { id: "4", label: "丁" },
    ],
    events: [
      { actor: "1", x: 0.06, title: "甲 A 발명 완성후", lines: ["연구노트 기재"], boxWidth: 380 },
      { actor: "2", x: 0.22, title: "乙 A 특허출원(1)", lines: ["연구노트 보고 무단"], boxWidth: 380 },
      { actor: "2", x: 0.42, title: "출원공개(1)", boxWidth: 300 },
      { actor: "2", x: 0.58, title: "설정등록(1)", boxWidth: 300 },
      { actor: "2", x: 0.74, title: "등록공고(1)", boxWidth: 300 },
      { actor: "3", x: 0.10, title: "丙·丁이 공동", lines: ["B 발명 완성"], boxWidth: 340 },
      { actor: "4", x: 0.10, title: "丙·丁이 공동", lines: ["B 발명 완성"], boxWidth: 340 },
      { actor: "4", x: 0.30, title: "丁 B 특허출원(2)", boxWidth: 360 },
      { actor: "4", x: 0.50, title: "출원공개(2)", boxWidth: 300 },
      { actor: "4", x: 0.66, title: "설정등록(2)", boxWidth: 300 },
      { actor: "4", x: 0.82, title: "등록공고(2)", boxWidth: 300 },
    ],
  },
});

// ─────────────────────────────────────────────────────────────────────────
// BATCH 2
// ─────────────────────────────────────────────────────────────────────────

// 199b3d05 — 甲 신규조성물 발명 → 학회발표 → 특허출원(1.조성물 2.치료방법). 乙 후 특허출원(1.조성물).
SPECS.push({
  problemId: "199b3d05-8ffd-49ee-abea-8bf6335455be",
  oldObjectName: "067b4c17e8d60b8c2c6a59621525e310.png",
  batch: 2,
  timelineSpec: {
    width: 2600,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
    ],
    events: [
      { actor: "1", x: 0.16, side: "above", title: "신경계 질환을 치료하는 조성물", lines: ["그 조성물을 이용한 치료방법을", "세계 최초로 개발"], boxWidth: 580 },
      { actor: "1", x: 0.42, side: "above", title: "논문을 공개된 학회에서 발표", boxWidth: 460 },
      { actor: "1", x: 0.74, side: "above", title: "특허출원", lines: ["1. 신경계 질환 조성물", "2. 그 조성물 투여를 통한 신경계 질환 치료방법"], boxWidth: 720 },
      { actor: "2", x: 0.92, side: "below", title: "특허출원", lines: ["1. 신경계 질환 조성물"], boxWidth: 440 },
    ],
  },
});

// 39a58892 — 甲 하이브리드카 엔진 개발 → 학회 서면발표 → 특허출원(2). 乙 그 사이에 특허출원(1).
SPECS.push({
  problemId: "39a58892-4458-4b10-93a8-e86735d33ee4",
  oldObjectName: "a13ce7375c06a91d9be91ed2eb480bf6.png",
  batch: 2,
  timelineSpec: {
    width: 2400,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
    ],
    events: [
      { actor: "1", x: 0.18, side: "above", title: "하이브리드카 엔진 개발", boxWidth: 420 },
      { actor: "1", x: 0.46, side: "above", title: "A 학회에서 서면발표", boxWidth: 380 },
      { actor: "1", x: 0.84, side: "above", title: "특허출원(2)", lines: ["– 하이브리드카 엔진"], boxWidth: 420 },
      { actor: "2", x: 0.62, side: "below", title: "특허출원(1)", lines: ["– 하이브리드카 엔진"], boxWidth: 420 },
    ],
  },
});

// 3678f9bf — 甲 단일 actor. 특허출원(X) → 특허출원(Y)국내우선권주장 → 취하간주(X) → 출원공개(Y).
// 점선 ①②⑤ (X와 Y 사이) / ③④ (Y 우측). 인용 라벨: Y의 a,b / Y의 c / Y의 a,b,c / X의 a,b,d / Y의 c / Y의 a.
// inline SVG 로 점선 + 박스 + 인용 라벨 모두 보존.
{
  const W = 2700;
  const H = 1700;
  const T_Y = 950; // timeline y
  const TITLE_FS = 28, LINE_FS = 22, LINE_LH = 34;
  // 박스 좌표 (cx 위주)
  const X_X = 360, Y_X = 1080, TX_X = 1700, OPEN_X = 2280;
  // 점선: ①②⑤ 가운데(=X와 Y 사이). ③④ 우측 끝.
  const D1 = (X_X + Y_X) / 2; // X와 Y 사이 점선
  const D2 = OPEN_X + 200; // Y 출원공개 우측 점선
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <!-- 점선 (보기 인용 시점) -->
  <g stroke="#dc2626" stroke-width="3" stroke-dasharray="6 8" fill="none">
    <line x1="${D1}" y1="120" x2="${D1}" y2="${H - 200}"/>
    <line x1="${D2}" y1="120" x2="${D2}" y2="${H - 200}"/>
  </g>
  <g font-weight="700" fill="#dc2626" font-size="32" text-anchor="middle">
    <text x="${D1}" y="100">①②⑤</text>
    <text x="${D2}" y="100">③④</text>
  </g>

  <!-- actor lane chip -->
  <g filter="url(#chipShadow)">
    <rect x="40" y="${T_Y - 50}" width="100" height="100" rx="20" fill="#1e293b"/>
  </g>
  <text x="90" y="${T_Y + 18}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>

  <!-- timeline -->
  <line x1="160" y1="${T_Y}" x2="${W - 60}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arr)"/>

  <!-- timeline markers (double ring) -->
  ${[X_X, Y_X, TX_X, OPEN_X].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  <!-- 박스 1: 특허출원(X) -->
  <g filter="url(#cardShadow)">
    <rect x="${X_X - 280}" y="${T_Y - 280}" width="560" height="200" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
    <rect x="${X_X - 280}" y="${T_Y - 280}" width="8" height="200" rx="4" fill="#2563eb"/>
  </g>
  <text x="${X_X}" y="${T_Y - 220}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">특허출원(X)</text>
  <text x="${X_X}" y="${T_Y - 220 + 50}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">– 청구범위: a</text>
  <text x="${X_X}" y="${T_Y - 220 + 50 + LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">– 발명의 설명: a, b, d</text>
  <line x1="${X_X}" y1="${T_Y - 80}" x2="${X_X}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>

  <!-- 박스 2: 특허출원(Y)-국내우선권주장 -->
  <g filter="url(#cardShadow)">
    <rect x="${Y_X - 320}" y="${T_Y - 280}" width="640" height="200" rx="14" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
    <rect x="${Y_X - 320}" y="${T_Y - 280}" width="8" height="200" rx="4" fill="#1d4ed8"/>
  </g>
  <text x="${Y_X}" y="${T_Y - 220}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">특허출원(Y)–국내우선권주장</text>
  <text x="${Y_X}" y="${T_Y - 220 + 50}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">– 청구범위: a, c</text>
  <text x="${Y_X}" y="${T_Y - 220 + 50 + LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">– 발명의 설명: a, b, c</text>
  <line x1="${Y_X}" y1="${T_Y - 80}" x2="${Y_X}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>

  <!-- 박스 3: 취하간주(X) (회색) -->
  <g filter="url(#cardShadow)">
    <rect x="${TX_X - 200}" y="${T_Y - 220}" width="400" height="140" rx="14" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/>
    <rect x="${TX_X - 200}" y="${T_Y - 220}" width="8" height="140" rx="4" fill="#475569"/>
  </g>
  <text x="${TX_X}" y="${T_Y - 145}" font-size="${TITLE_FS}" font-weight="700" fill="#334155" text-anchor="middle">취하간주(X)</text>
  <line x1="${TX_X}" y1="${T_Y - 80}" x2="${TX_X}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>

  <!-- 박스 4: 출원공개(Y) -->
  <g filter="url(#cardShadow)">
    <rect x="${OPEN_X - 200}" y="${T_Y - 220}" width="400" height="140" rx="14" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>
    <rect x="${OPEN_X - 200}" y="${T_Y - 220}" width="8" height="140" rx="4" fill="#1d4ed8"/>
  </g>
  <text x="${OPEN_X}" y="${T_Y - 145}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">출원공개(Y)</text>
  <line x1="${OPEN_X}" y1="${T_Y - 80}" x2="${OPEN_X}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>

  <!-- 인용 라벨 (timeline 위쪽 사선 line) -->
  <g stroke="#94a3b8" stroke-width="2" fill="none">
    <path d="M${X_X + 280},${T_Y - 360} L${OPEN_X - 200},${T_Y - 320}"/>
    <path d="M${Y_X + 320},${T_Y - 280} L${OPEN_X - 200},${T_Y - 240}"/>
  </g>
  <text x="${(X_X + OPEN_X) / 2}" y="${T_Y - 380}" font-size="${LINE_FS}" font-weight="700" fill="#475569" text-anchor="middle">Y의 a, b → Y의 a, b, c</text>
  <text x="${(Y_X + OPEN_X) / 2}" y="${T_Y - 295}" font-size="${LINE_FS}" font-weight="700" fill="#475569" text-anchor="middle">Y의 c</text>

  <!-- 인용 라벨 (timeline 아래쪽) -->
  <g stroke="#94a3b8" stroke-width="2" fill="none">
    <path d="M${X_X - 100},${T_Y + 80} L${D2 - 80},${T_Y + 220}"/>
    <path d="M${X_X - 60},${T_Y + 80} L${D2 - 100},${T_Y + 320}"/>
  </g>
  <text x="${X_X + 880}" y="${T_Y + 220}" font-size="${LINE_FS}" font-weight="700" fill="#475569" text-anchor="start">Y의 c</text>
  <text x="${X_X + 880}" y="${T_Y + 320}" font-size="${LINE_FS}" font-weight="700" fill="#475569" text-anchor="start">Y의 a → X의 a, b, d</text>

  <!-- 캡션 -->
  <text x="${W / 2}" y="${H - 80}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">※ 점선은 보기 ①②⑤ · ③④ 시점 / 인용 라벨은 출원공개시 인용가능 범위</text>
</svg>`;
  SPECS.push({
    problemId: "3678f9bf-4fe6-4271-83e0-1b23dea141a5",
    oldObjectName: "23134ee88f443d34b849bd3a88586dfc.png",
    batch: 2,
    svg,
  });
}

// 44b0475f — 표 only. 甲 = 물건 X 발명의 특허권자(물건 a 는 X 생산 전용). 乙/丙/丁 행위, 사용처, 결론.
{
  const W = 2700;
  const H = 1500;
  const COL_W = [120, 760, 880, 880]; // actor, 행위, 사용처, 결론
  const COL_X = [120];
  for (let i = 0; i < 3; i++) COL_X.push(COL_X[i] + COL_W[i]);
  const ROW_H = 220;
  const HEADER_H = 100;
  const HEADER_Y = 240;
  const TABLE_Y = HEADER_Y + HEADER_H;
  const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  const wrapText = (cx, cy, text, lineH = 30, fs = 24, fill = "#0f172a", weight = "700") => {
    const lines = text.split("\n");
    return lines
      .map((ln, i) => `<text x="${cx}" y="${cy + i * lineH}" font-size="${fs}" font-weight="${weight}" fill="${fill}" text-anchor="middle">${escape(ln)}</text>`)
      .join("");
  };
  const rows = [
    { actor: "乙", actorBg: "#eff6ff", actorStroke: "#3b82f6", actorText: "#1e3a8a",
      act: "한국에서 물건 a를 100개 생산\n미국 수출",
      use: "미국에서 100개 모두 물건 X를\n생산하는데 사용",
      conc: "100개 생산 모두\n간접침해 불인정\n(미국에서 X 생산)",
      concColor: "#dc2626" },
    { actor: "丙", actorBg: "#f0fdf4", actorStroke: "#22c55e", actorText: "#14532d",
      act: "일본에서 물건 a를 100개 생산\n한국 수입",
      use: "한국에서 100개 모두 물건 X를\n생산하는데 사용",
      conc: "100개 수입 모두\n간접침해 인정\n(한국에서 X 생산)",
      concColor: "#15803d" },
    { actor: "丁", actorBg: "#fff7ed", actorStroke: "#f97316", actorText: "#7c2d12",
      act: "일본에서 물건 a를 100개 생산\n50개 일본 수출, 50개 한국에서 판매",
      use: "일본에서 50개 모두 물건 X를\n생산하는데 사용",
      conc: "50개 생산\n간접침해 인정\n(한국에서 X 생산)",
      concColor: "#15803d" },
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <!-- 甲 행 (premises) -->
  <g filter="url(#chipShadow)">
    <rect x="120" y="60" width="100" height="100" rx="20" fill="#7c3aed"/>
  </g>
  <text x="170" y="128" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>
  <g filter="url(#cardShadow)">
    <rect x="260" y="70" width="${W - 320}" height="80" rx="14" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="2"/>
    <rect x="260" y="70" width="8" height="80" rx="4" fill="#7c3aed"/>
  </g>
  <text x="${(260 + W - 60) / 2}" y="120" font-size="26" font-weight="700" fill="#4c1d95" text-anchor="middle">물건 X 발명의 특허권자  ·  물건 a는 물건 X의 생산에만 사용되는 물건</text>

  <!-- header row -->
  <rect x="120" y="${HEADER_Y}" width="${W - 180}" height="${HEADER_H}" rx="0" fill="#1e293b"/>
  <text x="${COL_X[0] + COL_W[0] / 2}" y="${HEADER_Y + 65}" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">구분</text>
  <text x="${COL_X[1] + COL_W[1] / 2}" y="${HEADER_Y + 65}" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">행 위</text>
  <text x="${COL_X[2] + COL_W[2] / 2}" y="${HEADER_Y + 65}" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">사 용 처</text>
  <text x="${COL_X[3] + COL_W[3] / 2}" y="${HEADER_Y + 65}" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">결 론</text>

  ${rows.map((r, i) => {
    const y = TABLE_Y + i * ROW_H;
    const cy = y + ROW_H / 2;
    const actCell = wrapText(COL_X[1] + COL_W[1] / 2, cy - 18, r.act, 36, 24, "#0f172a", "700");
    const useCell = wrapText(COL_X[2] + COL_W[2] / 2, cy - 18, r.use, 36, 24, "#0f172a", "700");
    const concCell = wrapText(COL_X[3] + COL_W[3] / 2, cy - 36, r.conc, 36, 24, r.concColor, "700");
    const stripeFill = r.concColor === "#15803d" ? "#16a34a" : "#dc2626";
    return `
    <rect x="${COL_X[0]}" y="${y}" width="${W - 180}" height="${ROW_H}" fill="${i % 2 === 0 ? "#ffffff" : "#f8fafc"}" stroke="#cbd5e1" stroke-width="1.5"/>
    ${COL_X.slice(1).map((cx) => `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + ROW_H}" stroke="#cbd5e1" stroke-width="1.5"/>`).join("")}
    <rect x="${COL_X[0]}" y="${y}" width="6" height="${ROW_H}" fill="${stripeFill}"/>
    <g filter="url(#chipShadow)">
      <rect x="${COL_X[0] + 20}" y="${y + 60}" width="80" height="80" rx="16" fill="${r.actorStroke}"/>
    </g>
    <text x="${COL_X[0] + 60}" y="${y + 115}" font-size="36" font-weight="700" fill="#ffffff" text-anchor="middle">${r.actor}</text>
    ${actCell}${useCell}${concCell}`;
  }).join("")}
</svg>`;
  SPECS.push({
    problemId: "44b0475f-60ac-4a4e-90ec-ffe4b33dd809",
    oldObjectName: "21279cb103d9e578ccf97e4edcdfd41e.png",
    batch: 2,
    svg,
  });
}

// 460d8e97 — 甲 A 특허출원(1) → 출원공개(1) → 거절결정확정(1)-무권리자.
// 乙 B 특허출원(2) → 출원공개(2) → 등록공고(2) → 무효심결확정(2)-무권리자.
// 우측 하단에 부속표(거절결정확정일/무효심결확정일 30일 만료일 계산).
{
  const W = 2800;
  const H = 1900;
  const T_Y = 700;
  const TITLE_FS = 28, LINE_FS = 22, LINE_LH = 34;
  // 甲 위 3박스: A출원(1), 출원공개(1), 거절결정확정(1)-무권리자
  const A_X = [380, 880, 1500];
  const A_TITLES = [["A 특허출원(1)"], ["출원공개(1)"], ["거절결정확정(1)", "–무권리자"]];
  // 乙 아래 4박스: B출원(2), 출원공개(2), 등록공고(2), 무효심결확정(2)-무권리자
  const B_X = [580, 1000, 1300, 1700];
  const B_TITLES = [["B 특허출원(2)"], ["출원공개(2)"], ["등록공고(2)"], ["무효심결확정(2)", "–무권리자"]];

  const aboveBox = (cx, lines, color) => {
    const fill = color === "blue" ? "#eff6ff" : "#f1f5f9";
    const stroke = color === "blue" ? "#3b82f6" : "#64748b";
    const text = color === "blue" ? "#1e3a8a" : "#334155";
    const stripe = color === "blue" ? "#2563eb" : "#475569";
    const w = 360;
    const h = lines.length === 1 ? 100 : 140;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardShadow)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${stripe}"/>
    </g>
    ${lines.map((ln, i) => `<text x="${cx}" y="${y + 50 + i * 36}" font-size="${TITLE_FS}" font-weight="700" fill="${text}" text-anchor="middle">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };
  const belowBox = (cx, lines, color) => {
    const fill = color === "green" ? "#f0fdf4" : "#f1f5f9";
    const stroke = color === "green" ? "#22c55e" : "#64748b";
    const text = color === "green" ? "#14532d" : "#334155";
    const stripe = color === "green" ? "#16a34a" : "#475569";
    const w = 360;
    const h = lines.length === 1 ? 100 : 140;
    const y = T_Y + 80;
    return `
    <g filter="url(#cardShadow)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${stripe}"/>
    </g>
    ${lines.map((ln, i) => `<text x="${cx}" y="${y + 50 + i * 36}" font-size="${TITLE_FS}" font-weight="700" fill="${text}" text-anchor="middle">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${T_Y + 14}" x2="${cx}" y2="${y}" stroke="#1e293b" stroke-width="3"/>`;
  };

  // 부속표 (만료일 계산)
  const TBL_X = 1700;
  const TBL_Y = 1100;
  const TBL_W = 1080;
  const TBL_COL = [220, 380, 240, 240]; // 행 라벨 / 거절 30일 / (생략) — 4열: 라벨, 거절, 무효
  // Restructure: 3열 — 라벨 / 거절결정확정일로부터 30일 / 무효심결확정일로부터 30일
  const COLS = [240, 420, 420];
  const C0 = TBL_X;
  const C1 = C0 + COLS[0];
  const C2 = C1 + COLS[1];
  const C3 = C2 + COLS[2];
  const ROWS = [
    ["", "거절결정확정일로부터 30일", "무효심결확정일로부터 30일"],
    ["초일", "2019.5.10", "2021.9.20"],
    ["기산일", "2019.5.10", "2021.9.20"],
    ["계산방법", "자연적", "자연적"],
    ["만료일", "2019.6.9의 전일\n=2019.6.8", "2021.10.20의 전일\n=2021.10.19"],
  ];
  const ROW_HS = [80, 60, 60, 60, 90];
  let yAcc = TBL_Y;
  const rowYs = [];
  for (const h of ROW_HS) { rowYs.push(yAcc); yAcc += h; }
  const tblRows = ROWS.map((row, ri) => {
    const ry = rowYs[ri];
    const rh = ROW_HS[ri];
    const isHeader = ri === 0;
    const fill = isHeader ? "#1e293b" : (ri % 2 === 0 ? "#ffffff" : "#f8fafc");
    const textColor = isHeader ? "#ffffff" : "#0f172a";
    return `
    <rect x="${C0}" y="${ry}" width="${C3 - C0}" height="${rh}" fill="${fill}" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="${C1}" y1="${ry}" x2="${C1}" y2="${ry + rh}" stroke="${isHeader ? "#475569" : "#cbd5e1"}" stroke-width="1.5"/>
    <line x1="${C2}" y1="${ry}" x2="${C2}" y2="${ry + rh}" stroke="${isHeader ? "#475569" : "#cbd5e1"}" stroke-width="1.5"/>
    ${[C0 + COLS[0] / 2, C1 + COLS[1] / 2, C2 + COLS[2] / 2].map((cx, ci) => {
      const lines = (row[ci] ?? "").split("\n");
      return lines.map((ln, li) => `<text x="${cx}" y="${ry + rh / 2 - (lines.length - 1) * 14 + li * 28 + 8}" font-size="${isHeader ? 22 : 22}" font-weight="700" fill="${textColor}" text-anchor="middle">${ln}</text>`).join("");
    }).join("")}`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <!-- 甲 chip -->
  <g filter="url(#chipShadow)">
    <rect x="40" y="${T_Y - 220}" width="100" height="100" rx="20" fill="#2563eb"/>
  </g>
  <text x="90" y="${T_Y - 152}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>

  <!-- 乙 chip -->
  <g filter="url(#chipShadow)">
    <rect x="40" y="${T_Y + 120}" width="100" height="100" rx="20" fill="#16a34a"/>
  </g>
  <text x="90" y="${T_Y + 188}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">乙</text>

  <!-- 차선 분리 -->
  <line x1="160" y1="${T_Y - 240}" x2="${W - 60}" y2="${T_Y - 240}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 6"/>
  <line x1="160" y1="${T_Y + 240}" x2="${W - 60}" y2="${T_Y + 240}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 6"/>

  <!-- timeline -->
  <line x1="160" y1="${T_Y}" x2="${W - 60}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arr2)"/>

  ${A_X.map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}
  ${B_X.map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#16a34a"/>`).join("")}

  ${A_X.map((x, i) => aboveBox(x, A_TITLES[i], "blue")).join("")}
  ${B_X.map((x, i) => belowBox(x, B_TITLES[i], "green")).join("")}

  <!-- 부속표 -->
  ${tblRows}
</svg>`;
  SPECS.push({
    problemId: "460d8e97-9825-40b1-a6f3-0838ce4cda90",
    oldObjectName: "196c09879fa5aa1e30f8ae1cc9430132.png",
    batch: 2,
    svg,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// BATCH 3
// ─────────────────────────────────────────────────────────────────────────

// 536a26fd — 甲 1 actor. 미국출원(A)–a → 일본출원(B)–b → 한국출원(C)–A,B기초 우선권주장 –a,b → 설정등록(C).
SPECS.push({
  problemId: "536a26fd-6ca9-411f-bef1-b03f77a520a5",
  oldObjectName: "691ea7c9eef36df41440d3038f973ddf.png",
  batch: 3,
  timelineSpec: {
    width: 2600,
    actors: [{ id: "1", label: "甲" }],
    events: [
      { actor: "1", x: 0.18, side: "above", title: "미국출원(A)", lines: ["– a"], boxWidth: 360 },
      { actor: "1", x: 0.40, side: "above", title: "일본출원(B)", lines: ["– b"], boxWidth: 360 },
      { actor: "1", x: 0.66, side: "above", title: "한국출원(C) · A, B기초 우선권주장", lines: ["– a, b"], boxWidth: 700 },
      { actor: "1", x: 0.90, side: "above", title: "설정등록(C)", boxWidth: 320 },
    ],
  },
});

// 7fab9cdd — 甲 특허출원–프린터 → 프린터 제작·판매 → 프린터 전용 카트리지 별도 판매. 乙 카트리지 제작·판매.
SPECS.push({
  problemId: "7fab9cdd-a1b2-48ab-bd92-76c55993b02a",
  oldObjectName: "d27b649e9ac9528712aa97d382e8c0c3.png",
  batch: 3,
  timelineSpec: {
    width: 2600,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
    ],
    events: [
      { actor: "1", x: 0.18, side: "above", title: "특허출원", lines: ["– 프린터"], boxWidth: 380 },
      { actor: "1", x: 0.42, side: "above", title: "프린터 제작·판매", boxWidth: 400 },
      { actor: "1", x: 0.72, side: "above", title: "프린터에만 사용될 수 있는", lines: ["카트리지를 별도로 판매"], boxWidth: 540 },
      { actor: "2", x: 0.92, side: "below", title: "카트리지를 제작·판매", boxWidth: 460 },
    ],
  },
});

// 70ff22b8 — 甲 미국논문발표(2015.5.10) → 미국출원(1)(2016.3.10) → 한국출원(2)·조약우선권주장(2017.2.10).
SPECS.push({
  problemId: "70ff22b8-4755-4bdd-b1c3-1bd674af5fb7",
  oldObjectName: "da145866bf672c8fba8a1a0fab294748.png",
  batch: 3,
  timelineSpec: {
    width: 2400,
    actors: [{ id: "1", label: "甲" }],
    events: [
      { actor: "1", x: 0.22, side: "above", title: "미국논문발표", lines: ["– 유전자에 관한 발명", "📅 2015.5.10"], boxWidth: 460 },
      { actor: "1", x: 0.50, side: "above", title: "미국출원(1)", lines: ["📅 2016.3.10"], boxWidth: 360 },
      { actor: "1", x: 0.82, side: "above", title: "한국출원(2)·조약우선권주장", lines: ["📅 2017.2.10"], boxWidth: 600 },
    ],
  },
});

// 58ccc15d — 甲 특허출원(X)[A,B / A,B,C] → 특허출원(Z)–X기초분할[C / C] → 출원공개(X,Y).
// 乙 특허출원(Y)[C / C]. 인용 곡선: X의 A,B → Z의 C, X의 A,B,C, Z의 C, X의 A,B,C → Z의 C.
{
  const W = 2800;
  const H = 1800;
  const T_Y = 1100;
  const TITLE_FS = 28, LINE_FS = 22, LINE_LH = 34;
  const X_X = 700, Z_X = 1700, OP_X = 2400;
  const Y_X = 1100; // 乙 below 위치
  const above = (cx, title, lines, color, w = 540, h = 200) => {
    const palette = {
      blue: { fill: "#eff6ff", stroke: "#3b82f6", text: "#1e3a8a", stripe: "#2563eb" },
      slate: { fill: "#f1f5f9", stroke: "#64748b", text: "#334155", stripe: "#475569" },
    };
    const p = palette[color];
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardShadow)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${p.stripe}"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="${p.text}" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx}" y="${y + 50 + 40 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="${p.text}" text-anchor="middle">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };
  const below = (cx, title, lines, color, w = 460, h = 180) => {
    const palette = { green: { fill: "#f0fdf4", stroke: "#22c55e", text: "#14532d", stripe: "#16a34a" } };
    const p = palette[color];
    const y = T_Y + 80;
    return `
    <g filter="url(#cardShadow)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${p.stripe}"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="${p.text}" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx}" y="${y + 50 + 40 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="${p.text}" text-anchor="middle">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${T_Y + 14}" x2="${cx}" y2="${y}" stroke="#1e293b" stroke-width="3"/>`;
  };
  // 인용 곡선 (위쪽으로 활)
  const arc = (x1, x2, peakY, label) => {
    const cx = (x1 + x2) / 2;
    return `
    <path d="M${x1},${T_Y - 20} Q${cx},${peakY} ${x2},${T_Y - 20}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${cx}" y="${peakY - 10}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">${label}</text>`;
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arr3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <g filter="url(#chipShadow)">
    <rect x="40" y="${T_Y - 250}" width="100" height="100" rx="20" fill="#2563eb"/>
  </g>
  <text x="90" y="${T_Y - 182}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>
  <g filter="url(#chipShadow)">
    <rect x="40" y="${T_Y + 150}" width="100" height="100" rx="20" fill="#16a34a"/>
  </g>
  <text x="90" y="${T_Y + 218}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">乙</text>

  <line x1="160" y1="${T_Y - 270}" x2="${W - 60}" y2="${T_Y - 270}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 6"/>
  <line x1="160" y1="${T_Y + 270}" x2="${W - 60}" y2="${T_Y + 270}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4 6"/>

  <line x1="160" y1="${T_Y}" x2="${W - 60}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arr3)"/>

  ${[X_X, Z_X, OP_X].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}
  <circle cx="${Y_X}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
  <circle cx="${Y_X}" cy="${T_Y}" r="7" fill="#16a34a"/>

  ${above(X_X, "특허출원(X)", ["– 청구범위: A, B", "– 발명의 설명: A, B, C"], "blue", 540, 220)}
  ${above(Z_X, "특허출원(Z)–X기초분할", ["– 청구범위: C", "– 발명의 설명: C"], "blue", 600, 220)}
  ${above(OP_X, "출원공개(X, Y)", null, "slate", 380, 110)}
  ${below(Y_X, "특허출원(Y)", ["– 청구범위: C", "– 발명의 설명: C"], "green", 460, 220)}

  <!-- 인용 곡선 -->
  ${arc(X_X, OP_X, T_Y - 600, "X의 A, B → Z의 C")}
  ${arc(Y_X, Z_X, T_Y - 460, "X의 A, B, C")}
  ${arc(Z_X, OP_X, T_Y - 380, "Z의 C")}
</svg>`;
  SPECS.push({
    problemId: "58ccc15d-4f98-4214-9d0a-849ce3bdcaf7",
    oldObjectName: "1810b0b709f8a935d5134c752177dc8d.png",
    batch: 3,
    svg,
  });
}

// 5c743756 — 甲 단독. 6박스 + 점선 ① ②③ ④ ⑤ + 곡선 인용.
{
  const W = 3000;
  const H = 1900;
  const T_Y = 1100;
  const TITLE_FS = 26, LINE_FS = 22, LINE_LH = 32;
  // 박스 6개 (위쪽 모두). 시간순.
  const A_X = 280, B_X = 700, C_X = 1300, BO_X = 1750, OP_X = 2150, TA_X = 2680;
  // 점선
  const D1 = 480; // ①
  const D23 = 970; // ②③
  const D4 = 1980; // ④
  const D5 = 2880; // ⑤
  const dotted = (x, label) => `
    <line x1="${x}" y1="200" x2="${x}" y2="${H - 200}" stroke="#dc2626" stroke-width="3" stroke-dasharray="6 8"/>
    <text x="${x}" y="160" font-size="32" font-weight="700" fill="#dc2626" text-anchor="middle">${label}</text>`;

  const aboveBox = (cx, title, lines, w = 460, h = lines ? 200 : 110) => {
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardShadow)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx}" y="${y + 50 + 40 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };
  const arc = (x1, x2, peakY, label) => {
    const cx = (x1 + x2) / 2;
    return `
    <path d="M${x1},${T_Y - 20} Q${cx},${peakY} ${x2},${T_Y - 20}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${cx}" y="${peakY - 10}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">${label}</text>`;
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arr5c" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  ${dotted(D1, "①")}
  ${dotted(D23, "②③")}
  ${dotted(D4, "④")}
  ${dotted(D5, "⑤")}

  <g filter="url(#chipShadow)">
    <rect x="40" y="${T_Y - 50}" width="100" height="100" rx="20" fill="#1e293b"/>
  </g>
  <text x="90" y="${T_Y + 18}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>

  <line x1="160" y1="${T_Y}" x2="${W - 60}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arr5c)"/>

  ${[A_X, B_X, C_X, BO_X, OP_X, TA_X].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(A_X, "일본출원(A)", ["– a, b"], 380)}
  ${aboveBox(B_X, "한국출원(B)–조약우선권주장", ["– b, c"], 540)}
  ${aboveBox(C_X, "분할출원(C)–출원(B)기초", ["– c, d"], 540)}
  ${aboveBox(BO_X, "보정(B)", ["– b"], 320)}
  ${aboveBox(OP_X, "조기공개(B, C)", null, 400)}
  ${aboveBox(TA_X, "취하(B, C)", null, 360)}

  <!-- 인용 곡선 -->
  ${arc(A_X, OP_X, T_Y - 720, "B의 b")}
  ${arc(B_X, OP_X, T_Y - 600, "B의 c")}
  ${arc(C_X, OP_X, T_Y - 480, "C의 c, d")}
  ${arc(OP_X, TA_X, T_Y - 360, "B의 b, c · C의 c, d")}
</svg>`;
  SPECS.push({
    problemId: "5c743756-3268-4c1d-b3a0-28be313a1ca3",
    oldObjectName: "b38c150d76ee39c9021f7727912e8b62.png",
    batch: 3,
    svg,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// BATCH 4
// ─────────────────────────────────────────────────────────────────────────

// 80406e69 — 프랑스 G사 / 한국의 D사 / 카타르 Q사 침해 분석 표 (inline SVG).
{
  const W = 2400;
  const H = 1100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow80" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow80" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <!-- TOP: 프랑스 G사 (특허권자) -->
  <g filter="url(#chipShadow80)">
    <rect x="80" y="80" width="320" height="100" rx="50" fill="#1e293b"/>
  </g>
  <text x="240" y="142" font-size="36" font-weight="700" fill="#ffffff" text-anchor="middle">프랑스 G사</text>

  <g filter="url(#cardShadow80)">
    <rect x="460" y="80" width="1860" height="100" rx="14" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/>
    <rect x="460" y="80" width="8" height="100" rx="4" fill="#475569"/>
  </g>
  <text x="500" y="142" font-size="32" font-weight="700" fill="#0f172a">프랑스, 미국, 한국, 카타르 및 일본 – 선박의 프로펠러에 관한 특허권(P)</text>

  <!-- 가로 구분선 -->
  <line x1="80" y1="240" x2="${W - 80}" y2="240" stroke="#cbd5e1" stroke-width="2"/>

  <!-- 한국의 D사 -->
  <g filter="url(#chipShadow80)">
    <rect x="80" y="320" width="320" height="100" rx="50" fill="#1e293b"/>
  </g>
  <text x="240" y="382" font-size="36" font-weight="700" fill="#ffffff" text-anchor="middle">한국의 D사</text>

  <!-- D사 행 1: 프로펠러 제작 -->
  <g filter="url(#cardShadow80)">
    <rect x="460" y="300" width="900" height="110" rx="14" fill="#fff7ed" stroke="#f97316" stroke-width="2"/>
    <rect x="460" y="300" width="8" height="110" rx="4" fill="#ea580c"/>
  </g>
  <text x="500" y="365" font-size="32" font-weight="700" fill="#7c2d12">프로펠러 제작</text>
  <g filter="url(#chipShadow80)">
    <rect x="1430" y="320" width="430" height="80" rx="40" fill="#fb923c"/>
  </g>
  <text x="1645" y="370" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">한국특허권 침해</text>

  <!-- D사 행 2: 장착한 선박 S 건조 -->
  <g filter="url(#cardShadow80)">
    <rect x="460" y="430" width="900" height="110" rx="14" fill="#fff7ed" stroke="#f97316" stroke-width="2"/>
    <rect x="460" y="430" width="8" height="110" rx="4" fill="#ea580c"/>
  </g>
  <text x="500" y="495" font-size="32" font-weight="700" fill="#7c2d12">장착한 선박 S 건조</text>
  <g filter="url(#chipShadow80)">
    <rect x="1430" y="450" width="430" height="80" rx="40" fill="#fb923c"/>
  </g>
  <text x="1645" y="500" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">한국특허권 침해</text>

  <!-- D사 행 3: 카타르 Q사 수출 -->
  <g filter="url(#cardShadow80)">
    <rect x="460" y="560" width="900" height="110" rx="14" fill="#fff7ed" stroke="#f97316" stroke-width="2"/>
    <rect x="460" y="560" width="8" height="110" rx="4" fill="#ea580c"/>
  </g>
  <text x="500" y="625" font-size="32" font-weight="700" fill="#7c2d12">카타르 가스기업 Q사 수출</text>
  <g filter="url(#chipShadow80)">
    <rect x="1430" y="580" width="430" height="80" rx="40" fill="#fb923c"/>
  </g>
  <text x="1645" y="630" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">한국특허권 침해</text>

  <!-- 가로 구분선 -->
  <line x1="80" y1="730" x2="${W - 80}" y2="730" stroke="#cbd5e1" stroke-width="2"/>

  <!-- 카타르 Q사 -->
  <g filter="url(#chipShadow80)">
    <rect x="80" y="800" width="320" height="100" rx="50" fill="#1e293b"/>
  </g>
  <text x="240" y="862" font-size="36" font-weight="700" fill="#ffffff" text-anchor="middle">카타르 Q사</text>

  <!-- Q사 행 1: 선박 S 수입/등록 -->
  <g filter="url(#cardShadow80)">
    <rect x="460" y="780" width="900" height="110" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
    <rect x="460" y="780" width="8" height="110" rx="4" fill="#2563eb"/>
  </g>
  <text x="500" y="845" font-size="32" font-weight="700" fill="#1e3a8a">선박 S를 수입 및 등록</text>
  <g filter="url(#chipShadow80)">
    <rect x="1430" y="800" width="430" height="80" rx="40" fill="#3b82f6"/>
  </g>
  <text x="1645" y="850" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">카타르특허권 침해</text>

  <!-- Q사 행 2: LNG 운반에 이용 -->
  <g filter="url(#cardShadow80)">
    <rect x="460" y="910" width="900" height="110" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
    <rect x="460" y="910" width="8" height="110" rx="4" fill="#2563eb"/>
  </g>
  <text x="500" y="975" font-size="32" font-weight="700" fill="#1e3a8a">LNG 운반에 이용</text>
  <g filter="url(#chipShadow80)">
    <rect x="1430" y="930" width="430" height="80" rx="40" fill="#3b82f6"/>
  </g>
  <text x="1645" y="980" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle">카타르특허권 침해</text>
</svg>`;
  SPECS.push({
    problemId: "80406e69-a347-42ea-a6ff-0403d8bd062d",
    oldObjectName: "c82effee223d50eba9e7a7677229972d.png",
    batch: 4,
    svg,
  });
}

// 87663e24 — 甲 단독 timeline. 위(캡슐제 흐름) / 아래(정제 흐름) 분기 — inline SVG.
{
  const W = 3400;
  const H = 1500;
  const T_Y = 750;
  const TITLE_FS = 26, LINE_FS = 22, LINE_LH = 32;

  const aboveBox = (cx, title, lines, w = 460) => {
    const h = lines ? 80 + lines.length * LINE_LH + 20 : 100;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardShadow87)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="start">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const belowBox = (cx, title, lines, w = 460) => {
    const h = lines ? 80 + lines.length * LINE_LH + 20 : 100;
    const y = T_Y + 80;
    return `
    <line x1="${cx}" y1="${T_Y + 14}" x2="${cx}" y2="${y}" stroke="#1e293b" stroke-width="3"/>
    <g filter="url(#cardShadow87)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="start">${ln}</text>`).join("")}`;
  };

  const A_X = 280, OUT_X = 700, REG_X = 1300, CAP_X = 2000, APP_X = 2900;
  const TR_X = 2000, APP2_X = 2900;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow87" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow87" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arr87" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <g filter="url(#chipShadow87)">
    <rect x="40" y="${T_Y - 50}" width="100" height="100" rx="20" fill="#1e293b"/>
  </g>
  <text x="90" y="${T_Y + 18}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>

  <line x1="160" y1="${T_Y}" x2="${W - 60}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arr87)"/>

  ${[A_X, OUT_X, REG_X, CAP_X, APP_X].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(A_X, "A 발명", null, 280)}
  ${aboveBox(OUT_X, "특허출원(1)", ["– A와 이를 포함하는 약학조성물"], 620)}
  ${aboveBox(REG_X, "설정등록(1)", null, 320)}
  ${aboveBox(CAP_X, "캡슐제 임상시험", ["– 6월"], 400)}
  ${aboveBox(APP_X, "식약처 제출하여 허가", ["– A를 유효성분으로 함유하는", "  캡슐제의 제조 및 판매"], 580)}

  ${belowBox(TR_X, "임상시험", ["– 3년"], 340)}
  ${belowBox(APP2_X, "식약처 제출하여 허가", ["– A를 유효성분으로 함유하는", "  정제의 제조 및 판매"], 580)}
</svg>`;
  SPECS.push({
    problemId: "87663e24-b5c7-402b-8e20-2bbbc97a9b8f",
    oldObjectName: "7e1848c9ad6236eb9347eeb7872ed70e.png",
    batch: 4,
    svg,
  });
}

// 8ac029ea — 甲乙 2-lane. 甲 위(A), 乙 아래(B).
SPECS.push({
  problemId: "8ac029ea-ddf4-4823-83c6-4e31b77c5516",
  oldObjectName: "f91037808bd99ad9379683a0e8ac1287.png",
  batch: 4,
  timelineSpec: {
    width: 2400,
    actors: [
      { id: "1", label: "甲" },
      { id: "2", label: "乙" },
    ],
    events: [
      { actor: "1", x: 0.22, side: "above", title: "특허출원(A)", lines: ["– 청구범위: a", "– 발명의 설명: a, a+b"], boxWidth: 540 },
      { actor: "2", x: 0.66, side: "below", title: "특허출원(B)", lines: ["– 청구범위: a+b", "– 발명의 설명: a+b"], boxWidth: 540 },
    ],
  },
});

// 8d4a2c5a — 甲 단독 timeline. 6박스 위쪽.
SPECS.push({
  problemId: "8d4a2c5a-a865-4865-ab65-e42b1daf3dc7",
  oldObjectName: "4144cf577e7b48dbd8e55f4a22c04754.png",
  batch: 4,
  timelineSpec: {
    width: 2800,
    actors: [{ id: "1", label: "甲" }],
    events: [
      { actor: "1", x: 0.10, side: "above", title: "특허출원(1)", lines: ["– 1 내지 10"], boxWidth: 380 },
      { actor: "1", x: 0.27, side: "above", title: "OA(1)", lines: ["– 1 내지 8 : 진보성 흠결", "– 9, 10 : 등록가능"], boxWidth: 540 },
      { actor: "1", x: 0.48, side: "above", title: "의견서/보정서 제출(1)", boxWidth: 480 },
      { actor: "1", x: 0.66, side: "above", title: "거절결정(1)", boxWidth: 320 },
      { actor: "1", x: 0.80, side: "above", title: "심판청구(1)", boxWidth: 320 },
      { actor: "1", x: 0.94, side: "above", title: "기각심결등본 송달(1)", boxWidth: 480 },
    ],
  },
});

// 8dd8defa — 甲 단독. 3박스 (특허출원 X / 보정 X / 출원공개 X) + 점선 ②④ ① ③ + 곡선 인용.
{
  const W = 3000;
  const H = 1700;
  const T_Y = 1000;
  const TITLE_FS = 26, LINE_FS = 22, LINE_LH = 32;
  const APP_X = 700, BO_X = 1500, OP_X = 2400;
  const D24 = 600;   // ②④ — 특허출원 시점 직후
  const D1 = 1200;   // ① — 출원과 보정 사이
  const D3 = 2500;   // ③ — 출원공개 시점

  const dotted = (x, label) => `
    <line x1="${x}" y1="200" x2="${x}" y2="${H - 200}" stroke="#dc2626" stroke-width="3" stroke-dasharray="6 8"/>
    <text x="${x}" y="160" font-size="32" font-weight="700" fill="#dc2626" text-anchor="middle">${label}</text>`;

  const aboveBox = (cx, title, lines, w = 460) => {
    const h = lines ? 80 + lines.length * LINE_LH + 20 : 100;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardShadow8d)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx}" y="${y + 50 + 36 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const arc = (x1, x2, peakY, label) => {
    const cx = (x1 + x2) / 2;
    return `
    <path d="M${x1},${T_Y - 20} Q${cx},${peakY} ${x2},${T_Y - 20}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${cx}" y="${peakY - 10}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">${label}</text>`;
  };

  // 출원공개 직후 trailing 라벨 — X의 A, B, C
  const trailing = `
    <line x1="${OP_X}" y1="${T_Y - 60}" x2="${W - 80}" y2="${T_Y - 60}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${(OP_X + W - 80) / 2}" y="${T_Y - 80}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">X의 A, B, C</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow8d" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow8d" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arr8d" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  ${dotted(D24, "②④")}
  ${dotted(D1, "①")}
  ${dotted(D3, "③")}

  <g filter="url(#chipShadow8d)">
    <rect x="40" y="${T_Y - 50}" width="100" height="100" rx="20" fill="#1e293b"/>
  </g>
  <text x="90" y="${T_Y + 18}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>

  <line x1="160" y1="${T_Y}" x2="${W - 60}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arr8d)"/>

  ${[APP_X, BO_X, OP_X].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(APP_X, "특허출원(X)", ["– 청구범위: A", "– 발명의 설명: A, B, C"], 540)}
  ${aboveBox(BO_X, "보정(X)", ["– 청구범위: C", "– 발명의 설명: A, C"], 480)}
  ${aboveBox(OP_X, "출원공개(X)", null, 380)}

  <!-- 인용 곡선 -->
  ${arc(APP_X, OP_X, T_Y - 700, "X의 C")}
  ${arc(APP_X, OP_X, T_Y - 480, "X의 A, B, C")}
  ${trailing}
</svg>`;
  SPECS.push({
    problemId: "8dd8defa-dd55-4e03-ac44-aafcce186779",
    oldObjectName: "7f499f11e6cf0911bfc2f66d4b123111.png",
    batch: 4,
    svg,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// BATCH 5
// ─────────────────────────────────────────────────────────────────────────

// 공통 helper — 2-actor timeline with above/below boxes + dated markers + citation arcs.
function makeDualTimelineSvg({ id, dates, aboveBoxes, belowBoxes, arcs, trailing, W, H, T_Y }) {
  const TITLE_FS = 26, LINE_FS = 22, LINE_LH = 32;

  const aboveBox = (cx, title, lines, w, options = {}) => {
    const h = lines ? 80 + lines.length * LINE_LH + 20 : 100;
    const y = T_Y - 80 - h;
    const fill = options.gray ? "#e5e7eb" : "#eff6ff";
    const stroke = options.gray ? "#6b7280" : "#3b82f6";
    const accent = options.gray ? "#4b5563" : "#2563eb";
    const text = options.gray ? "#111827" : "#1e3a8a";
    return `
    <g filter="url(#cardShadow${id})">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${accent}"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="${text}" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="${text}" text-anchor="start">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const belowBox = (cx, title, lines, w, options = {}) => {
    const h = lines ? 80 + lines.length * LINE_LH + 20 : 100;
    const y = T_Y + 90;
    const fill = options.gray ? "#e5e7eb" : "#f0fdf4";
    const stroke = options.gray ? "#6b7280" : "#22c55e";
    const accent = options.gray ? "#4b5563" : "#16a34a";
    const text = options.gray ? "#111827" : "#14532d";
    return `
    <line x1="${cx}" y1="${T_Y + 14}" x2="${cx}" y2="${y}" stroke="#1e293b" stroke-width="3"/>
    <g filter="url(#cardShadow${id})">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${accent}"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TITLE_FS}" font-weight="700" fill="${text}" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LINE_LH}" font-size="${LINE_FS}" font-weight="700" fill="${text}" text-anchor="start">${ln}</text>`).join("")}`;
  };

  const arc = (x1, x2, peakY, label) => {
    const cx = (x1 + x2) / 2;
    return `
    <path d="M${x1},${T_Y - 20} Q${cx},${peakY} ${x2},${T_Y - 20}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${cx}" y="${peakY - 10}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">${label}</text>`;
  };

  const dateLabels = dates.map(({ x, label }) => `
    <text x="${x}" y="${T_Y + 50}" font-size="22" font-weight="700" fill="#0f172a" text-anchor="middle">${label}</text>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadow${id}" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadow${id}" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arr${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <g filter="url(#chipShadow${id})">
    <rect x="40" y="${T_Y - 110}" width="100" height="100" rx="20" fill="#2563eb"/>
  </g>
  <text x="90" y="${T_Y - 42}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>
  <g filter="url(#chipShadow${id})">
    <rect x="40" y="${T_Y + 10}" width="100" height="100" rx="20" fill="#16a34a"/>
  </g>
  <text x="90" y="${T_Y + 78}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">乙</text>

  <line x1="160" y1="${T_Y}" x2="${W - 60}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arr${id})"/>

  ${dates.map(({ x }) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${dateLabels}

  ${aboveBoxes.map((b) => aboveBox(b.cx, b.title, b.lines, b.w, b.options)).join("")}
  ${belowBoxes.map((b) => belowBox(b.cx, b.title, b.lines, b.w, b.options)).join("")}

  ${(arcs || []).map((a) => arc(a.x1, a.x2, a.peakY, a.label)).join("")}
  ${trailing || ""}
</svg>`;
}

// a27850a5 image 1 — 甲乙 timeline, 5 dates, 4 arcs.
{
  const W = 3400;
  const H = 1900;
  const T_Y = 1300;
  const X1 = 600, X2 = 1100, X3 = 1600, X4 = 2300, X5 = 3000;
  const svg = makeDualTimelineSvg({
    id: "a278a",
    W, H, T_Y,
    dates: [
      { x: X1, label: "2017.5.12" },
      { x: X2, label: "2017.10.5" },
      { x: X3, label: "2017.11.1" },
      { x: X4, label: "2018.8.12" },
      { x: X5, label: "2018.11.12" },
    ],
    aboveBoxes: [
      { cx: X1, title: "특허출원(A)", lines: ["– 청구범위: Y", "– 발명의 설명: X, Y"], w: 480 },
      { cx: X3, title: "특허출원(C)–국내우선권주장", lines: ["– X, Y, Z"], w: 600 },
      { cx: X4, title: "취하간주(A)", lines: null, w: 360, options: { gray: true } },
      { cx: X5, title: "출원공개(C)", lines: null, w: 360 },
    ],
    belowBoxes: [
      { cx: X2, title: "특허출원(B)", lines: ["– 청구범위: X", "– 발명의 설명: X"], w: 480 },
    ],
    arcs: [
      { x1: X1, x2: X3, peakY: T_Y - 850, label: "C의 X, Y" },
      { x1: X1, x2: X3, peakY: T_Y - 670, label: "C의 X, Y" },
      { x1: X3, x2: X5, peakY: T_Y - 760, label: "C의 Z" },
      { x1: X3, x2: X5, peakY: T_Y - 580, label: "C의 Z" },
    ],
    trailing: `
    <line x1="${X5}" y1="${T_Y - 60}" x2="${W - 80}" y2="${T_Y - 60}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${(X5 + W - 80) / 2}" y="${T_Y - 80}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">C의 X, Y, Z</text>
    <line x1="${X5}" y1="${T_Y - 130}" x2="${W - 80}" y2="${T_Y - 130}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${(X5 + W - 80) / 2}" y="${T_Y - 150}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">A의 X, Y</text>`,
  });
  SPECS.push({
    problemId: "a27850a5-0b47-4400-b74a-cb0da61185df",
    oldObjectName: "153cb2b36ec4f948bc239c93c45e0e0c.png",
    batch: 5,
    svg,
  });
}

// a27850a5 image 2 — 甲乙 timeline, 5 dates, 출원공개(A) + 취하(C). 3 arcs.
{
  const W = 3400;
  const H = 1900;
  const T_Y = 1300;
  const X1 = 600, X2 = 1100, X3 = 1600, X4 = 2300, X5 = 3000;
  const svg = makeDualTimelineSvg({
    id: "a278b",
    W, H, T_Y,
    dates: [
      { x: X1, label: "2017.5.12" },
      { x: X2, label: "2017.10.5" },
      { x: X3, label: "2017.11.1" },
      { x: X4, label: "" },
      { x: X5, label: "2018.11.12" },
    ],
    aboveBoxes: [
      { cx: X1, title: "특허출원(A)", lines: ["– 청구범위: Y", "– 발명의 설명: X, Y"], w: 480 },
      { cx: X3, title: "특허출원(C)–국내우선권주장", lines: ["– X, Y, Z"], w: 600 },
      { cx: X4, title: "취하(C)", lines: null, w: 320 },
      { cx: X5, title: "출원공개(A)", lines: null, w: 360 },
    ],
    belowBoxes: [
      { cx: X2, title: "특허출원(B)", lines: ["– 청구범위: X", "– 발명의 설명: X"], w: 480 },
    ],
    arcs: [
      { x1: X1, x2: X5, peakY: T_Y - 850, label: "A의 X" },
      { x1: X1, x2: X5, peakY: T_Y - 670, label: "A의 X, Y" },
    ],
    trailing: `
    <line x1="${X5}" y1="${T_Y - 60}" x2="${W - 80}" y2="${T_Y - 60}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${(X5 + W - 80) / 2}" y="${T_Y - 80}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">A의 X, Y</text>`,
  });
  SPECS.push({
    problemId: "a27850a5-0b47-4400-b74a-cb0da61185df",
    oldObjectName: "78a19c4296688e692d849fea6a38c09b.png",
    batch: 5,
    svg,
  });
}

// a7c348d0 — 5 panel cards: 출원발명 + 인용발명①②③④. Each panel has chip header + node graph.
{
  const W = 3000;
  const H = 1300;
  const PANEL_W = 560, PANEL_H = 1000, GAP = 30;
  const PANEL_Y = 200;
  const PANELS = [
    { x: 40, chip: "출원발명", chipFill: "#dbeafe", chipText: "#1e3a8a",
      nodes: [
        { y: 320, label: "산소원" },
        { y: 480, label: "튜브" },
        { y: 640, label: "밸브" },
        { y: 800, label: "산소센서" },
      ],
      edges: [[0, 1], [1, 2], [2, 3]],
    },
    { x: 40 + (PANEL_W + GAP), chip: "인용발명①", chipFill: "#fed7aa", chipText: "#7c2d12",
      nodes: [
        { y: 320, label: "배터리" },
        { y: 480, label: "산소원" },
        { y: 640, label: "튜브" },
        { y: 800, label: "밸브" },
      ],
      edges: [[0, 1], [1, 2], [2, 3]],
    },
    { x: 40 + (PANEL_W + GAP) * 2, chip: "인용발명②", chipFill: "#fed7aa", chipText: "#7c2d12",
      nodes: [
        { y: 320, label: "산소원" },
        { y: 480, label: "튜브" },
        { y: 640, label: "밸브" },
        { y: 480, label: "산소센서", x: 380 },
      ],
      edges: [[0, 1], [1, 2], [1, 3]],
    },
    { x: 40 + (PANEL_W + GAP) * 3, chip: "인용발명③", chipFill: "#fed7aa", chipText: "#7c2d12",
      nodes: [
        { y: 320, label: "산소원" },
        { y: 480, label: "튜브" },
        { y: 640, label: "밸브" },
        { y: 800, label: "산소센서" },
      ],
      edges: [[0, 1], [1, 2], [2, 3]],
    },
    { x: 40 + (PANEL_W + GAP) * 4, chip: "인용발명④", chipFill: "#fed7aa", chipText: "#7c2d12",
      nodes: [
        { y: 320, label: "산소원" },
        { y: 480, label: "튜브" },
        { y: 640, label: "밸브" },
        { y: 480, label: "산소센서", x: 380 },
      ],
      edges: [[0, 1], [1, 2]],
    },
  ];

  const renderPanel = (p, i) => {
    const panelX = p.x;
    const chipW = 280, chipH = 80;
    const chipX = panelX + (PANEL_W - chipW) / 2;
    const chipY = 80;
    const nodeW = 240, nodeH = 90;
    const nodeCenterX = panelX + 140;

    const nodeAt = (n) => {
      const cx = n.x ? panelX + n.x : nodeCenterX;
      const cy = n.y;
      return { cx, cy };
    };

    const nodeRect = (n) => {
      const { cx, cy } = nodeAt(n);
      return `
      <g filter="url(#cardShadowA7)">
        <rect x="${cx - nodeW / 2}" y="${cy - nodeH / 2}" width="${nodeW}" height="${nodeH}" rx="10" fill="#ffffff" stroke="#475569" stroke-width="2.5"/>
      </g>
      <text x="${cx}" y="${cy + 12}" font-size="32" font-weight="700" fill="#0f172a" text-anchor="middle">${n.label}</text>`;
    };

    const edgeLine = ([a, b]) => {
      const na = nodeAt(p.nodes[a]);
      const nb = nodeAt(p.nodes[b]);
      if (na.cx === nb.cx) {
        return `<line x1="${na.cx}" y1="${na.cy + nodeH / 2}" x2="${nb.cx}" y2="${nb.cy - nodeH / 2}" stroke="#475569" stroke-width="2.5"/>`;
      }
      return `<line x1="${na.cx + nodeW / 2}" y1="${na.cy}" x2="${nb.cx - nodeW / 2}" y2="${nb.cy}" stroke="#475569" stroke-width="2.5"/>`;
    };

    return `
    <rect x="${panelX}" y="${PANEL_Y - 40}" width="${PANEL_W}" height="${PANEL_H}" rx="20" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <g filter="url(#chipShadowA7)">
      <rect x="${chipX}" y="${chipY}" width="${chipW}" height="${chipH}" rx="40" fill="${p.chipFill}" stroke="${i === 0 ? '#3b82f6' : '#f97316'}" stroke-width="2.5"/>
    </g>
    <text x="${chipX + chipW / 2}" y="${chipY + 52}" font-size="32" font-weight="700" fill="${p.chipText}" text-anchor="middle">${p.chip}</text>
    ${p.edges.map(edgeLine).join("")}
    ${p.nodes.map(nodeRect).join("")}`;
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadowA7" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipShadowA7" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>
  ${PANELS.map(renderPanel).join("")}
</svg>`;
  SPECS.push({
    problemId: "a7c348d0-aeba-49ac-98a9-524e43a5c0e7",
    oldObjectName: "d1e70aa049fce7a96edeed6be4be52de.png",
    batch: 5,
    svg,
  });
}

// a93e7ce3 — 6 boxes above single timeline. Mixed actors (乙/甲/丙). 甲 boxes gray.
{
  const W = 3000;
  const H = 800;
  const T_Y = 600;
  const TITLE_FS = 26, LINE_FS = 26;

  const positions = [
    { cx: 280, actor: "乙", line: "– A 실시", gray: false },
    { cx: 700, actor: "乙", line: "– 丙에게 알려줌", gray: false },
    { cx: 1120, actor: "乙", line: "– A 사업폐지", gray: false },
    { cx: 1620, actor: "甲", line: "– A 특허출원", gray: true },
    { cx: 2160, actor: "丙", line: "– A 국내에서 사업준비", gray: false },
    { cx: 2700, actor: "甲", line: "– A 특허등록", gray: true },
  ];

  const box = (p) => {
    const w = 360, h = 180;
    const y = T_Y - 80 - h;
    const fill = p.gray ? "#e5e7eb" : "#ffffff";
    const stroke = p.gray ? "#6b7280" : "#475569";
    return `
    <g filter="url(#cardShadowA9)">
      <rect x="${p.cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
    </g>
    <text x="${p.cx}" y="${y + 60}" font-size="36" font-weight="700" fill="#0f172a" text-anchor="middle">${p.actor}</text>
    <text x="${p.cx - 130}" y="${y + 130}" font-size="${LINE_FS}" font-weight="700" fill="#0f172a" text-anchor="start">${p.line}</text>
    <line x1="${p.cx}" y1="${y + h}" x2="${p.cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadowA9" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <marker id="arrA9" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <line x1="40" y1="${T_Y}" x2="${W - 40}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrA9)"/>

  ${positions.map((p) => `
    <circle cx="${p.cx}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${p.cx}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${positions.map(box).join("")}
</svg>`;
  SPECS.push({
    problemId: "a93e7ce3-eaae-487d-8850-dbcace3870bb",
    oldObjectName: "f5a5f1ff9d47e93ee7c3c0c8347e802e.png",
    batch: 5,
    svg,
  });
}

// beee563d — 단일 timeline. 위 3박스 / 아래 2박스. 甲乙丙丁戊 등장.
{
  const W = 3000;
  const H = 1200;
  const T_Y = 600;
  const TITLE_FS = 26, LINE_FS = 22, LINE_LH = 32;

  const aboveBox = (cx, title, w = 460) => {
    const h = 110;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardShadowBE)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 65}" font-size="${TITLE_FS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const belowBox = (cx, title, w = 460) => {
    const h = 130;
    const y = T_Y + 90;
    const lines = title.split("\n");
    return `
    <line x1="${cx}" y1="${T_Y + 14}" x2="${cx}" y2="${y}" stroke="#1e293b" stroke-width="3"/>
    <g filter="url(#cardShadowBE)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#f0fdf4" stroke="#22c55e" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#16a34a"/>
    </g>
    ${lines.map((ln, i) => `<text x="${cx}" y="${y + 55 + i * 36}" font-size="${TITLE_FS}" font-weight="700" fill="#14532d" text-anchor="middle">${ln}</text>`).join("")}`;
  };

  const X1 = 500, X2 = 1100, X3 = 1700, X4 = 2150, X5 = 2700;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardShadowBE" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <marker id="arrBE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <line x1="40" y1="${T_Y}" x2="${W - 40}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrBE)"/>

  ${[X1, X2, X3, X4, X5].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(X1, "甲과 乙이 A 공동발명", 540)}
  ${aboveBox(X3, "甲 특허출원(2) A", 460)}
  ${aboveBox(X5, "甲이 戊에게 특허를 받을 수 있는 권리 양도", 720)}

  ${belowBox(X2, "丙이 甲, 乙 발명 A를 도용하여\n특허출원(1)", 600)}
  ${belowBox(X4, "丙이 丁에게 특허출원(1)에 대한\n출원인 변경신고", 620)}
</svg>`;
  SPECS.push({
    problemId: "beee563d-ba1c-4ba7-8e4d-9ecdd8f58d0d",
    oldObjectName: "ca13b2caf60ce0ec3d6174770e9682f0.png",
    batch: 5,
    svg,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Batch 6
// ─────────────────────────────────────────────────────────────────────────

// bce3a410 — image 1: 甲乙 dual timeline (학회발표→A 한국출원(1)·일본출원(1') ; A 한국출원(2)→PCT(3)→번역문 제출).
{
  const W = 3400, H = 1500, T_Y = 900;
  const X1 = 500, X2 = 1100, X3 = 1750, X4 = 2350, X5 = 2950;
  const svg = makeDualTimelineSvg({
    id: "bce1",
    W, H, T_Y,
    dates: [
      { x: X1, label: "" },
      { x: X2, label: "" },
      { x: X3, label: "" },
      { x: X4, label: "" },
      { x: X5, label: "" },
    ],
    aboveBoxes: [
      { cx: X1, title: "학회에서 A 발명을 서면 발표", lines: null, w: 540 },
      { cx: X3, title: "A 한국출원(1)–공지예외적용주장", lines: ["A 일본출원(1')–공지예외적용주장"], w: 720 },
    ],
    belowBoxes: [
      { cx: X2, title: "A 한국출원(2)", lines: null, w: 380 },
      { cx: X4, title: "A PCT 출원(3)–조약우선권주장", lines: ["– 미국, 중국, 일본 지정"], w: 700 },
      { cx: X5, title: "중국, 미국만 번역문 제출(3)", lines: null, w: 540 },
    ],
    arcs: [],
    trailing: "",
  });
  SPECS.push({
    problemId: "bce3a410-ad8b-498a-9cfc-aa8a66b522a6",
    oldObjectName: "246f5c0d443ce29ecfc2059db6c4ed5d.png",
    batch: 6,
    svg,
  });
}

// bce3a410 — image 2: 동일 timeline (해설본 두 번째 게재).
{
  const W = 3400, H = 1500, T_Y = 900;
  const X1 = 500, X2 = 1100, X3 = 1750, X4 = 2350, X5 = 2950;
  const svg = makeDualTimelineSvg({
    id: "bce2",
    W, H, T_Y,
    dates: [
      { x: X1, label: "" },
      { x: X2, label: "" },
      { x: X3, label: "" },
      { x: X4, label: "" },
      { x: X5, label: "" },
    ],
    aboveBoxes: [
      { cx: X1, title: "학회에서 A 발명을 서면 발표", lines: null, w: 540 },
      { cx: X3, title: "A 한국출원(1)–공지예외적용주장", lines: ["A 일본출원(1')–공지예외적용주장"], w: 720 },
    ],
    belowBoxes: [
      { cx: X2, title: "A 한국출원(2)", lines: null, w: 380 },
      { cx: X4, title: "A PCT 출원(3)–조약우선권주장", lines: ["– 미국, 중국, 일본 지정"], w: 700 },
      { cx: X5, title: "중국, 미국만 번역문 제출(3)", lines: null, w: 540 },
    ],
    arcs: [],
    trailing: "",
  });
  SPECS.push({
    problemId: "bce3a410-ad8b-498a-9cfc-aa8a66b522a6",
    oldObjectName: "6f8e6f37639207a94ba599350f212a33.png",
    batch: 6,
    svg,
  });
}

// cb98f0a8 — 3 actors (甲/乙/丙) + 기간 계산표. 단일 timeline + 乙/丙 box 위로 직선.
{
  const W = 4400, H = 1800;
  const T_Y = 360;
  const X1 = 600, X2 = 1500, X3 = 2300;
  const X_LE = 950, X_RH = 1200;
  const TFS = 26, LFS = 22, LH = 32;

  const aboveBox = (cx, title, lines, w, y, h) => `
    <g filter="url(#cardCB)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" font-weight="700" fill="#1e3a8a" text-anchor="start">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;

  const upBox = (cx, color, title, lines, w, y, h) => {
    const palette = color === "green"
      ? { fill: "#f0fdf4", stroke: "#22c55e", accent: "#16a34a", text: "#14532d" }
      : { fill: "#fff7ed", stroke: "#f97316", accent: "#ea580c", text: "#9a3412" };
    return `
    <line x1="${cx}" y1="${y}" x2="${cx}" y2="${T_Y + 14}" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${cx}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${cx}" cy="${T_Y}" r="7" fill="${palette.accent}"/>
    <g filter="url(#cardCB)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${palette.accent}"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="${palette.text}" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" font-weight="700" fill="${palette.text}" text-anchor="start">${ln}</text>`).join("")}`;
  };

  const tableRows = [
    { label: "초일", c1: "2024.5.1", c2: ["2024.8.2"] },
    { label: "기산일", c1: "2024.5.2", c2: ["2024.8.2"] },
    { label: "계산방법", c1: "역법적", c2: ["자연적"] },
    { label: "만료일", c1: "2024.8.2의 전일=2024.8.1", c2: ["2024.9.1의 전일=2024.8.31", "2024.8.31이 일요일이므로 2024.9.1"] },
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardCB" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipCB" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arrCB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <g filter="url(#chipCB)"><rect x="40" y="${T_Y - 50}" width="100" height="100" rx="20" fill="#2563eb"/></g>
  <text x="90" y="${T_Y + 18}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>

  <g filter="url(#chipCB)"><rect x="40" y="730" width="100" height="100" rx="20" fill="#16a34a"/></g>
  <text x="90" y="798" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">乙</text>

  <g filter="url(#chipCB)"><rect x="40" y="1180" width="100" height="100" rx="20" fill="#ea580c"/></g>
  <text x="90" y="1248" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">丙</text>

  <line x1="160" y1="${T_Y}" x2="2700" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrCB)"/>

  ${[X1, X2, X3].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(X1, "乙의 발명을 모인하여 특허출원(X)", ["– 청구범위: a", "– 발명의 설명: a, b, c"], 640, 50, 200)}
  ${aboveBox(X2, "출원공개(X)", null, 360, 130, 120)}
  ${aboveBox(X3, "거절결정등본송달(X)", ["– 무권리자"], 480, 80, 170)}

  ${upBox(X_LE, "green", "특허출원(Y)", ["– 청구범위: a, c", "– 발명의 설명: a, b, c"], 520, 720, 200)}
  ${upBox(X_RH, "orange", "특허출원(Z)", ["– 청구범위: b, c", "– 발명의 설명: a, b, c"], 520, 1180, 200)}

  <g transform="translate(2900, 720)">
    <rect x="0" y="0" width="1400" height="80" fill="#0f172a"/>
    <text x="700" y="50" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">기간 계산</text>

    <rect x="0" y="80" width="1400" height="60" fill="#1e293b"/>
    <line x1="280" y1="80" x2="280" y2="140" stroke="#475569" stroke-width="1"/>
    <line x1="840" y1="80" x2="840" y2="140" stroke="#475569" stroke-width="1"/>
    <text x="140" y="120" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle"></text>
    <text x="560" y="120" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">등본송달일로부터 3개월</text>
    <text x="1120" y="120" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">확정일로부터 30일</text>

    ${tableRows.map((r, i) => {
      const y = 140 + i * 110;
      const fill = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      const lines2 = r.c2;
      return `
      <rect x="0" y="${y}" width="1400" height="110" fill="${fill}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="280" y1="${y}" x2="280" y2="${y + 110}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="840" y1="${y}" x2="840" y2="${y + 110}" stroke="#cbd5e1" stroke-width="1"/>
      <text x="140" y="${y + 65}" font-size="22" font-weight="700" fill="#0f172a" text-anchor="middle">${r.label}</text>
      <text x="560" y="${y + 65}" font-size="22" fill="#0f172a" text-anchor="middle">${r.c1}</text>
      ${lines2.length === 1
        ? `<text x="1120" y="${y + 65}" font-size="22" fill="#0f172a" text-anchor="middle">${lines2[0]}</text>`
        : lines2.map((ln, j) => `<text x="1120" y="${y + 45 + j * 32}" font-size="20" fill="#0f172a" text-anchor="middle">${ln}</text>`).join("")
      }`;
    }).join("")}
  </g>
</svg>`;
  SPECS.push({
    problemId: "cb98f0a8-0861-4b48-a902-20f59e88d1e8",
    oldObjectName: "785d7d541db5133b1534baed4a5cf7f6.png",
    batch: 6,
    svg,
  });
}

// cfb9321f — 5 boxes above single timeline (甲乙 공동발명/출원, 乙→丙 양도, 丙 개량 A', 丙 우선권주장).
{
  const W = 4200, H = 850;
  const T_Y = 700;
  const TFS = 26, LFS = 22, LH = 32;

  const aboveBox = (cx, title, lines, w) => {
    const h = lines ? 80 + lines.length * LH + 20 : 100;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardCF)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" font-weight="700" fill="#1e3a8a" text-anchor="start">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const X1 = 450, X2 = 1200, X3 = 2050, X4 = 2900, X5 = 3700;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardCF" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <marker id="arrCF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <line x1="40" y1="${T_Y}" x2="${W - 40}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrCF)"/>

  ${[X1, X2, X3, X4, X5].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(X1, "甲, 乙", ["– A 공동발명"], 480)}
  ${aboveBox(X2, "甲, 乙", ["– A 공동출원(X)"], 480)}
  ${aboveBox(X3, "乙", ["– 甲 동의없이 특허를 받을 수", "  있는 권리를 丙에게 양도"], 700)}
  ${aboveBox(X4, "丙", ["– A를 개량시킨 A' 완성"], 600)}
  ${aboveBox(X5, "丙", ["– A, A' 를 국내우선권주장출원(Y)"], 760)}
</svg>`;
  SPECS.push({
    problemId: "cfb9321f-d5d7-49f6-a465-078709974e02",
    oldObjectName: "c7f38bafec36147104d4947433fe09d6.png",
    batch: 6,
    svg,
  });
}

// d459cc97 — 甲乙 dual timeline (甲: 학술논문→제1국출원→국내출원 A→국내출원 B / 乙: 학술논문 발표).
{
  const W = 3800, H = 1500, T_Y = 900;
  const X1 = 500, X2 = 1100, X3 = 1700, X4 = 2400, X5 = 3200;
  const svg = makeDualTimelineSvg({
    id: "d459",
    W, H, T_Y,
    dates: [
      { x: X1, label: "" },
      { x: X2, label: "" },
      { x: X3, label: "" },
      { x: X4, label: "" },
      { x: X5, label: "" },
    ],
    aboveBoxes: [
      { cx: X1, title: "학술논문 발표", lines: ["– 발명 X"], w: 380 },
      { cx: X3, title: "제1국출원(M)", lines: ["– 발명 X"], w: 380 },
      { cx: X4, title: "국내출원(A)–M기초조약우선권주장", lines: ["– 발명 X"], w: 720 },
      { cx: X5, title: "국내출원(B)–A기초국내우선권주장", lines: ["– 공지예외적용주장", "– 발명 X"], w: 720 },
    ],
    belowBoxes: [
      { cx: X2, title: "학술논문 발표", lines: ["– 발명 X"], w: 380 },
    ],
    arcs: [],
    trailing: "",
  });
  SPECS.push({
    problemId: "d459cc97-ef3d-419e-9c91-b94f98320310",
    oldObjectName: "de2fca929bcabf3e04eb52483776dcc0.png",
    batch: 6,
    svg,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Batch 7
// ─────────────────────────────────────────────────────────────────────────

// d48fa650 — 甲乙 timeline, 6 events (특허출원X / 국내우선권주장Y / 취하X / 출원공개Y ; 공지 / 공지예외적용주장V).
{
  const W = 4400, H = 1400, T_Y = 1000;
  const X1 = 500, X2 = 950, X3 = 1700, X4 = 2400, X5 = 3200, X6 = 3900;
  const svg = makeDualTimelineSvg({
    id: "d48f",
    W, H, T_Y,
    dates: [
      { x: X1, label: "2023.4.1" },
      { x: X2, label: "2023.6.1" },
      { x: X3, label: "2024.4.1" },
      { x: X4, label: "2024.6.1" },
      { x: X5, label: "2023.9.1" },
      { x: X6, label: "2024.12.1" },
    ],
    aboveBoxes: [
      { cx: X2, title: "특허출원(X)", lines: ["– A"], w: 380 },
      { cx: X4, title: "국내우선권주장출원(Y)", lines: ["– A, A+B, C"], w: 600 },
      { cx: X5, title: "취하(X)", lines: null, w: 280 },
      { cx: X6, title: "출원공개(Y)", lines: null, w: 360 },
    ],
    belowBoxes: [
      { cx: X1, title: "공지", lines: ["– A"], w: 280 },
      { cx: X3, title: "공지예외적용주장출원(V)", lines: ["– A"], w: 600 },
    ],
    arcs: [
      { x1: X2, x2: X4, peakY: T_Y - 850, label: "Y의 A+B, C" },
      { x1: X2, x2: X4, peakY: T_Y - 700, label: "Y의 A" },
    ],
    trailing: `
    <line x1="${X4}" y1="${T_Y - 550}" x2="${X6}" y2="${T_Y - 550}" stroke="#94a3b8" stroke-width="2.5" fill="none" stroke-dasharray="4 6"/>
    <text x="${(X4 + X6) / 2}" y="${T_Y - 570}" font-size="22" font-weight="700" fill="#475569" text-anchor="middle">Y의 A, A+B, C / X의 A</text>`,
  });
  SPECS.push({
    problemId: "d48fa650-a6fa-46c2-978b-f4a0cd9cf4c7",
    oldObjectName: "298422fd37d9cdb613cb6c94a2198a7d.png",
    batch: 7,
    svg,
  });
}

// d934d68d — single timeline, 3 출원 boxes (A/B국내우선권/C분할) + 분할출원 vs 비분할 표.
{
  const W = 3600, H = 1700;
  const T_Y = 700;
  const TFS = 26, LFS = 22, LH = 32;

  const aboveBox = (cx, title, lines, w, color) => {
    const palette = color === "green"
      ? { fill: "#f0fdf4", stroke: "#22c55e", accent: "#16a34a", text: "#14532d" }
      : color === "orange"
      ? { fill: "#fff7ed", stroke: "#f97316", accent: "#ea580c", text: "#9a3412" }
      : { fill: "#eff6ff", stroke: "#3b82f6", accent: "#2563eb", text: "#1e3a8a" };
    const h = lines ? 80 + lines.length * LH + 20 : 110;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardD9)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${palette.fill}" stroke="${palette.stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${palette.accent}"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="${palette.text}" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" fill="${palette.text}" text-anchor="middle">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const X1 = 500, X2 = 1700, X3 = 3000;

  const tableRows = [
    { c1: "C 가 분할출원인 경우", c2: "자동주장간주", c2color: "#15803d", c3: "A 출원일로부터 1년 6개월", c4: "B 출원일로부터 3년" },
    { c1: "C 가 분할출원이 아닌 경우", c2: "불가", c2color: "#b91c1c", c3: "C 출원일로부터 1년 6개월", c4: "C 출원일로부터 3년" },
  ];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardD9" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <marker id="arrD9" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <line x1="40" y1="${T_Y}" x2="${W - 40}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrD9)"/>

  <circle cx="${X1}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
  <circle cx="${X1}" cy="${T_Y}" r="7" fill="#2563eb"/>
  <circle cx="${X2}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
  <circle cx="${X2}" cy="${T_Y}" r="7" fill="#16a34a"/>
  <circle cx="${X3}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
  <circle cx="${X3}" cy="${T_Y}" r="7" fill="#ea580c"/>

  ${aboveBox(X1, "특허출원 A", ["발명 X"], 460, "blue")}
  ${aboveBox(X2, "특허출원 B · 국내우선권주장", ["발명 X, Y"], 700, "green")}
  ${aboveBox(X3, "특허출원 C", ["B 의 일부 발명을 분할 / 별도 출원"], 700, "orange")}

  <!-- bracket: 3개월 -->
  <path d="M${X1},${T_Y + 50} v18 H${X2} v-18" stroke="#64748b" stroke-width="2" fill="none"/>
  <text x="${(X1 + X2) / 2}" y="${T_Y + 110}" font-size="24" font-weight="700" fill="#334155" text-anchor="middle">3개월</text>

  <!-- bracket: 12개월 -->
  <path d="M${X1},${T_Y + 160} v18 H${X3} v-18" stroke="#64748b" stroke-width="2" fill="none"/>
  <text x="${(X1 + X3) / 2}" y="${T_Y + 220}" font-size="24" font-weight="700" fill="#334155" text-anchor="middle">12개월</text>

  <!-- table -->
  <g transform="translate(80, ${T_Y + 280})">
    <rect x="0" y="0" width="3440" height="80" fill="#0f172a"/>
    <line x1="700" y1="0" x2="700" y2="80" stroke="#475569" stroke-width="1"/>
    <line x1="1500" y1="0" x2="1500" y2="80" stroke="#475569" stroke-width="1"/>
    <line x1="2470" y1="0" x2="2470" y2="80" stroke="#475569" stroke-width="1"/>
    <text x="350" y="50" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">구분</text>
    <text x="1100" y="50" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">국내우선권주장</text>
    <text x="1985" y="50" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">출원공개</text>
    <text x="2955" y="50" font-size="24" font-weight="700" fill="#ffffff" text-anchor="middle">심사청구</text>

    ${tableRows.map((r, i) => {
      const y = 80 + i * 110;
      const fill = i === 0 ? "#ffffff" : "#f8fafc";
      return `
      <rect x="0" y="${y}" width="3440" height="110" fill="${fill}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="700" y1="${y}" x2="700" y2="${y + 110}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="1500" y1="${y}" x2="1500" y2="${y + 110}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="2470" y1="${y}" x2="2470" y2="${y + 110}" stroke="#cbd5e1" stroke-width="1"/>
      <text x="350" y="${y + 65}" font-size="22" font-weight="700" fill="#0f172a" text-anchor="middle">${r.c1}</text>
      <text x="1100" y="${y + 65}" font-size="22" font-weight="700" fill="${r.c2color}" text-anchor="middle">${r.c2}</text>
      <text x="1985" y="${y + 65}" font-size="22" fill="#0f172a" text-anchor="middle">${r.c3}</text>
      <text x="2955" y="${y + 65}" font-size="22" fill="#0f172a" text-anchor="middle">${r.c4}</text>`;
    }).join("")}
  </g>
</svg>`;
  SPECS.push({
    problemId: "d934d68d-66c1-40bc-82ff-c32ce510a8d4",
    oldObjectName: "3ea6ebfcd31d86a7c900515d4db79f61.png",
    batch: 7,
    svg,
  });
}

// d9a95c84 — 甲乙 timeline (甲: 5 boxes 학회논문 송부발표 → 논문게재 → 서면발표 → 출원서류 우편발송 → 특허청 도달 / 乙: 독자적 완성 A 출원).
{
  const W = 4200, H = 1500, T_Y = 900;
  const X1 = 400, X2 = 1100, X3 = 1700, X4 = 2400, X5 = 3300, X6 = 3900;
  const svg = makeDualTimelineSvg({
    id: "d9a9",
    W, H, T_Y,
    dates: [
      { x: X1, label: "" },
      { x: X2, label: "" },
      { x: X3, label: "" },
      { x: X4, label: "" },
      { x: X5, label: "" },
      { x: X6, label: "" },
    ],
    aboveBoxes: [
      { cx: X1, title: "대한전자공학회에 A 발명", lines: ["에 관한 논문 송부발표"], w: 540 },
      { cx: X2, title: "논문게재", lines: null, w: 280 },
      { cx: X3, title: "서면발표", lines: null, w: 280 },
      { cx: X4, title: "A 발명국제출원서류(외국", lines: ["어)를 우편으로 발송"], w: 600 },
      { cx: X5, title: "특허청 도달", lines: null, w: 320 },
    ],
    belowBoxes: [
      { cx: X6, title: "독자적으로 완성한 A", lines: ["발명을 특허출원"], w: 480 },
    ],
    arcs: [],
    trailing: "",
  });
  SPECS.push({
    problemId: "d9a95c84-4217-4e9f-b20d-251adafe262f",
    oldObjectName: "9294d6085ebc48da563f5b731443181f.png",
    batch: 7,
    svg,
  });
}

// ea09c569 — single timeline, 4 boxes above with actor label headers (甲/乙/甲/丙 — 전용실시권 설정계약, 실시, 권리이전, 중단경고).
{
  const W = 4200, H = 700;
  const T_Y = 580;
  const TFS = 26, LFS = 22, LH = 32;

  const aboveBox = (cx, title, lines, w) => {
    const h = lines ? 80 + lines.length * LH + 20 : 100;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardEA)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" font-weight="700" fill="#1e3a8a" text-anchor="start">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const X1 = 700, X2 = 1700, X3 = 2600, X4 = 3700;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardEA" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <marker id="arrEA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <line x1="40" y1="${T_Y}" x2="${W - 40}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrEA)"/>

  ${[X1, X2, X3, X4].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(X1, "甲", ["– 乙에게 전용실시권 설정계약,", "  그러나 등록하지 않음"], 800)}
  ${aboveBox(X2, "乙", ["– 실시"], 380)}
  ${aboveBox(X3, "甲", ["– 乙의 동의를 얻어 丙에게", "  특허권 이전"], 660)}
  ${aboveBox(X4, "丙", ["– 乙에게 실시 중단 경고"], 580)}
</svg>`;
  SPECS.push({
    problemId: "ea09c569-89ed-49f7-9879-7e2ed309a0c8",
    oldObjectName: "3398b560227a8f7fe06762774fbfa11b.png",
    batch: 7,
    svg,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Batch 8 (final)
// ─────────────────────────────────────────────────────────────────────────

// eb55ee85 — 甲乙 dual timeline + 현재 심사중 박스에 callout 말풍선.
{
  const W = 4200, H = 1500, T_Y = 900;
  const X1 = 500, X2 = 1200, X3 = 1900, X4 = 2700, X5 = 3700;
  const svg = makeDualTimelineSvg({
    id: "eb55",
    W, H, T_Y,
    dates: [
      { x: X1, label: "" },
      { x: X2, label: "" },
      { x: X3, label: "" },
      { x: X4, label: "" },
      { x: X5, label: "" },
    ],
    aboveBoxes: [
      { cx: X2, title: "미국출원(1)", lines: ["– A"], w: 380 },
      { cx: X4, title: "한국출원(2)–조약우선권주장", lines: ["– A"], w: 700 },
      { cx: X5, title: "현재 심사중(2)", lines: null, w: 380 },
    ],
    belowBoxes: [
      { cx: X1, title: "저명한 학술잡지 발표", lines: ["– A"], w: 480 },
      { cx: X3, title: "한국출원(3)–공지예외적용주장", lines: ["– A"], w: 700 },
    ],
    arcs: [],
    trailing: `
    <g>
      <rect x="${X5 - 220}" y="490" width="440" height="120" rx="14" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
      <text x="${X5}" y="540" font-size="24" font-weight="700" fill="#92400e" text-anchor="middle">한국출원(2)가 출원공개</text>
      <text x="${X5}" y="580" font-size="24" font-weight="700" fill="#92400e" text-anchor="middle">되었음을 의미</text>
      <path d="M${X5 - 16},610 L${X5},660 L${X5 + 16},610 Z" fill="#fef3c7"/>
      <path d="M${X5 - 16},610 L${X5},660 L${X5 + 16},610" stroke="#f59e0b" stroke-width="2" fill="none" stroke-linejoin="round"/>
      <line x1="${X5 - 16}" y1="610" x2="${X5 + 16}" y2="610" stroke="#fef3c7" stroke-width="4"/>
    </g>`,
  });
  SPECS.push({
    problemId: "eb55ee85-fc16-4012-9d47-3eef70afa418",
    oldObjectName: "dfd1f2b9d4eb96f1bbf506e8363f95d2.png",
    batch: 8,
    svg,
  });
}

// f2ceb436 — single 甲 timeline, 5 boxes above (특허출원→심사청구→OA→의견서/보정서→특허결정).
{
  const W = 4400, H = 800, T_Y = 650;
  const TFS = 26, LFS = 22, LH = 32;

  const aboveBox = (cx, title, lines, w, gray) => {
    const h = lines ? 80 + lines.length * LH + 20 : 100;
    const y = T_Y - 80 - h;
    const fill = gray ? "#e5e7eb" : "#eff6ff";
    const stroke = gray ? "#6b7280" : "#3b82f6";
    const accent = gray ? "#4b5563" : "#2563eb";
    const text = gray ? "#111827" : "#1e3a8a";
    return `
    <g filter="url(#cardF2)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="${accent}"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="${text}" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" font-weight="700" fill="${text}" text-anchor="start">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const X1 = 600, X2 = 1500, X3 = 2200, X4 = 3000, X5 = 3900;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardF2" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <filter id="chipF2" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.18"/>
    </filter>
    <marker id="arrF2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <g filter="url(#chipF2)"><rect x="40" y="${T_Y - 50}" width="100" height="100" rx="20" fill="#2563eb"/></g>
  <text x="90" y="${T_Y + 18}" font-size="48" font-weight="700" fill="#ffffff" text-anchor="middle">甲</text>

  <line x1="160" y1="${T_Y}" x2="${W - 40}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrF2)"/>

  ${[X1, X2, X3, X4, X5].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(X1, "특허출원(X)", ["– 청구범위: A", "– 발명의설명: A, B, C"], 580)}
  ${aboveBox(X2, "심사청구(X)", null, 320)}
  ${aboveBox(X3, "OA(X)", ["– 진보성 위반 by 인용발명 1"], 620, true)}
  ${aboveBox(X4, "의견서/보정서(X)", ["– 청구범위: A삭제, B추가"], 620)}
  ${aboveBox(X5, "특허결정등본송달(X)", null, 480, true)}
</svg>`;
  SPECS.push({
    problemId: "f2ceb436-5e32-42ff-8217-0c8e2bc2f987",
    oldObjectName: "fdb0091777444615733d7cb34bc78608.png",
    batch: 8,
    svg,
  });
}

// f91a7270 — above/below split timeline, no actor chip, 6 boxes + 빨간 점선 + 라벨.
{
  const W = 4400, H = 1500, T_Y = 750;
  const TFS = 26, LFS = 22, LH = 32;

  const aboveBox = (cx, title, lines, w) => {
    const h = lines ? 80 + lines.length * LH + 20 : 100;
    const y = T_Y - 80 - h;
    return `
    <g filter="url(#cardF9)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#2563eb"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="#1e3a8a" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" font-weight="700" fill="#1e3a8a" text-anchor="start">${ln}</text>`).join("")}
    <line x1="${cx}" y1="${y + h}" x2="${cx}" y2="${T_Y - 14}" stroke="#1e293b" stroke-width="3"/>`;
  };

  const belowBox = (cx, title, lines, w) => {
    const h = lines ? 80 + lines.length * LH + 20 : 100;
    const y = T_Y + 90;
    return `
    <line x1="${cx}" y1="${T_Y + 14}" x2="${cx}" y2="${y}" stroke="#1e293b" stroke-width="3"/>
    <g filter="url(#cardF9)">
      <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="14" fill="#f0fdf4" stroke="#22c55e" stroke-width="2"/>
      <rect x="${cx - w / 2}" y="${y}" width="8" height="${h}" rx="4" fill="#16a34a"/>
    </g>
    <text x="${cx}" y="${y + 50}" font-size="${TFS}" font-weight="700" fill="#14532d" text-anchor="middle">${title}</text>
    ${(lines || []).map((ln, i) => `<text x="${cx - w / 2 + 30}" y="${y + 50 + 36 + i * LH}" font-size="${LFS}" font-weight="700" fill="#14532d" text-anchor="start">${ln}</text>`).join("")}`;
  };

  const X1 = 500, X2 = 1300, X3 = 2000, X4 = 2700, X5 = 3400, X6 = 4050;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">
  <defs>
    <filter id="cardF9" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.10"/>
    </filter>
    <marker id="arrF9" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="#1e293b"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#fcfcfd"/>

  <line x1="40" y1="${T_Y}" x2="${W - 40}" y2="${T_Y}" stroke="#1e293b" stroke-width="4" marker-end="url(#arrF9)"/>

  ${[X1, X2, X3, X4, X5, X6].map((x) => `
    <circle cx="${x}" cy="${T_Y}" r="14" fill="#ffffff" stroke="#1e293b" stroke-width="3"/>
    <circle cx="${x}" cy="${T_Y}" r="7" fill="#2563eb"/>`).join("")}

  ${aboveBox(X1, "발명자 A가 X에 대한 특허를", ["받을 수 있는 권리를 E에게 양도"], 700)}
  ${aboveBox(X3, "E 특허출원(1)", ["– 청구범위: X", "– 발명의 설명: X, X의 용도발명"], 720)}
  ${aboveBox(X5, "E 보정(1)", ["– 발명의 설명에서 X의 용도발명 삭제"], 800)}

  ${belowBox(X2, "발명자 B가 X의 용도발명 완성", null, 700)}
  ${belowBox(X4, "E 특허출원(2)", ["– 청구범위: X의 용도발명", "– 발명의 설명: X의 용도발명"], 720)}
  ${belowBox(X6, "E가 특허출원(2)를 F에게 양도", null, 680)}

  <!-- 빨간 점선 + 라벨 -->
  <line x1="${X4}" y1="60" x2="${X4}" y2="${H - 60}" stroke="#dc2626" stroke-width="3" stroke-dasharray="2 8"/>
  <rect x="${X4 - 360}" y="40" width="720" height="60" rx="10" fill="#fcfcfd"/>
  <text x="${X4}" y="80" font-size="28" font-weight="700" fill="#dc2626" text-anchor="middle">(2)출원시 (2)출원인=(1)출원인</text>
</svg>`;
  SPECS.push({
    problemId: "f91a7270-2a46-433f-a873-e5f90700b920",
    oldObjectName: "c180ac4f139bee68d492326928f6c98f.png",
    batch: 8,
    svg,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 처리 루프
// ─────────────────────────────────────────────────────────────────────────

const filtered = SPECS.filter((s) => {
  if (ONLY_PID && s.problemId !== ONLY_PID) return false;
  if (BATCH_NUM != null && s.batch !== BATCH_NUM) return false;
  return true;
});

console.log(`처리 대상: ${filtered.length} / ${SPECS.length}`);

let updated = 0;
for (const spec of filtered) {
  const ts =
    spec.timelineSpec && VERTICAL
      ? { ...spec.timelineSpec, layout: "vertical" }
      : spec.timelineSpec;
  const svg = spec.svg ?? renderTimelineSvg(ts);
  const png = await sharp(Buffer.from(svg), { density: 200 })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = await sharp(png).metadata();

  const previewSuffix = spec.oldObjectName.slice(0, 6);
  const previewName = `${spec.problemId}__${previewSuffix}.png`;
  writeFileSync(`${PREVIEW_DIR}/${previewName}`, png);
  writeFileSync(`${PREVIEW_DIR}/${spec.problemId}__${previewSuffix}.svg`, svg);
  console.log(`  ${spec.problemId}: ${meta.width}x${meta.height}, ${(png.length / 1024).toFixed(1)}KB`);

  if (!APPLY) continue;

  // 라이브 explanation_md 를 먼저 조회 → 현재 이미지 URL 을 직접 치환.
  //   기존엔 spec.oldObjectName 으로 mcgdoplo URL 을 조립해 replaceAll 했는데, 라이브가
  //   구 호스트(nctokynz)·다른 해시인 경우 매칭 실패로 조용히 skip 됐음.
  //   → md 에 실제로 들어있는 이미지 URL 을 그대로 신규 URL 로 교체(호스트/해시 무관).
  const { data: prob, error: qErr } = await supa
    .from("problems")
    .select("explanation_md")
    .eq("problem_id", spec.problemId)
    .single();
  if (qErr || !prob) {
    console.error(`    ✗ problem 조회: ${qErr?.message}`);
    continue;
  }
  const before = prob.explanation_md ?? "";
  const imgUrls = [...before.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  const oldStem = spec.oldObjectName.replace(/\.[a-z0-9]+$/i, "");
  // 이미지 1개면 그걸 교체. 여러 개면 oldObjectName 으로 특정.
  const targetUrl =
    imgUrls.length === 1
      ? imgUrls[0]
      : (imgUrls.find((u) => u.includes(oldStem)) ?? null);
  if (!targetUrl) {
    console.warn(`    ⚠ 치환 대상 불명 (이미지 ${imgUrls.length}개, old=${spec.oldObjectName})`);
    continue;
  }

  // Storage 업로드.
  const newHash = createHash("sha256").update(png).digest("hex").slice(0, 32);
  const newObject = `${newHash}.png`;
  const newUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${newObject}`;
  const { error: upErr } = await supa.storage.from(BUCKET).upload(newObject, png, {
    contentType: "image/png",
    upsert: false,
  });
  if (upErr && !/already exists|duplicate/i.test(upErr.message)) {
    console.error(`    ✗ upload: ${upErr.message}`);
    continue;
  }

  // DB 업데이트 — 현재 이미지 URL → 신규 URL.
  const after = before.replaceAll(targetUrl, newUrl);
  if (before === after) {
    console.warn(`    ⚠ 치환 무효 (${targetUrl.slice(0, 50)})`);
    continue;
  }
  const { error: uErr } = await supa
    .from("problems")
    .update({ explanation_md: after })
    .eq("problem_id", spec.problemId);
  if (uErr) {
    console.error(`    ✗ DB update: ${uErr.message}`);
    continue;
  }
  updated += 1;
}

console.log(`\n결과: ${filtered.length} 처리, ${updated} DB 업데이트`);
if (!APPLY) console.log("dry-run — 적용하려면 --apply");
