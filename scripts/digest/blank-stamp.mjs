// 정리비교표 **빈칸 학습**용 좌표 박기 — 목차를 누르면 그 자리가 빈칸이 된다.
//
// 원장 지시(2026-09-10):
//   · 「특허요건」(모서리)  → 목차를 뺀 **내용 전체**가 빈칸
//   · 「의의」(행 목차)     → 그 오른쪽 **가로줄 전부**가 빈칸
//   · 「진보성」(열 목차)   → 그 아래 **세로줄 전부**가 빈칸
//   그리고 표가 아닌 네 화면(체계도·총칙·번역문 제출·국제조약)도 같은 뜻으로.
//
// ★비는 건 **내용뿐이다.** 목차(표의 th, 체계도의 단원명·묶음명, 도형의 갈래 제목·축)는
//   절대 비지 않는다 — 그래야 「판단」처럼 목차 안에 목차가 든 자리도 규칙 하나로 풀린다.
// ★**원래 빈 칸은 빈칸으로 만들지 않는다.** 가린 것인지 원래 없는 것인지 구분이 안 되면
//   학생이 있지도 않은 답을 찾는다.
// ★좌표는 여기서 **미리 박는다**. 브라우저에서 재서 맞추는 방식은 이 화면에서 세 번
//   연속 듣지 않았다(2026-09-10) — 재지 않으면 어긋날 것도 없고, 결과를 노드에서
//   그대로 검사할 수 있다(check-blanks.mjs).
//
// 박는 속성(화면은 이것만 읽는다 — app/features/subjects/hooks/use-digest-blanks.ts):
//   내용: data-dg-r/-c/-rs/-cs   (자리. 열쇠는 `r:c`)
//   목차: data-dg-blank="row|col|all|set" (+ data-dg-from/-to 또는 data-dg-keys)

const CELL_RE = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g;
const ROW_RE = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/g;

