// 법원도서관 「대법원판례해설 총목록(분야별)」 파싱 + 제목 짝짓기.
//
// 권호·면수의 권위는 이 총목록이다(메모: haeseol-volume-authority). 두 스크립트가
// 같은 표를 읽으므로 규칙은 여기 한 곳에만 둔다 — 따로 두면 한쪽만 고쳐진다.
//
// ★줄 순서로 읽으면 안 된다. 논제가 여러 줄로 접히면 저자·면수 줄이 그 사이에
//   끼어 들어와, 앞 항목의 제목에 뒤 항목 조각이 붙는다(실측: 100호 165면 항목에
//   다음 항목 제목이 통째로 딸려 들어왔다). **x 좌표로 열을 가른다.**
import fs from "node:fs";
import * as mupdf from "mupdf";

export const TOC_PDF = "source/법원간행물/category_146.pdf";
/** 지식재산권 분야가 실린 쪽 범위(쪽머리로 확인). */
export const TOC_FROM = 305, TOC_TO = 338;

/** 열 경계(쪽마다 같은 자리에 찍힌다 — 권호 67 · 논제 95 · 저자 330 · 면수 410). */
const X_VOL = 92, X_TITLE = 320, X_AUTHOR = 405;

/** 목록 제목에 섞인 편집 흔적(앞 분류표시·뒤 인용정보) 제거. */
export const cleanTitle = (t) =>
  (t ?? "")
    .replace(/^\s*지식재산권\s*\d+\s*/, "")
    .replace(/\s+\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*선고[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim();

// ★구두점은 전부 버린다 — 두 자료가 같은 자리를 ㆍ / _ / ? 로 제각각 쓴다.
export const norm = (s) => cleanTitle(s).replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();

const AUTHOR_YEAR = /^(.*?)((?:19|20)\d{2}년(?:\s*[상하])?)$/;
// ★"19-2호" 처럼 분책된 권호가 있다.
const VOL = /^(\d+(?:-\d+)?)호$/;

export function parseToc(pdfPath = TOC_PDF, from = TOC_FROM, to = TOC_TO) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(pdfPath), "application/pdf");
  const anchors = [];  // 면수 = 한 항목당 정확히 한 줄
  const labels = [];   // 권호
  const titles = [];
  const authors = [];
  for (let p = from; p <= to; p++) {
    const st = JSON.parse(doc.loadPage(p - 1).toStructuredText().asJSON());
    const lines = [];
    for (const b of st.blocks ?? [])
      for (const l of b.lines ?? []) {
        const t = (l.text ?? "").trim();
        if (t) lines.push({ p, y: l.bbox.y, x: l.bbox.x, w: l.bbox.w, t });
      }
    // 쪽머리(41 근처)와 표 머리(85 근처) 아래만 본다.
    const head = lines.find((l) => l.t === "권호");
    const top = head ? head.y + 5 : 95;
    for (const l of lines) {
      if (l.y < top) continue;
      if (l.x >= X_AUTHOR) { const n = Number(l.t.replace(/[^\d]/g, "")); if (n) anchors.push({ ...l, page: n }); }
      else if (l.x >= X_TITLE) authors.push(l);
      else if (l.x >= X_VOL) {
        // ★같은 줄에 놓인 논제와 저자를 mupdf 가 한 줄로 묶어 오는 쪽이 있다
        //   ("…분할청구권이 인정되는지 여부 장낙원2014년 하"). 꼬리를 떼어 저자로 돌린다.
        const tail = /\s(\S{2,5})\s*((?:19|20)\d{2}년(?:\s*[상하])?)(?:\s+(\d{1,4}))?$/.exec(l.t);
        if (tail && l.x + l.w > X_TITLE) {
          titles.push({ ...l, t: l.t.slice(0, tail.index).trim() });
          authors.push({ ...l, x: X_TITLE, t: tail[1] + tail[2] });
          if (tail[3]) anchors.push({ ...l, x: X_AUTHOR, page: Number(tail[3]) });
        } else titles.push(l);
      }
      else {
        // ★권호 칸과 논제 칸이 한 줄로 묶여 오는 쪽이 있다("19-2호편집저작권의 침해").
        //   그냥 버리면 그 행의 제목이 통째로 사라져 이후 행들이 한 칸씩 밀린다.
        const lead = /^(\d+(?:-\d+)?)호/.exec(l.t);
        if (!lead) continue;
        labels.push({ ...l, vol: lead[1] });
        const rest = l.t.slice(lead[0].length).trim();
        if (rest) titles.push({ ...l, x: X_VOL + 3, t: rest });
      }
    }
  }
  const pos = (a) => a.p * 10000 + a.y;
  anchors.sort((a, b) => pos(a) - pos(b));
  labels.sort((a, b) => pos(a) - pos(b));
  const nearest = (list, a) => {
    let best = null, d = Infinity;
    for (const x of list) {
      if (x.p !== a.p) continue;
      const dy = Math.abs(x.y - a.y);
      if (dy < d) { d = dy; best = x; }
    }
    return best;
  };
  // 논제 줄 → 행 배정.
  // ★"가장 가까운 면수 줄"로 붙이면 안 된다 — 논제가 네댓 줄로 접힌 행은 첫 줄이
  //   앞 행의 면수에 더 가깝다(실제로 제목 첫 줄이 앞 항목으로 새 나갔다).
  //   한 쪽 안에서 논제 줄은 행 순서대로 이어지므로, **행 개수만큼 연속으로 자른다**.
  const titleOf = new Map();
  const pagesOf = new Set(titles.map((t) => t.p));
  for (const p of pagesOf) {
    const ts = titles.filter((t) => t.p === p).sort((a, b) => a.y - b.y);
    const as = anchors.filter((a) => a.p === p).sort((a, b) => a.y - b.y);
    if (as.length === 0) continue;
    if (as.length === 1) { titleOf.set(pos(as[0]), ts); continue; }
    const n = ts.length, k = Math.min(as.length, n);
    const dp = Array.from({ length: k + 1 }, () => new Float64Array(n + 1).fill(Infinity));
    const back = Array.from({ length: k + 1 }, () => new Int32Array(n + 1).fill(-1));
    dp[0][0] = 0;
    for (let j = 1; j <= k; j++)
      for (let b = j; b <= n - (k - j); b++)
        for (let a = j - 1; a < b; a++) {
          if (!Number.isFinite(dp[j - 1][a])) continue;
          let sum = 0;
          for (let i = a; i < b; i++) sum += ts[i].y;
          const c = dp[j - 1][a] + Math.abs(sum / (b - a) - as[j - 1].y);
          if (c < dp[j][b]) { dp[j][b] = c; back[j][b] = a; }
        }
    let b = n;
    for (let j = k; j >= 1; j--) {
      const a = back[j][b];
      titleOf.set(pos(as[j - 1]), ts.slice(a, b));
      b = a;
    }
  }
  const out = anchors.map((a) => {
    // ★저자·발간년도가 두세 조각으로 끊겨 오기도 한다("황" + "익1990년 하").
    //   같은 줄(±3px)에 있는 조각을 x 순으로 이어 붙인다.
    const near = authors.filter((x) => x.p === a.p && Math.abs(x.y - a.y) <= 3);
    const au = near.length
      ? { t: near.sort((x, y) => x.x - y.x).map((x) => x.t).join("") }
      : nearest(authors, a);
    const m = au ? AUTHOR_YEAR.exec(au.t) : null;
    return {
      vol: null, page: a.page,
      title: (titleOf.get(pos(a)) ?? []).sort((x, y) => x.y - y.y).map((x) => x.t).join(" ").replace(/\s+/g, " ").trim(),
      author: m ? m[1].trim() : (au?.t ?? "").trim(),
      pub: m ? m[2].trim() : "",
      _p: a.p, _y: a.y,
    };
  });
  // 권호 배정 — 항목 순서를 라벨 개수만큼 **연속 구간**으로 자른다.
  //
  // ★"라벨과 가장 가까운 것"으로 붙이면 안 된다. 권호는 병합 셀 한가운데에 찍혀서
  //   같은 호의 위쪽 행들이 앞 호 라벨에 더 가깝다(한 호에 발간반기가 셋씩 섞였다).
  // 대신 세 가지를 함께 만족시키는 자름을 찾는다(DP):
  //   ① 한 호 안에서 발간반기는 하나 ② 면수는 커진다 ③ 구간의 세로 중심이 라벨과 가깝다
  const n = out.length, k = labels.length;
  const Y = out.map((e) => e._p * 10000 + e._y);
  const LY = labels.map((l) => pos(l));
  const BIG = 1e6;
  // cost[a][b] = 항목 a..b 를 한 호로 묶을 때의 어긋남(발간반기·면수)
  const spanCost = (a, b, j) => {
    let bad = 0;
    const pubs = new Set();
    for (let i = a; i <= b; i++) {
      if (out[i].pub) pubs.add(out[i].pub);
      if (i > a && out[i].page < out[i - 1].page) bad++;
    }
    bad += Math.max(0, pubs.size - 1);
    const mid = (Y[a] + Y[b]) / 2;
    return bad * BIG + Math.abs(mid - LY[j]);
  };
  const dp = Array.from({ length: k + 1 }, () => new Float64Array(n + 1).fill(Infinity));
  const back = Array.from({ length: k + 1 }, () => new Int32Array(n + 1).fill(-1));
  dp[0][0] = 0;
  for (let j = 1; j <= k; j++)
    for (let b = j; b <= n - (k - j); b++)
      for (let a = j - 1; a < b; a++) {
        const v = dp[j - 1][a];
        if (!Number.isFinite(v)) continue;
        const c = v + spanCost(a, b - 1, j - 1);
        if (c < dp[j][b]) { dp[j][b] = c; back[j][b] = a; }
      }
  let b = n;
  for (let j = k; j >= 1; j--) {
    const a = back[j][b];
    for (let i = a; i < b; i++) out[i].vol = labels[j - 1].vol;
    b = a;
  }
  return out.map(({ _p, _y, ...e }) => e);
}

