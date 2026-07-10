// 디자인 판례 Stage 3 적재(옵션 B) — 내용 있는 행만.
//   G1 신규 관련(API 커버) → 디자인 case insert(official_text_md=API 전문) + PDF, reasoning 공란.
//   G2 2012다42673 본문(주제12) → 교재 코멘트 reasoning_md + 웹검증 선고일(2014-11-13), PDF 없음.
//   G3 기존 디자인(2012후3794·2010후2209) → API 전문 채우고 PDF 첨부(신규 행 X).
//   G4 2021후10732 → 기존 patent 행 subject_laws 에 "design" 추가(단일노드 모델상 patent 배치 유지).
//   미커버 11건(관련·공공 API 부재) = skip.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchOfficialText, renderAndStorePdf } from "../../app/features/cases/lib/precedent-import.server";

const url = process.env.SUPABASE_URL!;
if (!url.includes("mcgdoplo")) throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const APPLY = process.argv.includes("--apply");

const { cards } = JSON.parse(readFileSync("tmp/design-cases/cards.json", "utf8")) as { cards: any[] };
const topicNodes = JSON.parse(readFileSync("tmp/design-cases/topic-nodes.json", "utf8")) as any[];
const nodeByTopic = new Map<number, string>(topicNodes.map((t) => [t.num, t.node_id]));

