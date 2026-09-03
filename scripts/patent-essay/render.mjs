// 뷰어·책 공용 렌더. ★한 곳에서만 마크다운을 다룬다 — 두 벌로 두면 조용히 갈라진다.
import fs from "node:fs";
import path from "node:path";

import { toHtml, toInlineHtml } from "../bar-exam/md.mjs";

const IMG_DIR = "tmp/patent-essay/img";

/** 원격 이미지 URL → data URI. 아티팩트는 외부 호스트를 막고, 인쇄본은 네트워크 없이 나와야 한다. */
const dataUriCache = new Map();
function imageDataUri(url) {
  if (dataUriCache.has(url)) return dataUriCache.get(url);
  const name = url.split("/").pop() ?? "";
  const png = path.join(IMG_DIR, name.replace(/\.bmp$/i, ".png"));
  if (!fs.existsSync(png)) {
    throw new Error(`도면 파일이 없습니다: ${png} (bmp-to-png.mjs 를 먼저 실행하세요)`);
  }
  const uri = `data:image/png;base64,${fs.readFileSync(png).toString("base64")}`;
  dataUriCache.set(url, uri);
  return uri;
}

/** 본문의 이미지 링크를 data URI 로 바꾼다. */
export function inlineImages(md) {
  return md.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_m, alt, url) => {
    return `![${alt}](${imageDataUri(url)})`;
  });
}

export function mdToHtml(md) {
  return toHtml(inlineImages(md));
}

export { toInlineHtml };

/**
 * 모범답안의 제목 단계를 정규화한다.
 * 데이터가 `##`(Ⅰ)부터 시작하므로 그대로 두면 h1 이 비고 단계 대비가 약하다.
 * ★내용은 건드리지 않는다 — `#` 개수만 한 단계씩 올린다.
 */
export function normalizeAnswerHeadings(md) {
  const levels = new Set();
  for (const m of md.matchAll(/^(#{1,6})\s+\S/gm)) levels.add(m[1].length);
  if (!levels.size) return md;
  const shift = Math.min(...levels) - 2; // 가장 얕은 단계를 h2 로
  if (shift === 0) return md;
  return md.replace(/^(#{1,6})(\s+)/gm, (_m, hashes, sp) => {
    const next = Math.min(6, Math.max(2, hashes.length - shift));
    return "#".repeat(next) + sp;
  });
}

/**
 * 채점기준 표에서 쟁점 목록을 뽑는다.
 * ★열 위치가 아니라 **머리글 이름**으로 찾는다 — 표 형식이 네 가지고 그중 하나는
 *   앞에 '설문' 열이 더 있다. 위치로 집으면 엉뚱한 칸이 쟁점으로 나온다.
 * ★셀 글자를 그대로 쓴다. 요약·의역하지 않는다(법리 서술을 새로 만들지 않는다).
 */
export function issuesFromRubric(rubricMd, limit = 4) {
  const lines = rubricMd.split("\n").map((l) => l.trim());
  const headIdx = lines.findIndex(
    (l) => l.startsWith("|") && /\|\s*(핵심\s*쟁점|쟁점)\s*\|/.test(l),
  );
  if (headIdx < 0) return [];
  const cells = (l) =>
    l
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const header = cells(lines[headIdx]);
  const col = header.findIndex((h) => h === "쟁점" || h === "핵심 쟁점" || h === "핵심쟁점");
  if (col < 0) return [];

  const out = [];
  for (let i = headIdx + 2; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith("|")) break; // 표가 끝나면 멈춘다
    const c = cells(l);
    const text = (c[col] ?? "").replace(/\*\*/g, "").trim();
    if (!text || /^-+$/.test(text)) continue;
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 차례·파트 개장에 쓸 짧은 쟁점 표기.
 * 표 안에서는 설문 번호가 정보지만, 문항이 단위인 목차에서는 군더더기라 앞머리만 뗀다.
 * ★말을 바꾸지 않는다 — 접두 표기만 제거한다.
 */
export function trimIssueLabel(s) {
  return s
    .replace(/^설문\s*\(?\d+\)?[\s.·\-—]*/, "")
    .replace(/^\(\d+\)(?:-\d+)?\s*/, "")
    .trim();
}

/** 배점 합계 — 표의 '배점' 열 합. 표기와 실제가 어긋나면 호출부가 판단한다. */
export function rubricPointsTotal(rubricItems) {
  return rubricItems.reduce((s, it) => s + (Number(it.points) || 0), 0);
}

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