/**
 * 제목으로 총목록 항목을 찾는다 — 사건번호는 총목록에 없다.
 * ★완전 일치를 먼저 본다. 앞부분만 겹치는 것으로 고르면 "…기속력"(41호)이
 *   "…기속력과 새로운 증거의 의의"(43호)에 잘못 붙는다.
 */
export function makeFinder(toc) {
  const idx = toc.map((e) => ({ e, key: norm(e.title) }));
  return function find(title, author) {
    const k = norm(title);
    if (!k) return null;
    const exact = idx.filter((x) => x.key === k);
    if (exact.length === 1) return exact[0].e;
    if (exact.length > 1) return (exact.find((x) => norm(x.e.author) === norm(author)) ?? exact[0]).e;
    let best = null, score = -Infinity;
    for (const { e, key } of idx) {
      if (!key) continue;
      const [short, long] = key.length < k.length ? [key, k] : [k, key];
      if (!long.startsWith(short) || short.length < 8) continue;
      const sameAuthor = norm(e.author) === norm(author);
      if (short.length < 12 && !sameAuthor) continue;
      // 길이 차가 작을수록 좋다 — 저자 일치는 그보다 우선.
      const s = (sameAuthor ? 1000 : 0) - (long.length - short.length);
      if (s > score) { best = e; score = s; }
    }
    return best;
  };
}