const stripGlyph = (p: string) => p.replace(/^\s*[^[가-힣]*/u, "").trim();

// 이미 디자인/특허로 존재하는 사건번호(신규 insert 대상에서 제외)
const EXISTING_DESIGN = new Map([
  ["2012후3794", "a99a530e-4dda-45c3-ac1d-a0adf67fd9ab"],
  ["2010후2209", "c70c4f70-c5fa-4a17-bfc9-da4485a05f32"],
]);
const PATENT_SHARE = { caseNo: "2021후10732", caseId: "a2f50212-ba1a-4dc4-8dac-100f7ceaa791" };

// 관련 카드(고유) — API 커버 여부는 실행 중 판정. 미커버는 skip.
const related = cards.filter((c) => c.kind === "related" && c.caseNo);
const relSeen = new Set<string>();
const relTargets = related.filter((c) => (relSeen.has(c.caseNo) ? false : relSeen.add(c.caseNo)));

async function fetchTitle(serialId: string): Promise<string | null> {
  const u = new URL("https://www.law.go.kr/DRF/lawService.do");
  u.searchParams.set("OC", process.env.LAW_API_KEY ?? "");
  u.searchParams.set("target", "prec");
  u.searchParams.set("type", "XML");
  u.searchParams.set("ID", serialId);
  const xml = await (await fetch(u.toString(), { headers: { "User-Agent": "lidami-design-stage3/1.0" } })).text();
  const m = /<사건명[^>]*>([\s\S]*?)<\/사건명>/.exec(xml);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() || null : null;
}

let seq = 58;
const done: any[] = [];
const skipped: string[] = [];

console.log(`Stage3 apply ${APPLY ? "[APPLY]" : "[dry]"}\n`);

// ── G3: 기존 디자인 2건 → API 전문 + PDF ─────────────────────────
for (const [caseNo, caseId] of EXISTING_DESIGN) {
  const r = await fetchOfficialText(caseNo);
  if (r.status !== "ok") { console.log(`  G3 ✗ ${caseNo} API=${r.status}`); continue; }
  console.log(`  G3 ✓ ${caseNo} 기존 디자인 → official_text ${r.textMd.length}자 + PDF`);
  if (APPLY) {
    await sb.from("cases").update({ official_text_md: r.textMd, official_text_pdf_path: null }).eq("case_id", caseId);
    const meta = { caseNumber: caseNo, caseTitle: null, court: "supreme", decidedAt: null };
    const pr = await renderAndStorePdf(sb as any, caseId, r.textMd, meta);
    console.log(`       PDF: ${pr.status}${pr.status === "ok" ? ` ${pr.pageCount}p` : ""}`);
  }
  done.push({ group: "G3", caseNo, caseId });
}

// ── G1: 신규 관련(API 커버) → insert + PDF ───────────────────────
for (const c of relTargets) {
  if (EXISTING_DESIGN.has(c.caseNo) || c.caseNo === PATENT_SHARE.caseNo) continue;
  const r = await fetchOfficialText(c.caseNo);
  if (r.status !== "ok") { skipped.push(`${c.caseNo}(${r.status})`); continue; }
  const node = nodeByTopic.get(c.topicNum)!;
  const title = (await fetchTitle(r.serialId)) ?? c.caseNo;
  seq += 1;
  console.log(`  G1 ✓ ${c.caseNo} 주제${c.topicNum} → insert [${title}] ${r.textMd.length}자 seq=${seq}`);
  if (APPLY) {
    const row = {
      case_number: c.caseNo, court: c.court ?? "supreme", decided_at: c.decidedAt,
      subject_laws: ["design"], primary_node_id: node,
      case_title: title, summary_title: title, summary_body_md: "", reasoning_md: "",
      official_text_md: r.textMd, source_seq: seq, comment_source: "리담 디자인보호법 판례",
    };
    const { data, error } = await sb.from("cases").insert(row).select("case_id").single();
    if (error) { console.log(`       ✗ insert: ${error.message}`); continue; }
    const pr = await renderAndStorePdf(sb as any, data.case_id, r.textMd, { caseNumber: c.caseNo, caseTitle: title, court: c.court ?? "supreme", decidedAt: c.decidedAt });
    console.log(`       PDF: ${pr.status}${pr.status === "ok" ? ` ${pr.pageCount}p` : ""}`);
    done.push({ group: "G1", caseNo: c.caseNo, caseId: data.case_id, node });
  } else done.push({ group: "G1", caseNo: c.caseNo });
}

// ── G2: 2012다42673 본문(주제12) → 교재 코멘트 + 웹검증 선고일 ────
{
  const c = cards.find((x) => x.caseNo === "2012다42673" && x.kind === "main");
  const node = nodeByTopic.get(12)!;
  const body = stripGlyph(c.body).replace(/^\s*\[[^\]]+\]\s*/, "").trim();
  seq += 1;
  console.log(`  G2 ✓ 2012다42673 주제12 → insert 교재코멘트 ${body.length}자 date=2014-11-13 seq=${seq}`);
  if (APPLY) {
    const row = {
      case_number: "2012다42673", court: "supreme", decided_at: "2014-11-13",
      subject_laws: ["design"], primary_node_id: node,
      case_title: c.issue ?? "2012다42673", summary_title: c.issue ?? "2012다42673",
      summary_body_md: "", reasoning_md: body, source_seq: seq, comment_source: "리담 디자인보호법 판례",
    };
    const { data, error } = await sb.from("cases").insert(row).select("case_id").single();
    if (error) console.log(`       ✗ insert: ${error.message}`);
    else { done.push({ group: "G2", caseNo: "2012다42673", caseId: data.case_id, node }); console.log(`       inserted ${data.case_id}`); }
  } else done.push({ group: "G2", caseNo: "2012다42673" });
}

// ── G4: 2021후10732 → patent 행 subject_laws += design ───────────
{
  console.log(`  G4 ✓ 2021후10732 patent 행 → subject_laws += "design"`);
  if (APPLY) {
    const { error } = await sb.from("cases").update({ subject_laws: ["patent", "design"] }).eq("case_id", PATENT_SHARE.caseId);
    console.log(`       ${error ? "✗ " + error.message : "updated"}`);
    done.push({ group: "G4", caseNo: "2021후10732", caseId: PATENT_SHARE.caseId });
  } else done.push({ group: "G4", caseNo: "2021후10732" });
}

writeFileSync("tmp/design-cases/stage3-applied.json", JSON.stringify({ done, skipped }, null, 1));
console.log(`\n결과: 처리 ${done.length}건 | skip(미커버) ${skipped.length}: ${skipped.join(", ")}`);
