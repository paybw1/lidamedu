// 정리비교표 **빈칸 학습**용 좌표 박기 — 목차를 누르면 그 줄·그 칸이 빈칸이 된다.
//
// 원장 지시(2026-09-10):
//   · 「특허요건」(모서리)  → 목차를 뺀 **내용 전체**가 빈칸
//   · 「의의」(행 목차)     → 그 오른쪽 **가로줄 전부**가 빈칸
//   · 「진보성」(열 목차)   → 그 아래 **세로줄 전부**가 빈칸
//
// ★비는 건 **내용칸(td)뿐이다.** 목차칸(th)은 절대 비지 않는다 — 그래야 「판단」처럼
//   목차 안에 목차가 든 자리(판단 ▸ 객체적 기준 ▸ 대상)도 규칙 하나로 풀린다.
// ★**원래 빈 칸은 빈칸으로 만들지 않는다.** 가린 것인지 원래 없는 것인지 구분이 안 되면
//   학생이 있지도 않은 답을 찾는다.
// ★좌표는 여기서 **미리 박는다**. 브라우저에서 재서 맞추는 방식은 이 화면에서 세 번
//   연속 듣지 않았다(2026-09-10) — 재지 않으면 어긋날 것도 없고, 결과를 노드에서
//   그대로 검사할 수 있다(check-blanks.mjs).

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
const withAttrs = (tag, attrs, add) =>
  `<${tag}${attrs}${add}>`;

/**
 * 표 한 개에 좌표를 박는다.
 * @returns {{html:string, stats:{rows:number,cols:number,cells:number,heads:number}}}
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

/** 본문 안의 모든 표에 좌표를 박는다. */
export function stampBlanks(bodyHtml) {
  const stats = [];
  const html = bodyHtml.replace(/<table\b[\s\S]*?<\/table>/g, (t) => {
    const r = stampTable(t);
    if (r.stats) stats.push(r.stats);
    return r.html;
  });
  return { html, stats };
}
