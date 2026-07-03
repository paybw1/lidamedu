// 종합해설 timeline SVG 생성기 — multi-lane 버전.
//
// Layout:
//   [타임라인 ──────────────→]   (y=80)
//   ─ 甲 lane ─ [ev] [ev] [ev]
//   ─ 乙 lane ─   [ev]   [ev]
//   ─ 丙 lane ─       [ev]
//   ─ 丁 lane ─    [ev]
//   [시간 bracket]
//   [table]
//
// 각 event 는 actor 의 lane 에 위치. lane y 는 actor 별 events 중 가장 큰 박스에 맞춰 동적.
// connector 는 box top → timeline marker (화살표 없는 plain line).
// timeline 만 오른쪽 끝에 → 화살표 (시간 방향).
//
// spec:
// {
//   width?: 2400,
//   actors: [{id:"1",label:"甲",color:"blue"},{id:"2",label:"乙"}],
//   events: [{actor:"1", x:0.18, title:"...", lines:[...], boxWidth?: 460}],
//   markers?: [{x:0.55, label:"...", color:"red"}],   // 수직 점선 + 상단 라벨
//   timeSpans?: [{from:0.18, to:0.46, label:"3개월"}],  // 타임라인 위쪽 또는 lanes 아래
//   table?: { headers, rows, colWeights }
// }

// Modern UI palette — boxes 는 거의 흰색에 가까운 tint + 부드러운 stroke,
// chip 은 진한 색 fill + 흰 텍스트 (브랜드 토큰처럼).
const PALETTE = {
  blue:   { fill: "#eff6ff", stroke: "#3b82f6", chipFill: "#2563eb", chipText: "#ffffff", text: "#1e3a8a" },
  green:  { fill: "#f0fdf4", stroke: "#22c55e", chipFill: "#16a34a", chipText: "#ffffff", text: "#14532d" },
  orange: { fill: "#fff7ed", stroke: "#f97316", chipFill: "#ea580c", chipText: "#ffffff", text: "#7c2d12" },
  purple: { fill: "#f5f3ff", stroke: "#8b5cf6", chipFill: "#7c3aed", chipText: "#ffffff", text: "#4c1d95" },
  rose:   { fill: "#fff1f2", stroke: "#f43f5e", chipFill: "#e11d48", chipText: "#ffffff", text: "#881337" },
  amber:  { fill: "#fffbeb", stroke: "#f59e0b", chipFill: "#d97706", chipText: "#ffffff", text: "#78350f" },
  slate:  { fill: "#f8fafc", stroke: "#64748b", chipFill: "#475569", chipText: "#ffffff", text: "#0f172a" },
};
const ACTOR_COLORS = ["blue", "green", "orange", "purple", "amber", "rose"];

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TITLE_FS = 28;
const LINE_FS = 22;
const LINE_LH = 34;
const TITLE_TO_LINE_GAP = 38;
const BOX_PAD_X = 20;
const BOX_PAD_Y = 18;

function eventBoxSize(ev) {
  const lineCount = ev.lines?.length ?? 0;
  const h = BOX_PAD_Y * 2 + TITLE_FS + (lineCount > 0 ? TITLE_TO_LINE_GAP + lineCount * LINE_LH - 12 : 0);
  const w = ev.boxWidth ?? 460;
  return { w, h };
}

