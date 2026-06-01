/**
 * HWPX (Hancom Office XML) → 단순 텍스트 paragraphs.
 *
 * 본 repo `scripts/hwpx-to-text.mjs` 의 파싱 로직을 본 실험용으로 단순화·차용.
 * (production 코드 import 금지 — 복제만)
 *
 * 반환: paragraphs[] (각 paragraph 는 단순 텍스트). hp:tbl 은 markdown 표로 평문화.
 * 페이지 정보가 HWPX 에는 없음 → page=null.
 */
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  preserveOrder: true,
  trimValues: false,
  textNodeName: '#text',
  removeNSPrefix: false,
});

function getTag(node: Record<string, unknown>): string | undefined {
  return Object.keys(node).find((k) => k !== ':@' && !k.startsWith('@_'));
}

function walk(nodes: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (Array.isArray(nodes)) {
    for (const n of nodes) walk(n, visit);
    return;
  }
  if (!nodes || typeof nodes !== 'object') return;
  const obj = nodes as Record<string, unknown>;
  visit(obj);
  for (const key of Object.keys(obj)) {
    if (key === ':@' || key.startsWith('@_')) continue;
    walk(obj[key], visit);
  }
}

function paraText(node: Record<string, unknown>): string {
  const tag = 'hp:p';
  const children = (node[tag] as unknown[]) ?? [];
  let text = '';
  for (const c of children) {
    if (!c || typeof c !== 'object') continue;
    const obj = c as Record<string, unknown>;
    const ck = getTag(obj);
    if (!ck) continue;
    if (ck === 'hp:run' || ck.endsWith(':run')) {
      const runChildren = (obj[ck] as unknown[]) ?? [];
      walk(runChildren, (n) => {
        const tk = getTag(n);
        if (!tk) return;
        if (tk === 'hp:t' || tk.endsWith(':t')) {
          const tArr = (n[tk] as unknown[]) ?? [];
          for (const t of tArr) {
            if (t && typeof t === 'object' && typeof (t as Record<string, unknown>)['#text'] === 'string') {
              text += (t as Record<string, string>)['#text'];
            }
          }
        }
      });
    }
  }
  return text;
}

function escMd(s: string): string {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

function tableMarkdown(node: Record<string, unknown>): string {
  const attrs = (node[':@'] as Record<string, string>) ?? {};
  const rowCnt = parseInt(attrs['@_rowCnt'] ?? '0', 10) || 0;
  const colCnt = parseInt(attrs['@_colCnt'] ?? '0', 10) || 0;
  if (!rowCnt || !colCnt) return '';
  const cells: string[][] = Array.from({ length: rowCnt }, () => Array(colCnt).fill(''));
  walk(node, (n) => {
    const tk = getTag(n);
    if (tk !== 'hp:tc') return;
    const tcChildren = (n[tk] as unknown[]) ?? [];
    let row = 0;
    let col = 0;
    let cellText = '';
    for (const c of tcChildren) {
      if (!c || typeof c !== 'object') continue;
      const obj = c as Record<string, unknown>;
      const ck = getTag(obj);
      if (!ck) continue;
      if (ck === 'hp:cellAddr') {
        const cAttr = (obj[':@'] as Record<string, string>) ?? {};
        col = parseInt(cAttr['@_colAddr'] ?? '0', 10) || 0;
        row = parseInt(cAttr['@_rowAddr'] ?? '0', 10) || 0;
      } else if (ck === 'hp:subList') {
        walk(obj, (sn) => {
          if (getTag(sn) !== 'hp:p') return;
          const t = paraText(sn).trim();
          if (t) cellText += (cellText ? ' ' : '') + t;
        });
      }
    }
    if (row < rowCnt && col < colCnt) {
      const safeRow = cells[row];
      if (safeRow) safeRow[col] = cellText.trim();
    }
  });
  const lines: string[] = [];
  if (cells.length) {
    const headerRow = cells[0];
    if (headerRow) {
      lines.push('| ' + headerRow.map(escMd).join(' | ') + ' |');
      lines.push('| ' + headerRow.map(() => '---').join(' | ') + ' |');
      for (let r = 1; r < cells.length; r++) {
        const row = cells[r];
        if (row) lines.push('| ' + row.map(escMd).join(' | ') + ' |');
      }
    }
  }
  return lines.join('\n');
}

function walkSection(node: unknown, inTable: boolean, out: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) walkSection(n, inTable, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const tag = getTag(obj);
  if (tag === 'hp:tbl') {
    const md = tableMarkdown(obj);
    if (md) out.push(md);
    return;
  }
  if (tag === 'hp:p' && !inTable) {
    const t = paraText(obj).trim();
    if (t) out.push(t);
    return;
  }
  for (const key of Object.keys(obj)) {
    if (key === ':@' || key.startsWith('@_')) continue;
    walkSection(obj[key], inTable, out);
  }
}

export interface HwpxParagraph {
  text: string;
  page: number | null;   // HWPX 는 페이지 정보 없음
}

export function extractHwpx(filepath: string): HwpxParagraph[] {
  const zip = new AdmZip(filepath);
  const entries = zip.getEntries();
  const sections = entries
    .map((e) => e.entryName)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort();
  const out: string[] = [];
  for (const name of sections) {
    const entry = entries.find((x) => x.entryName === name);
    if (!entry) continue;
    const xml = entry.getData().toString('utf8');
    const tree = xmlParser.parse(xml);
    walkSection(tree, false, out);
  }
  return out.map((text) => ({ text, page: null }));
}
