// 특허 판례 전합(전원합의체) 표시 — 국가법령정보 OPEN API 대조 검증.
// 사용:
//   node scripts/precedents/check-enbanc.mjs --calibrate   (알려진 전합/비전합 각 1건으로 필드 보정)
//   node scripts/precedents/check-enbanc.mjs               (특허 대법원 판례 전수 대조, 보고만 — DB 무수정)
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const OC = process.env.LAW_API_KEY;
if (!OC) { console.error("LAW_API_KEY 없음"); process.exit(2); }
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CALIBRATE = process.argv.includes("--calibrate");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => (s ?? "").replace(/[\s]/g, "");

function pick(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml ?? "");
  return m ? m[1].trim() : null;
}
function precBlocks(xml) {
  return [...(xml ?? "").matchAll(/<prec[^>]*>([\s\S]*?)<\/prec>/g)].map((m) => m[1]);
}

async function fetchText(url) {
  for (let a = 1; a <= 4; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "lidamedu-enbanc-check/1.0" } });
      if (r.ok) return await r.text();
      if (a < 4) { await sleep(a * 1500); continue; }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (a === 4) throw e;
      await sleep(a * 1500);
    }
  }
}

async function findSerial(caseNumber) {
  const url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=prec&type=XML&display=50&page=1&query=${encodeURIComponent(caseNumber)}`;
  const xml = await fetchText(url);
  const exact = precBlocks(xml).filter((b) => norm(pick(b, "사건번호")) === norm(caseNumber));
  // 같은 사건번호가 여러 심급/데이터출처로 잡히면 대법원 우선.
  const supreme = exact.filter((b) => (pick(b, "법원명") ?? "").includes("대법원"));
  const chosen = (supreme.length ? supreme : exact)[0] ?? null;
  return chosen ? { serial: pick(chosen, "판례일련번호"), listBlock: chosen } : null;
}

async function fetchDetail(serial) {
  const url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=prec&type=XML&ID=${serial}`;
  return fetchText(url);
}

// 전합 판정 — 상세 응답에서 자기 사건번호와 같은 문맥의 "전원합의체" 표기.
//   판례내용 첫머리(헤더)나 사건명·선고 필드에 실릴 수 있어 보정 단계에서 확인한다.
function detectEnBanc(detailXml, caseNumber) {
  const head = (pick(detailXml, "판례내용") ?? "").slice(0, 600); // 전문 헤더 영역
  const fields = [pick(detailXml, "사건명"), pick(detailXml, "선고"), pick(detailXml, "판결유형")]
    .filter(Boolean)
    .join(" | ");
  const nearSelf = (() => {
    const body = pick(detailXml, "판례내용") ?? "";
    let i = body.indexOf(caseNumber);
    while (i !== -1) {
      if (body.slice(i, i + caseNumber.length + 30).includes("전원합의체")) return true;
      i = body.indexOf(caseNumber, i + 1);
    }
    return false;
  })();
  return {
    enBanc: nearSelf || head.includes("전원합의체") || fields.includes("전원합의체"),
    signals: { nearSelf, headHit: head.includes("전원합의체"), fieldHit: fields.includes("전원합의체") },
  };
}

if (CALIBRATE) {
  for (const [label, cn] of [["전합(알려짐)", "2014후768"], ["비전합(알려짐)", "2013후1726"]]) {
    const found = await findSerial(cn);
    if (!found) { console.log(label, cn, "— 목록 정확 일치 실패"); continue; }
    const detail = await fetchDetail(found.serial);
    const det = detectEnBanc(detail, cn);
    console.log(`${label} ${cn} serial=${found.serial}`);
    console.log("  목록 사건명:", pick(found.listBlock, "사건명"), "| 판결유형:", pick(found.listBlock, "판결유형"), "| 선고:", pick(found.listBlock, "선고"));
    console.log("  상세 사건명:", (pick(detail, "사건명") ?? "").slice(0, 70));
    console.log("  판정:", JSON.stringify(det));
    const hits = [...detail.matchAll(/.{45}전원합의체.{20}/g)].map((m) => m[0].replace(/\s+/g, " "));
    for (const h of hits.slice(0, 3)) console.log("   ⤷", h);
    await sleep(300);
  }
  process.exit(0);
}

// ── 전수 대조 (보고만) ───────────────────────────────────────────────────────
const { data: rows } = await c
  .from("cases")
  .select("case_id, case_number, decided_at, is_en_banc, law_api_serial_id")
  .contains("subject_laws", ["patent"])
  .eq("court", "supreme")
  .is("deleted_at", null)
  .limit(1000);
console.log("대상(특허·대법원):", rows.length);

const mismatches = [];
let checked = 0, noSerial = 0, apiMiss = 0;
for (const r of rows) {
  try {
    let serial = r.law_api_serial_id;
    if (!serial) {
      const found = await findSerial(r.case_number);
      await sleep(180);
      if (!found) { apiMiss++; continue; }
      serial = found.serial;
    }
    const detail = await fetchDetail(serial);
    await sleep(180);
    if (!detail || detail.includes("<faultInfo") || !pick(detail, "사건번호")) { apiMiss++; continue; }
    // 안전망 — 상세 사건번호가 우리 사건번호를 포함하는지(병합 사건 "2014후768,775" 대응).
    if (!norm(pick(detail, "사건번호")).includes(norm(r.case_number))) { apiMiss++; continue; }
    const det = detectEnBanc(detail, r.case_number);
    checked++;
    if (det.enBanc !== r.is_en_banc) {
      mismatches.push({ n: r.case_number, d: r.decided_at, db: r.is_en_banc, api: det.enBanc, sig: det.signals });
      console.log("★불일치", r.case_number, r.decided_at, "DB=", r.is_en_banc, "API=", det.enBanc, JSON.stringify(det.signals));
    }
    if (checked % 40 === 0) console.log("…진행", checked, "/", rows.length);
  } catch (e) {
    apiMiss++;
    console.log("ERR", r.case_number, e.message);
  }
}
console.log(`완료 — 대조 ${checked} · API 미확인 ${apiMiss} · serial 없음 보완 포함 · 불일치 ${mismatches.length}`);