const spanOf = (attrs, name) => {
  const n = Number(attrs.match(new RegExp(`${name}="(\\d+)"`))?.[1] ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

/** 글자가 든 칸인가 — 태그·공백·빈칸문자를 걷어내고 남는 게 있는지 본다. */
const hasText = (html) =>
  html.replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;/g, " ").trim().length > 0;

/** 여는 태그에 속성을 덧붙인다(`<td>` → `<td data-...>`). */
const withAttrs = (tag, attrs, add) => `<${tag}${attrs}${add}>`;

// ─────────────────────────────────────────────────────────── 표(4~10·11-0·12p)

/**
 * 표 한 개에 좌표를 박는다.
 * @returns {{html:string, stats:object|null}}
 */
export function stampTable(tableHtml) {
  // ── 1) 줄 뜯기. 머리줄(thead) 수를 세어 둔다 — 열 목차와 행 목차를 가르는 기준이다.
  const theadEnd = tableHtml.indexOf("</thead>");
  const rows = [];
  ROW_RE.lastIndex = 0;
  let m;
  while ((m = ROW_RE.exec(tableHtml))) {
    rows.push({ attrs: m[1], inner: m[2], at: m.index, raw: m[0] });
  }
  if (!rows.length) return { html: tableHtml, stats: null };

  for (const r of rows) {
    r.head = theadEnd >= 0 && r.at < theadEnd;
    r.cells = [];
    CELL_RE.lastIndex = 0;
    let c;
    while ((c = CELL_RE.exec(r.inner))) {
      r.cells.push({ tag: c[1], attrs: c[2], body: c[3], raw: c[0] });
    }
    // 내용칸이 하나도 없는 줄 = 묶음 머리(10p 「소송요건심리」). 머리줄과는 다르다.
    r.groupOnly = !r.head && r.cells.length > 0 && r.cells.every((x) => x.tag === "th");
  }

  // ── 2) 격자 좌표. 위에서 내려오는 rowspan 을 세어 두지 않으면 열 번호가 밀린다.
  const held = []; // 열마다 남은 rowspan
  let maxCol = 0;
  rows.forEach((r, ri) => {
    let col = 0;
    for (const cell of r.cells) {
      while (held[col] > 0) col += 1;
      const cs = spanOf(cell.attrs, "colspan");
      const rs = spanOf(cell.attrs, "rowspan");
      cell.r = ri;
      cell.c = col;
      cell.rs = rs;
      cell.cs = cs;
      for (let k = col; k < col + cs; k += 1) held[k] = rs;
      col += cs;
    }
    maxCol = Math.max(maxCol, col);
    for (let k = 0; k < held.length; k += 1) if (held[k] > 0) held[k] -= 1;
  });

  // ── 3) 목차 열 수 = 행 목차칸이 차지하는 왼쪽 폭. 「특허요건」 모서리를 가려내는 데 쓴다.
  //   (표마다 다르다 — 4p 는 3열, 10p 는 1열, 열 목차가 없는 쪽도 있다.)
  let keycols = 0;
  for (const r of rows) {
    if (r.head || r.groupOnly) continue;
    for (const cell of r.cells) {
      if (cell.tag === "th") keycols = Math.max(keycols, cell.c + cell.cs);
    }
  }

  // ── 4) 묶음 머리가 다스리는 줄 범위 — 다음 묶음 머리 직전까지.
  const groupTo = new Map();
  const groupRows = rows.filter((r) => r.groupOnly).map((r) => rows.indexOf(r));
  groupRows.forEach((ri, i) => {
    const next = groupRows[i + 1] ?? rows.length;
    groupTo.set(ri, next - 1);
  });

  // ── 5) 속성 박기.
  const stats = { rows: rows.length, cols: maxCol, cells: 0, heads: 0 };
  for (const r of rows) {
    for (const cell of r.cells) {
      let add = "";
      if (cell.tag === "td") {
        if (!hasText(cell.body)) continue; // 원래 빈 칸은 건드리지 않는다
        add =
          ` data-dg-r="${cell.r}" data-dg-c="${cell.c}"` +
          ` data-dg-rs="${cell.rs}" data-dg-cs="${cell.cs}"`;
        stats.cells += 1;
      } else if (r.head) {
        // 열 목차. 목차 열만 덮는 것(왼쪽 위 모서리)은 표 전체를 뜻한다.
        const corner = keycols > 0 && cell.c + cell.cs <= keycols;
        add = corner
          ? ` data-dg-blank="all"`
          : ` data-dg-blank="col" data-dg-from="${cell.c}" data-dg-to="${cell.c + cell.cs - 1}"`;
        stats.heads += 1;
      } else if (r.groupOnly) {
        const to = groupTo.get(cell.r);
        if (to === undefined || to <= cell.r) continue; // 다스릴 줄이 없다
        add = ` data-dg-blank="row" data-dg-from="${cell.r + 1}" data-dg-to="${to}"`;
        stats.heads += 1;
      } else {
        // 행 목차. rowspan 만큼의 줄을 다스린다(「판단」 = 7줄).
        add = ` data-dg-blank="row" data-dg-from="${cell.r}" data-dg-to="${cell.r + cell.rs - 1}"`;
        stats.heads += 1;
      }
      if (!add) continue;
      // 목차칸은 눌러서 쓰는 자리다 — 키보드로도 닿아야 한다.
      if (cell.tag === "th") add += ' tabindex="0"';
      cell.stamped = withAttrs(cell.tag, cell.attrs, add) + cell.body + `</${cell.tag}>`;
    }
  }

  // ── 6) 되붙이기. 칸 단위로 바꾼 것만 갈아 끼운다(나머지 글자는 손대지 않는다).
  let html = tableHtml;
  for (const r of rows) {
    let inner = r.inner;
    for (const cell of r.cells) {
      if (!cell.stamped) continue;
      const at = inner.indexOf(cell.raw);
      if (at < 0) throw new Error("칸을 되찾지 못했습니다");
      inner = inner.slice(0, at) + cell.stamped + inner.slice(at + cell.raw.length);
    }
    if (inner === r.inner) continue;
    const next = `<tr${r.attrs}>${inner}</tr>`;
    const at = html.indexOf(r.raw);
    if (at < 0) throw new Error("줄을 되찾지 못했습니다");
    html = html.slice(0, at) + next + html.slice(at + r.raw.length);
  }
  return { html, stats: { ...stats, keycols } };
}

// ──────────────────────────────────────────────────── 체계도(2p) — 표가 아니라 목록

/** `<li ...>` 하나의 짝 `</li>` 자리를 찾는다(중첩 목록이 있어 그냥 셀 수 없다). */
function endOfLi(html, open) {
  let depth = 0;
  const re = /<li\b|<\/li>/g;
  re.lastIndex = open;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === "</li>") {
      depth -= 1;
      if (depth === 0) return m.index + 5;
    } else depth += 1;
  }
  throw new Error("</li> 짝을 찾지 못했습니다");
}

/**
 * 체계도는 단원 카드 안에 중첩 목록이 든 구조다.
 *   단원 이름(h2)   → 그 카드의 잎 전부
 *   묶음 제목(.cap) → 그 묶음 안의 잎 전부
 *   잎(li.leaf)     → 내용
 */
