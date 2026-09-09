// 표가 화면 높이 안에 들어오는 글자 크기를 실제 글자 수로 어림한다.
//   node scripts/digest/estimate-height.mjs [쪽번호…]
//
// 한글은 글자 하나가 대략 글자크기만큼 넓다(1em). 칸 너비를 글자크기로 나누면
// 한 줄에 들어가는 글자 수가 나오고, 줄 수 × 줄높이가 그 칸의 높이다.
// 줄의 높이는 그 줄에서 가장 높은 칸이 정한다.
import { readFileSync } from "node:fs";

const PAGES = process.argv.slice(2).map(Number);
const 대상 = PAGES.length ? PAGES : [4, 5, 6, 8];

// 좌패널(280) + 사이(24) + 바깥여백(80) + 카드 안쪽(34) 을 뺀 본문 폭. 1536 화면 기준.
const CONTENT_W = 1536 - 80 - 280 - 24 - 34;
// 머리(네비)·현황 카드·표 머리줄을 뺀, 한눈에 보이는 높이.
const VIEW_H = 760;

const doc = JSON.parse(readFileSync("scripts/digest/pipeline/정리비교표.json", "utf8"));
const spanOf = (a, n) => Number(a.match(new RegExp(`${n}="(\\d+)"`))?.[1] ?? 1);

for (const page of 대상) {
  const src = doc.pages[page - 1].tables[0];
  const rows = src.split("<tr>").slice(1).map((r) => r.replace(/<\/tr>[\s\S]*/, ""));
  const r0 = [...rows[0].matchAll(/<td([^>]*)>/g)].map((m) => m[1]);
  const total = r0.reduce((n, a) => n + spanOf(a, "colspan"), 0);
  const keycols = spanOf(r0[0] ?? "", "colspan");

  const line = [];
  for (const fs of [12.5, 11, 10, 9, 8]) {
    const pad = fs >= 11 ? 8 : 6; // 좌우 안쪽 여백 합
    const keyW = 22 * keycols;
    const colW = (CONTENT_W - keyW - total * pad) / (total - keycols);
    const perLine = Math.max(1, Math.floor(colW / fs));
    const lineH = fs * 1.5;

    let h = 0;
    for (const r of rows) {
      const cells = [...r.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
      let tall = 1;
      for (const [, attrs, html] of cells) {
        const cs = spanOf(attrs, "colspan");
        const rs = spanOf(attrs, "rowspan");
        const text = html.replace(/<br>/g, "").replace(/\s+/g, "");
        const w = cs * colW;
        const lines = Math.ceil(text.length / Math.max(1, Math.floor(w / fs)));
        tall = Math.max(tall, Math.ceil(lines / rs)); // 세로 병합은 여러 줄이 나눠 갖는다
      }
      h += tall * lineH + 8;
    }
    line.push(`${fs}px→${Math.round(h)}px${h <= VIEW_H ? "✔" : ""}`);
  }
  console.log(`${String(page).padStart(2)}p (열 ${total}, 목차 ${keycols})  ${line.join("  ")}`);
}
console.log(`\n기준: 본문 폭 ${CONTENT_W}px · 한눈에 보이는 높이 ${VIEW_H}px`);
