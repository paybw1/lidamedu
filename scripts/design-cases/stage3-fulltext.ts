// 디자인 판례 Stage 3 — 관련 판례(인용) + 날짜미상 본문 2건: OPEN API 전문 조회 → 적재 + PDF.
//   --pilot N : 앞 N건만 API 조회·PDF 렌더 검증(적재 X). 커버리지/품질 확인용.
//   --apply   : 실제 적재(cases insert/update) + PDF Storage 업로드.
// 규칙:
//   관련 판례 = 교재 코멘트 없음 → official_text_md(API 전문) + PDF, reasoning_md 공란.
//   본문 날짜미상 = 교재 코멘트(reasoning_md) + API 선고일자 + PDF.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchOfficialText, renderAndStorePdf } from "../../app/features/cases/lib/precedent-import.server";
import { renderOfficialTextPdf } from "../../app/features/cases/lib/render-official-text-pdf.server";

const url = process.env.SUPABASE_URL!;
if (!url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const pilotIdx = args.indexOf("--pilot");
const PILOT = pilotIdx >= 0 ? Number(args[pilotIdx + 1] || 5) : 0;

const { cards } = JSON.parse(readFileSync("tmp/design-cases/cards.json", "utf8")) as { cards: any[] };
const topicNodes = JSON.parse(readFileSync("tmp/design-cases/topic-nodes.json", "utf8")) as any[];
const nodeByTopic = new Map(topicNodes.map((t) => [t.num, t.node_id]));

const RE_ESCAPE = /[.*+?^${}()|[\]\\]/g;
const stripGlyph = (p: string) => p.replace(/^\s*[^[가-힣]*/u, "").trim();
const reasoningOf = (body: string, issue: string | null) => {
  let r = stripGlyph(body);
  if (issue) {
    const esc = issue.replace(RE_ESCAPE, "\\$&");
    r = r.replace(new RegExp("^\\s*\\[" + esc + "\\]\\s*"), "");
  }
  return r.trim();
};

// OPEN API 메타(선고일자/법원명/사건명) 직접 조회 — needsDate 본문용.
async function fetchMeta(serialId: string) {
  const u = new URL("https://www.law.go.kr/DRF/lawService.do");
  u.searchParams.set("OC", process.env.LAW_API_KEY ?? "");
  u.searchParams.set("target", "prec");
  u.searchParams.set("type", "XML");
  u.searchParams.set("ID", serialId);
  const xml = await (await fetch(u.toString(), { headers: { "User-Agent": "lidami-design-stage3/1.0" } })).text();
  const pick = (tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
    return m ? m[1].replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim() : null;
  };
  const rawDate = pick("선고일자"); // YYYYMMDD or YYYY. M. D.
  let decidedAt: string | null = null;
  if (rawDate) {
    const d = rawDate.replace(/[^0-9]/g, "");
    if (d.length === 8) decidedAt = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return { decidedAt, courtName: pick("법원명"), caseTitle: pick("사건명") };
}

const COURT_BY_NAME: Record<string, string> = {
  대법원: "supreme", 특허법원: "patent_court", 고등법원: "high_court", 지방법원: "district_court", 헌법재판소: "supreme",
};

const related = cards.filter((c) => c.kind === "related" && c.caseNo);
const needsDate = cards.filter((c) => c.kind === "main" && c.needsDate);
// 대상: 관련(고유) + 본문 날짜미상. topicNum 유지.
const relSeen = new Set<string>();
const relTargets = related.filter((c) => (relSeen.has(c.caseNo) ? false : relSeen.add(c.caseNo)));
const targets = [
  ...relTargets.map((c) => ({ ...c, group: "related" as const })),
  ...needsDate.map((c) => ({ ...c, group: "main" as const })),
];
const work = PILOT ? targets.slice(0, PILOT) : targets;

console.log(`Stage3 대상 ${targets.length} (관련 ${relTargets.length} + 본문 ${needsDate.length}) | 이번 실행 ${work.length}${PILOT ? ` (pilot ${PILOT})` : ""}${APPLY ? " [APPLY]" : " [dry]"}\n`);

let okApi = 0, failApi = 0, okPdf = 0, skipPdf = 0;
const results: any[] = [];

for (const c of work) {
  const r = await fetchOfficialText(c.caseNo);
  if (r.status !== "ok") {
    failApi++;
    console.log(`  ✗ ${c.caseNo} [${c.group}] API=${r.status}${"msg" in r ? ` (${r.msg})` : ""}`);
    results.push({ caseNo: c.caseNo, group: c.group, apiStatus: r.status });
    continue;
  }
  okApi++;
  // PDF 렌더 검증(미커버 문자 체크)
  let meta = { decidedAt: c.decidedAt as string | null, courtName: null as string | null, caseTitle: null as string | null };
  if (c.group === "main" && !c.decidedAt) meta = await fetchMeta(r.serialId);
  const court = c.court ?? (meta.courtName ? COURT_BY_NAME[meta.courtName] : null) ?? "supreme";
  const decidedAt = c.decidedAt ?? meta.decidedAt;
  const title = c.group === "main" ? (c.issue ?? meta.caseTitle) : meta.caseTitle;
  const rp = await renderOfficialTextPdf({ caseNumber: c.caseNo, caseTitle: title, court, decidedAt, fullText: r.textMd });
  if (rp.unrenderable.length > 0) {
    skipPdf++;
    console.log(`  △ ${c.caseNo} [${c.group}] API ok(${r.textMd.length}자) · PDF 미커버 ${rp.unrenderable.length}: ${[...new Set(rp.unrenderable.map((u) => u.char))].slice(0, 6).join(" ")}`);
  } else {
    okPdf++;
    console.log(`  ✓ ${c.caseNo} [${c.group}] API ok(${r.textMd.length}자) · PDF ${rp.pageCount}p ${rp.pdfBytes.length}B · date=${decidedAt} court=${court} title=${(title || "").slice(0, 30)}`);
  }
  results.push({ caseNo: c.caseNo, group: c.group, apiStatus: "ok", serialId: r.serialId, textLen: r.textMd.length, decidedAt, court, title, pdfPages: rp.pageCount, unrenderable: rp.unrenderable.length });

  if (APPLY) {
    // 적재는 별도 함수(아래) — pilot 아닐 때만.
  }
}

writeFileSync("tmp/design-cases/stage3-pilot.json", JSON.stringify(results, null, 1));
console.log(`\n결과: API ok=${okApi} fail=${failApi} | PDF ok=${okPdf} 미커버=${skipPdf}`);