export function stampCards(bodyHtml) {
  const stats = { cards: 0, cells: 0, heads: 0 };
  const cards = [...bodyHtml.matchAll(/<section class="card">[\s\S]*?<\/section>/g)];
  let out = bodyHtml;

  // 뒤 카드부터 갈아 끼운다 — 앞자리가 밀리지 않는다.
  for (let ci = cards.length - 1; ci >= 0; ci -= 1) {
    const raw = cards[ci][0];
    let card = raw;

    // 잎에 자리를 준다. 잎 안에는 `<li>` 가 없어 짝 찾기가 필요 없다.
    const leaves = [...card.matchAll(/<li class="leaf[^"]*">(?:(?!<li)[\s\S])*?<\/li>/g)];
    const edits = [];
    leaves.forEach((m, i) => {
      edits.push({
        at: m.index,
        len: m[0].length,
        html: m[0].replace(
          /^<li class="([^"]*)">/,
          `<li class="$1" data-dg-r="${ci}" data-dg-c="${i}" data-dg-rs="1" data-dg-cs="1">`,
        ),
      });
      stats.cells += 1;
    });

    // 묶음 제목이 다스리는 잎 = 그 `<li class="grp">` 범위 안에 든 잎.
    for (const g of card.matchAll(/<li class="grp[^"]*">/g)) {
      const end = endOfLi(card, g.index);
      const keys = leaves
        .map((m, i) => (m.index > g.index && m.index < end ? `${ci}:${i}` : null))
        .filter(Boolean);
      const cap = card.slice(g.index, end).match(/<span class="cap">/);
      if (!keys.length || !cap) continue;
      edits.push({
        at: g.index + cap.index,
        len: cap[0].length,
        html: `<span class="cap" data-dg-blank="set" data-dg-keys="${keys.join(" ")}" tabindex="0">`,
      });
      stats.heads += 1;
    }

    const h2 = card.match(/<h2>/);
    if (h2 && leaves.length) {
      edits.push({
        at: h2.index,
        len: h2[0].length,
        html: `<h2 data-dg-blank="row" data-dg-from="${ci}" data-dg-to="${ci}" tabindex="0">`,
      });
      stats.heads += 1;
    }

    edits.sort((a, b) => b.at - a.at);
    for (const e of edits) card = card.slice(0, e.at) + e.html + card.slice(e.at + e.len);
    out = out.slice(0, cards[ci].index) + card + out.slice(cards[ci].index + raw.length);
    stats.cards += 1;
  }
  return { html: out, stats };
}

// ────────────────────────────────── 도형(3p 총칙 · 11p-1 번역문 제출 · 13p 국제조약)

/**
 * 화면별 규칙. 도형은 쪽마다 상자 종류가 달라 한 규칙으로 묶이지 않는다 —
 * **확실한 것만** 적는다. 근거 없이 묶으면 학생이 엉뚱한 짝을 외운다.
 */
const DIAGRAM_RULES = {
  // 총칙: 갈래 테두리(panel) 제목을 누르면 그 테두리 **안에 든** 상자가 빈칸.
  //   축(spine·anchor)은 총칙의 뼈대라 목차로 남기고 누르지 않는다 — 이 그림은 나무처럼
  //   퍼져서 축의 줄과 잎의 줄이 맞지 않는다(줄로 맞추면 엉뚱한 짝이 된다).
  3: { content: ["leaf"], group: { head: "panel", by: "inside" } },
  // 번역문 제출: 왼쪽 칸(item)은 전부 「제201조 제N항」이다 — 글에 적혀 있어 확실하다.
  //   오른쪽 관련 조문(ref)은 어느 항에 붙는지 그림만으로 정해지지 않아 묶지 않는다
  //   (하나씩 누르거나 「전부 빈칸」으로 쓴다).
  "11-1": { content: ["item", "ref"], group: { head: "key", by: "kind", take: "item" } },
  // 국제조약: 조약 이름(spine)을 누르면 **바로 오른쪽** 설명(note)이 빈칸.
  //   설명마다 왼쪽에서 가장 가까운 조약 하나에만 붙인다 — PHT 처럼 아래를 거느리는
  //   조약은 제 설명이 없으므로 누를 수 없다.
  13: { content: ["note"], group: { head: "spine", by: "rightOf" } },
};

const BOX_RE = /<div class="bx ([a-z]+)"([^>]*)>([\s\S]*?)<\/div>/g;