export function renderTimelineSvg(spec) {
  // 세로 레이아웃 — 가로가 본문 폭에 안 맞을 때(글자 축소 방지). 시간축 위→아래.
  if (spec.layout === "vertical") return renderVerticalTimelineSvg(spec);
  const W = spec.width ?? 2400;
  const margin = { left: 180, right: 100 };
  const tlX0 = margin.left;
  const tlX1 = W - margin.right;
  const tlSpan = tlX1 - tlX0;
  const TIMELINE_Y = 100;

  const actorMap = {};
  spec.actors.forEach((a, i) => {
    actorMap[a.id] = {
      ...a,
      color: a.color ?? ACTOR_COLORS[i % ACTOR_COLORS.length],
      lane: i,
    };
  });

  // Position events.
  const events = (spec.events ?? []).map((ev) => {
    const cx = tlX0 + ev.x * tlSpan;
    const { w, h } = eventBoxSize(ev);
    return { ...ev, cx, w, h, lane: actorMap[ev.actor].lane };
  });

  // Lane heights based on tallest event in each lane.
  const laneHeights = spec.actors.map((_, i) => {
    const laneEv = events.filter((e) => e.lane === i);
    if (laneEv.length === 0) return 100;
    const maxH = Math.max(...laneEv.map((e) => e.h));
    return Math.max(maxH + 50, 130);
  });

  // Lane Y positions (top of each lane).
  const LANE_TOP_GAP = 80;
  const LANE_GAP = 16;
  const laneTops = [];
  let cum = TIMELINE_Y + LANE_TOP_GAP;
  for (const h of laneHeights) {
    laneTops.push(cum);
    cum += h + LANE_GAP;
  }
  const lanesEndY = cum;

  // Table layout.
  const HEADER_H = 70;
  const ROW_H = 78;
  const tableHeaders = spec.table?.headers ?? [];
  const tableRows = spec.table?.rows ?? [];
  const tableY = lanesEndY + 50;
  const tableX = 100;
  const tableW = W - 200;
  const colWeights = spec.table?.colWeights ?? tableHeaders.map(() => 1);
  const totalWeight = colWeights.reduce((a, b) => a + b, 0) || 1;
  const colWidths = colWeights.map((w) => (w / totalWeight) * tableW);
  const colXs = [tableX];
  for (let i = 0; i < colWidths.length; i++) colXs.push(colXs[i] + colWidths[i]);
  const tableH = tableHeaders.length ? HEADER_H + tableRows.length * ROW_H : 0;

  const totalH = (tableHeaders.length ? tableY + tableH + 30 : lanesEndY + 30);

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">`,
    `<defs>`,
    `<marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#0f172a"/></marker>`,
    `<filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">`,
    `  <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.05"/>`,
    `</filter>`,
    `<filter id="chipShadow" x="-20%" y="-20%" width="140%" height="140%">`,
    `  <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.18"/>`,
    `</filter>`,
    `</defs>`,
    // 전체 background — 따뜻한 white-gray.
    `<rect x="0" y="0" width="${W}" height="${totalH}" fill="#fcfcfd"/>`,
  );

  // Timeline (top, with arrow on right end).
  parts.push(
    `<line x1="${tlX0 - 30}" y1="${TIMELINE_Y}" x2="${tlX1 + 10}" y2="${TIMELINE_Y}" stroke="#0f172a" stroke-width="4" stroke-linecap="round" marker-end="url(#arr)"/>`,
  );

  // Vertical markers (e.g. critical date red dotted line).
  for (const m of spec.markers ?? []) {
    const x = tlX0 + m.x * tlSpan;
    const color = m.color ?? "#dc2626";
    parts.push(
      `<line x1="${x}" y1="${TIMELINE_Y - 50}" x2="${x}" y2="${lanesEndY}" stroke="${color}" stroke-width="2.5" stroke-dasharray="8,6"/>`,
      `<rect x="${x - 280}" y="${TIMELINE_Y - 80}" width="560" height="44" rx="10" fill="#fff" stroke="${color}" stroke-width="2"/>`,
      `<text x="${x}" y="${TIMELINE_Y - 50}" font-size="22" font-weight="700" fill="${color}" text-anchor="middle">${escape(m.label)}</text>`,
    );
  }

  // Time spans (between events). Place above timeline (y < TIMELINE_Y).
  const timeSpans = spec.timeSpans ?? [];
  let spanIdx = 0;
  for (const sp of timeSpans) {
    const x1 = tlX0 + sp.from * tlSpan;
    const x2 = tlX0 + sp.to * tlSpan;
    const y = TIMELINE_Y - 20 - spanIdx * 40;
    parts.push(
      `<path d="M${x1},${y} v-12 H${x2} v12" stroke="#64748b" stroke-width="2" fill="none"/>`,
      `<rect x="${(x1 + x2) / 2 - 60}" y="${y - 38}" width="120" height="28" rx="6" fill="#fff" stroke="#94a3b8" stroke-width="1.5"/>`,
      `<text x="${(x1 + x2) / 2}" y="${y - 18}" font-size="20" fill="#334155" text-anchor="middle" font-weight="700">${escape(sp.label)}</text>`,
    );
    spanIdx += 1;
  }

  // Actor lanes.
  for (let i = 0; i < spec.actors.length; i++) {
    const a = spec.actors[i];
    const c = PALETTE[actorMap[a.id].color];
    const laneTop = laneTops[i];
    const laneH = laneHeights[i];
    const laneCenter = laneTop + laneH / 2;

    // Lane separator (위쪽 dotted line, 첫 lane 제외).
    if (i > 0) {
      parts.push(
        `<line x1="${margin.left - 140}" y1="${laneTop - LANE_GAP / 2}" x2="${W - margin.right + 10}" y2="${laneTop - LANE_GAP / 2}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,5"/>`,
      );
    }

    // Actor chip on the left — 진한 색 fill + 흰 텍스트 (modern badge).
    parts.push(
      `<rect x="${margin.left - 140}" y="${laneCenter - 38}" width="100" height="76" rx="18" fill="${c.chipFill}" filter="url(#chipShadow)"/>`,
      `<text x="${margin.left - 90}" y="${laneCenter + 18}" font-size="46" font-weight="800" fill="${c.chipText}" text-anchor="middle">${escape(a.label)}</text>`,
    );
  }

  // 위치 사전계산 — boxX, boxY, boxRight 등 routing 시 사용.
  const placed = events.map((ev) => {
    const laneTop = laneTops[ev.lane];
    const laneH = laneHeights[ev.lane];
    const boxY = laneTop + (laneH - ev.h) / 2;
    const boxX = ev.cx - ev.w / 2;
    return { ...ev, boxY, boxX, boxRight: boxX + ev.w, laneTop };
  });

  // 같은 x 컬럼에 더 위쪽 lane 의 박스가 있으면 (= 직선 vertical 이 통과) 회피 column 을 찾음.
  // 회피 column = ev.cx 근방 ±dx 중 어떤 위쪽 박스와도 겹치지 않는 첫 위치.
  function findClearColumn(ev) {
    const blockers = placed.filter((o) =>
      o !== ev && o.lane < ev.lane &&
      ev.cx > o.boxX - 12 && ev.cx < o.boxRight + 12,
    );
    if (blockers.length === 0) return ev.cx;
    for (const dx of [50, -50, 90, -90, 130, -130, 170, -170, 220, -220, 280, -280, 340, -340]) {
      const x = ev.cx + dx;
      if (x < tlX0 + 20 || x > tlX1 - 20) continue;
      const conflict = placed.some((o) =>
        o !== ev && o.lane < ev.lane &&
        x > o.boxX - 12 && x < o.boxRight + 12,
      );
      if (!conflict) return x;
    }
    return ev.cx; // fallback
  }

  // Events: render each in its lane, with collision-aware connector.
  // Pass 1: 커넥터 (box 보다 먼저 그려서 box 가 위에 있도록).
  for (const ev of placed) {
    const c = PALETTE[actorMap[ev.actor].color];
    const clearX = findClearColumn(ev);
    const channelY = ev.laneTop - 8;
    if (clearX === ev.cx) {
      parts.push(
        `<line x1="${ev.cx}" y1="${ev.boxY}" x2="${ev.cx}" y2="${TIMELINE_Y}" stroke="${c.stroke}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>`,
      );
    } else {
      parts.push(
        `<polyline points="${ev.cx},${ev.boxY} ${ev.cx},${channelY} ${clearX},${channelY} ${clearX},${TIMELINE_Y}" stroke="${c.stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" fill="none" opacity="0.85"/>`,
      );
    }
    // 타임라인 마커 — 더블 링 (흰색 외곽 + 색상 내부). 더 산뜻함.
    const markerX = clearX;
    parts.push(
      `<circle cx="${markerX}" cy="${TIMELINE_Y}" r="13" fill="#fff" stroke="${c.stroke}" stroke-width="3.5"/>`,
      `<circle cx="${markerX}" cy="${TIMELINE_Y}" r="6" fill="${c.stroke}"/>`,
    );
  }
  // Pass 2: 박스.
  for (const ev of placed) {
    const c = PALETTE[actorMap[ev.actor].color];
    parts.push(
      `<g filter="url(#cardShadow)">`,
      `<rect x="${ev.boxX}" y="${ev.boxY}" width="${ev.w}" height="${ev.h}" rx="12" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>`,
      `</g>`,
      `<text x="${ev.cx}" y="${ev.boxY + BOX_PAD_Y + TITLE_FS - 4}" font-size="${TITLE_FS}" font-weight="700" fill="${c.text}" text-anchor="middle">${escape(ev.title)}</text>`,
    );
    let ly = ev.boxY + BOX_PAD_Y + TITLE_FS + TITLE_TO_LINE_GAP;
    for (const line of ev.lines ?? []) {
      parts.push(
        `<text x="${ev.boxX + BOX_PAD_X + 8}" y="${ly}" font-size="${LINE_FS}" fill="${c.text}" font-weight="700" text-anchor="start">${escape(line)}</text>`,
      );
      ly += LINE_LH;
    }
  }

  // Table.
  if (tableHeaders.length) {
    parts.push(
      `<rect x="${tableX}" y="${tableY}" width="${tableW}" height="${HEADER_H}" fill="#0f172a"/>`,
    );
    for (let i = 0; i < tableHeaders.length; i++) {
      const cx = (colXs[i] + colXs[i + 1]) / 2;
      parts.push(
        `<text x="${cx}" y="${tableY + 47}" font-size="26" font-weight="700" fill="#fff" text-anchor="middle">${escape(tableHeaders[i])}</text>`,
      );
      if (i > 0) {
        parts.push(
          `<line x1="${colXs[i]}" y1="${tableY}" x2="${colXs[i]}" y2="${tableY + HEADER_H}" stroke="#334155" stroke-width="1"/>`,
        );
      }
    }
    for (let r = 0; r < tableRows.length; r++) {
      const ry = tableY + HEADER_H + r * ROW_H;
      const fill = r % 2 === 0 ? "#ffffff" : "#f8fafc";
      parts.push(
        `<rect x="${tableX}" y="${ry}" width="${tableW}" height="${ROW_H}" fill="${fill}" stroke="#cbd5e1" stroke-width="1.5"/>`,
      );
      for (let i = 0; i < tableRows[r].length; i++) {
        const cell = tableRows[r][i];
        const cellText = typeof cell === "string" ? cell : cell.text;
        const cellColor = typeof cell === "object" ? cell.color : null;
        const cellWeight = typeof cell === "object" && cell.bold ? "700" : "400";
        const cx = (colXs[i] + colXs[i + 1]) / 2;
        parts.push(
          `<text x="${cx}" y="${ry + ROW_H / 2 + 9}" font-size="22" fill="${cellColor ?? "#0f172a"}" text-anchor="middle" font-weight="${cellWeight}">${escape(cellText)}</text>`,
        );
        if (i > 0) {
          parts.push(
            `<line x1="${colXs[i]}" y1="${ry}" x2="${colXs[i]}" y2="${ry + ROW_H}" stroke="#cbd5e1" stroke-width="1.5"/>`,
          );
        }
      }
    }
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

// ── 세로 타임라인 ─────────────────────────────────────────────────────────
// 시간축이 위→아래. 각 event 는 축 오른쪽 full-width 카드(actor chip + 제목 + lines).
// 본문 폭(좁음)에 맞아 축소돼도 글자가 안 작아짐 → 해설에서 "한 눈에" 가독.
// spec 은 가로와 동일(actors/events/markers). events 는 x(시간) 순으로 위→아래 배치.
const V = {
  W: 920, axisX: 78, cardX: 150, rightPad: 40,
  titleFs: 30, lineFs: 24, lineLh: 36, pad: 22, gap: 30, chip: 46, top: 56,
};

function renderVerticalTimelineSvg(spec) {
  const W = spec.width ?? V.W;
  const cardX = V.cardX;
  const cardW = W - cardX - V.rightPad;

  const actorMap = {};
  spec.actors.forEach((a, i) => {
    actorMap[a.id] = { ...a, color: a.color ?? ACTOR_COLORS[i % ACTOR_COLORS.length] };
  });

  const cardH = (ev) => {
    const lc = ev.lines?.length ?? 0;
    return V.pad * 2 + V.chip + (lc > 0 ? 14 + lc * V.lineLh : 0);
  };

  // 시간(x) 순으로 위→아래.
  const evs = [...(spec.events ?? [])].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  let y = V.top;
  const placed = evs.map((ev) => {
    const h = cardH(ev);
    const top = y;
    y += h + V.gap;
    return { ...ev, top, h, cy: top + h / 2 };
  });
  const axisTop = V.top - 26;
  const axisBottom = (placed.length ? placed[placed.length - 1].top + placed[placed.length - 1].h - 10 : V.top);
  const totalH = axisBottom + 56;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" font-family="'Pretendard','Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif">`,
    `<defs>`,
    `<marker id="arrd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#0f172a"/></marker>`,
    `<filter id="vshadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.05"/></filter>`,
    `</defs>`,
    `<rect x="0" y="0" width="${W}" height="${totalH}" fill="#fcfcfd"/>`,
    `<line x1="${V.axisX}" y1="${axisTop}" x2="${V.axisX}" y2="${axisBottom + 16}" stroke="#0f172a" stroke-width="4" stroke-linecap="round" marker-end="url(#arrd)"/>`,
  );

  // markers (임계 날짜 등) — x 를 인접 event 사이 y 로 매핑해 가로 점선 + 라벨.
  for (const m of spec.markers ?? []) {
    const after = placed.filter((e) => (e.x ?? 0) <= m.x);
    const my = after.length
      ? (after.length < placed.length
          ? (after[after.length - 1].top + after[after.length - 1].h + placed[after.length].top) / 2
          : axisBottom + 4)
      : axisTop + 4;
    const color = m.color ?? "#dc2626";
    parts.push(
      `<line x1="${V.axisX - 18}" y1="${my}" x2="${W - V.rightPad}" y2="${my}" stroke="${color}" stroke-width="2.5" stroke-dasharray="8,6"/>`,
      `<rect x="${cardX}" y="${my - 34}" width="${Math.min(560, cardW)}" height="40" rx="9" fill="#fff" stroke="${color}" stroke-width="2"/>`,
      `<text x="${cardX + 16}" y="${my - 7}" font-size="22" font-weight="700" fill="${color}">${escape(m.label)}</text>`,
    );
  }

  for (const ev of placed) {
    const c = PALETTE[actorMap[ev.actor].color];
    const a = actorMap[ev.actor];
    parts.push(
      // 축 마커 + 커넥터
      `<line x1="${V.axisX + 11}" y1="${ev.cy}" x2="${cardX}" y2="${ev.cy}" stroke="${c.stroke}" stroke-width="2.5" opacity="0.85"/>`,
      `<circle cx="${V.axisX}" cy="${ev.cy}" r="11" fill="#fff" stroke="${c.stroke}" stroke-width="3.5"/>`,
      `<circle cx="${V.axisX}" cy="${ev.cy}" r="5" fill="${c.stroke}"/>`,
      // 카드
      `<g filter="url(#vshadow)"><rect x="${cardX}" y="${ev.top}" width="${cardW}" height="${ev.h}" rx="12" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/></g>`,
      // actor chip + 제목
      `<rect x="${cardX + V.pad}" y="${ev.top + V.pad}" width="${V.chip}" height="${V.chip}" rx="12" fill="${c.chipFill}"/>`,
      `<text x="${cardX + V.pad + V.chip / 2}" y="${ev.top + V.pad + V.chip / 2 + 11}" font-size="30" font-weight="800" fill="${c.chipText}" text-anchor="middle">${escape(a.label)}</text>`,
      `<text x="${cardX + V.pad + V.chip + 16}" y="${ev.top + V.pad + V.chip / 2 + 10}" font-size="${V.titleFs}" font-weight="700" fill="${c.text}">${escape(ev.title)}</text>`,
    );
    let ly = ev.top + V.pad + V.chip + 14 + V.lineFs;
    for (const line of ev.lines ?? []) {
      parts.push(
        `<text x="${cardX + V.pad}" y="${ly}" font-size="${V.lineFs}" font-weight="700" fill="${c.text}">${escape(line)}</text>`,
      );
      ly += V.lineLh;
    }
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}