/** `style="left:..%;top:..%;width:..%;height:..%"` → 숫자. */
function geoOf(attrs) {
  const st = attrs.match(/style="([^"]*)"/)?.[1] ?? "";
  const g = {};
  for (const d of st.split(";")) {
    const at = d.indexOf(":");
    if (at < 0) continue;
    const v = parseFloat(d.slice(at + 1));
    if (Number.isFinite(v)) g[d.slice(0, at).trim()] = v;
  }
  return g;
}

const EPS = 0.25; // 백분율 여유(반올림 오차)
const inside = (a, b) =>
  a.left >= b.left - EPS &&
  a.top >= b.top - EPS &&
  a.left + a.width <= b.left + b.width + EPS &&
  a.top + a.height <= b.top + b.height + EPS;
const overlapsRow = (a, b) =>
  a.top < b.top + b.height - EPS && b.top < a.top + a.height - EPS;

export function stampDiagram(bodyHtml, rule) {
  const boxes = [];
  BOX_RE.lastIndex = 0;
  let m;
  while ((m = BOX_RE.exec(bodyHtml))) {
    boxes.push({ kind: m[1], attrs: m[2], body: m[3], at: m.index, raw: m[0], geo: geoOf(m[2]) });
  }
  if (!boxes.length) return { html: bodyHtml, stats: null };

  const content = boxes.filter((b) => rule.content.includes(b.kind) && hasText(b.body));
  content.forEach((b, i) => {
    b.idx = i;
    b.key = `0:${i}`;
  });

  const heads = boxes.filter((b) => b.kind === rule.group.head && hasText(b.body));
  for (const h of heads) {
    if (rule.group.by === "inside") {
      h.keys = content.filter((c) => inside(c.geo, h.geo)).map((c) => c.key);
    } else if (rule.group.by === "kind") {
      h.keys = content.filter((c) => c.kind === rule.group.take).map((c) => c.key);
    } else if (rule.group.by === "rightOf") {
      // 설명마다 **왼쪽에서 가장 가까운** 머리 하나에만 붙인다.
      h.keys = content
        .filter((c) => {
          const cands = heads.filter(
            (x) => overlapsRow(c.geo, x.geo) && x.geo.left + x.geo.width <= c.geo.left + EPS,
          );
          if (!cands.length) return false;
          const best = cands.reduce((a, b) =>
            b.geo.left + b.geo.width > a.geo.left + a.geo.width ? b : a,
          );
          return best === h;
        })
        .map((c) => c.key);
    }
  }

  const edits = [];
  for (const b of content) {
    edits.push({
      at: b.at,
      len: b.raw.length,
      html: b.raw.replace(
        /^<div class="([^"]*)"/,
        `<div class="$1" data-dg-r="0" data-dg-c="${b.idx}" data-dg-rs="1" data-dg-cs="1"`,
      ),
    });
  }
  let headCount = 0;
  for (const h of heads) {
    if (!h.keys?.length) continue;
    edits.push({
      at: h.at,
      len: h.raw.length,
      html: h.raw.replace(
        /^<div class="([^"]*)"/,
        `<div class="$1" data-dg-blank="set" data-dg-keys="${h.keys.join(" ")}" tabindex="0"`,
      ),
    });
    headCount += 1;
  }

  edits.sort((a, b) => b.at - a.at);
  let html = bodyHtml;
  for (const e of edits) html = html.slice(0, e.at) + e.html + html.slice(e.at + e.len);

  return {
    html,
    stats: {
      boxes: boxes.length,
      cells: content.length,
      heads: headCount,
      빈머리: heads.length - headCount,
    },
  };
}

// ───────────────────────────────────────────────────────────────────── 입구

/**
 * 본문에 빈칸 좌표를 박는다.
 * @param bodyHtml 자료 본문
 * @param scopeKey 화면 꼬리표(`4` · `11-1` …) — 도형 규칙을 고르는 데 쓴다.
 */
export function stampBlanks(bodyHtml, scopeKey) {
  const stats = [];
  let html = bodyHtml.replace(/<table\b[\s\S]*?<\/table>/g, (t) => {
    const r = stampTable(t);
    if (r.stats) stats.push({ kind: "표", ...r.stats });
    return r.html;
  });

  if (html.includes('<section class="card">')) {
    const r = stampCards(html);
    html = r.html;
    stats.push({ kind: "체계도", ...r.stats });
  }

  const rule = DIAGRAM_RULES[scopeKey] ?? DIAGRAM_RULES[String(scopeKey).replace(/-\d+$/, "")];
  if (rule) {
    const r = stampDiagram(html, rule);
    html = r.html;
    if (r.stats) stats.push({ kind: "도형", ...r.stats });
  }

  return { html, stats };
}
