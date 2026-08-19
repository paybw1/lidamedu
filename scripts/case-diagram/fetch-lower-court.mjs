// feat-2-035 S0 — 판례 도식화용 **하급심 판결문 수집기**.
//
// 도식의 "사실관계"는 대법원이 아니라 하급심에서 온다(설계 §4). 상고심은 법률심이라
// 사실관계를 "원심이 인정한 사실은 …" 으로 압축해 버려 각색 출제의 원형이 남지 않는다.
//
// 3단 폴백:
//   ① 자동  — cases.official_text_md 의 【원심판결】 표기 파싱 → 국가법령정보센터 판례 API
//   ② 수기  — source/하급심 판결문/특허/<대법원사건번호> ….pdf|txt|md  (①이 실패한 건만)
//   ③ 없음  — 리포트에 남기고 넘어간다(사실관계는 지어내지 않는다)
//
// ★API 주의: 사건번호 검색 키는 `nb=` 다. `query=` 는 **사건명** 검색이라 사건번호를 넣으면 0건.
//
//   node scripts/case-diagram/fetch-lower-court.mjs --year 2025
//   node scripts/case-diagram/fetch-lower-court.mjs --from 2005          # 전체(기본)
//   node scripts/case-diagram/fetch-lower-court.mjs --case 2023후10712
//   node scripts/case-diagram/fetch-lower-court.mjs --year 2025 --refresh # 캐시 무시하고 재수집
//
// 산출: source/하급심 판결문/.cache/<대법원사건번호>.json  (전문 캐시 — DB 에 넣지 않는다)
//       source/하급심 판결문/.cache/_report-<scope>.json   (3분류 리포트)
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const YEAR = argOf("--year");
const FROM = argOf("--from") ?? "2005";
const ONE_CASE = argOf("--case");
const LAW = argOf("--law") ?? "patent";
const REFRESH = argv.includes("--refresh");

const ROOT = path.resolve(process.cwd(), "source", "하급심 판결문");
const CACHE_DIR = path.join(ROOT, ".cache");
// 과목 폴더 — 수기 투입본이 놓이는 곳(설계 §4.2).
const MANUAL_DIRS = { patent: path.join(ROOT, "특허") };

const OC = process.env.LAW_GO_KR_OC ?? "test";
const API = "https://www.law.go.kr/DRF";
const REQUEST_GAP_MS = 120;
// cases.court enum → 표시 라벨(학생 화면 출처 캡션에 그대로 쓰인다).
const COURT_LABEL = {
  patent_court: "특허법원",
  high: "고등법원",
  district: "지방법원",
  ipt: "특허심판원",
  constitutional: "헌법재판소",
};

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripTags = (s) =>
  String(s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n?/g, "\n")
    .trim();

/** 대법원 원문 헤더에서 원심 표기 추출. 판결·결정 둘 다. */
function parseLowerRef(officialTextMd) {
  const text = String(officialTextMd ?? "");
  // 【원심판결】 특허법원 2023. 6. 16. 선고 2022허4635 판결
  // 【원심결정】 대구지법 2024. 12. 5.자 2024라10826 결정
  const withDate =
    /【원심(?:판결|결정)】\s*([^\n【]*?)\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*(?:선고|자)\s*(\d{4}[가-힣]{1,3}\d+)/;
  const noDate = /【원심(?:판결|결정)】\s*([^\n【]*?)\s*(\d{4}[가-힣]{1,3}\d+)/;
  const m = text.match(withDate) ?? text.match(noDate);
  if (!m) return null;
  const court = m[1].replace(/[,\s]+$/, "").trim();
  return { court, caseNumber: m[2] };
}

/** 국가법령정보센터 — 사건번호로 판례일련번호 조회. ★nb= 가 사건번호 키(query= 는 사건명). */
async function findSerial(caseNumber) {
  const url = `${API}/lawSearch.do?OC=${OC}&target=prec&type=JSON&nb=${encodeURIComponent(caseNumber)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawSearch ${res.status}`);
  const json = await res.json().catch(() => null);
  const raw = json?.PrecSearch?.prec;
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  // 부분일치가 섞여 올 수 있어 사건번호 완전일치만 채택.
  const hit = list.find((p) => String(p?.사건번호 ?? "").trim() === caseNumber);
  if (!hit?.판례일련번호) return null;
  return {
    serial: String(hit.판례일련번호),
    court: String(hit.법원명 ?? "").trim(),
    decidedAt: String(hit.선고일자 ?? "").trim(),
  };
}

/** 판례일련번호 → 전문. */
async function fetchFullText(serial) {
  const url = `${API}/lawService.do?OC=${OC}&target=prec&ID=${serial}&type=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawService ${res.status}`);
  const json = await res.json().catch(() => null);
  const body = stripTags(json?.PrecService?.판례내용);
  return body;
}

/** 수기 폴더 스캔 — 파일명 첫 토큰(대법원 사건번호)으로 그룹핑. */
function scanManualDir(lawCode) {
  const dir = MANUAL_DIRS[lawCode];
  const map = new Map();
  if (!dir || !fs.existsSync(dir)) return map;
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith(".") || name.toLowerCase() === "readme.md") continue;
    const ext = path.extname(name).toLowerCase();
    if (![".pdf", ".txt", ".md"].includes(ext)) continue;
    const key = name.split(/\s+/)[0];
    if (!/^\d{4}[가-힣]{1,3}\d+$/.test(key)) {
      console.warn(`  [무시] 파일명 첫 토큰이 사건번호 형식이 아님: ${name}`);
      continue;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ name, full: path.join(dir, name), ext });
  }
  return map;
}

/** 수기 파일 → 텍스트. 스캔 PDF(텍스트 레이어 없음)는 빈 문자열. */
async function readManualFiles(files) {
  const parts = [];
  const used = [];
  for (const f of files) {
    let text = "";
    if (f.ext === ".pdf") {
      const mupdf = await import("mupdf");
      const bytes = new Uint8Array(fs.readFileSync(f.full));
      const doc = mupdf.Document.openDocument(bytes, "application/pdf");
      const pages = [];
      for (let i = 0; i < doc.countPages(); i++) {
        pages.push(
          doc.loadPage(i).toStructuredText("preserve-whitespace").asText(),
        );
      }
      text = pages
        .join("\n")
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } else {
      text = fs.readFileSync(f.full, "utf8").trim();
    }
    if (text) {
      parts.push(`[${f.name}]\n${text}`);
      used.push(f.name);
    } else {
      console.warn(`  [경고] 텍스트 추출 0자(스캔 PDF 추정): ${f.name}`);
    }
  }
  return { text: parts.join("\n\n———\n\n"), used };
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(MANUAL_DIRS[LAW], { recursive: true });

  let query = sb
    .from("cases")
    .select(
      "case_id, case_number, court, decided_at, case_title, official_text_md",
    )
    .is("deleted_at", null)
    .contains("subject_laws", [LAW])
    .order("decided_at");
  if (ONE_CASE) {
    query = query.eq("case_number", ONE_CASE);
  } else if (YEAR) {
    query = query
      .gte("decided_at", `${YEAR}-01-01`)
      .lt("decided_at", `${Number(YEAR) + 1}-01-01`);
  } else {
    query = query.gte("decided_at", `${FROM}-01-01`);
  }
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const scope = ONE_CASE ?? (YEAR ? `${LAW}-${YEAR}` : `${LAW}-${FROM}~`);
  console.log(`대상 ${rows.length}건 (${scope})\n`);

  const manual = scanManualDir(LAW);
  const report = {
    scope,
    generatedAt: new Date().toISOString(),
    total: rows.length,
    lowerAuto: [],
    lowerSelf: [],
    lowerManual: [],
    notInApi: [],
    noLowerRef: [],
    failed: [],
  };

  for (const row of rows) {
    const cn = row.case_number;
    const cachePath = path.join(CACHE_DIR, `${cn}.json`);
    const label = `${cn.padEnd(13)} ${row.decided_at}`;

    if (!REFRESH && fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      const bucket =
        cached.sourceKind === "lower_manual"
          ? "lowerManual"
          : cached.sourceKind === "lower_self"
            ? "lowerSelf"
            : "lowerAuto";
      report[bucket].push({
        case: cn,
        ref: cached.sourceRef,
        chars: cached.text.length,
      });
      console.log(`${label}  캐시 ${String(cached.text.length).padStart(6)}자  ${cached.sourceRef}`);
      continue;
    }

    // ⓪ 판례 자체가 하급심(특허법원·고법 등)이면 자기 원문이 곧 사실관계 소스 — 원심을 찾을 이유가 없다.
    if (
      row.court &&
      row.court !== "supreme" &&
      (row.official_text_md ?? "").trim()
    ) {
      const rec = {
        supremeCaseNumber: cn,
        sourceKind: "lower_self",
        sourceRef: `${COURT_LABEL[row.court] ?? row.court} ${cn}`,
        fetchedAt: new Date().toISOString(),
        text: row.official_text_md.trim(),
      };
      fs.writeFileSync(cachePath, JSON.stringify(rec, null, 2), "utf8");
      report.lowerSelf.push({
        case: cn,
        ref: rec.sourceRef,
        chars: rec.text.length,
      });
      console.log(
        `${label}  자체 ${String(rec.text.length).padStart(6)}자  ${rec.sourceRef}`,
      );
      continue;
    }

    // ② 수기 투입본이 있으면 자동보다 우선(원장이 일부러 넣은 것).
    const manualFiles = manual.get(cn);
    if (manualFiles?.length) {
      const { text, used } = await readManualFiles(manualFiles);
      if (text) {
        const rec = {
          supremeCaseNumber: cn,
          sourceKind: "lower_manual",
          sourceRef: used.map((n) => path.parse(n).name.replace(`${cn} `, "")).join(" / "),
          files: used,
          fetchedAt: new Date().toISOString(),
          text,
        };
        fs.writeFileSync(cachePath, JSON.stringify(rec, null, 2), "utf8");
        report.lowerManual.push({ case: cn, ref: rec.sourceRef, chars: text.length });
        console.log(`${label}  수기 ${String(text.length).padStart(6)}자  ${rec.sourceRef}`);
        continue;
      }
      report.failed.push({ case: cn, reason: "수기 파일 텍스트 추출 0자" });
      console.log(`${label}  ✗ 수기 파일 추출 실패`);
      continue;
    }

    // ① 자동
    const ref = parseLowerRef(row.official_text_md);
    if (!ref) {
      report.noLowerRef.push({ case: cn, decidedAt: row.decided_at, title: (row.case_title ?? "").slice(0, 60) });
      console.log(`${label}  ✗ 원심 표기 없음`);
      continue;
    }
    try {
      const found = await findSerial(ref.caseNumber);
      await sleep(REQUEST_GAP_MS);
      if (!found) {
        report.notInApi.push({ case: cn, lower: `${ref.court} ${ref.caseNumber}` });
        console.log(`${label}  ✗ 미수록  ${ref.court} ${ref.caseNumber}`);
        continue;
      }
      const text = await fetchFullText(found.serial);
      await sleep(REQUEST_GAP_MS);
      if (!text) {
        report.failed.push({ case: cn, reason: `전문 본문 없음 (serial ${found.serial})` });
        console.log(`${label}  ✗ 전문 없음`);
        continue;
      }
      const rec = {
        supremeCaseNumber: cn,
        sourceKind: "lower_auto",
        sourceRef: `${found.court || ref.court} ${ref.caseNumber}`,
        lowerCaseNumber: ref.caseNumber,
        serial: found.serial,
        decidedAt: found.decidedAt,
        fetchedAt: new Date().toISOString(),
        text,
      };
      fs.writeFileSync(cachePath, JSON.stringify(rec, null, 2), "utf8");
      report.lowerAuto.push({ case: cn, ref: rec.sourceRef, chars: text.length });
      console.log(`${label}  자동 ${String(text.length).padStart(6)}자  ${rec.sourceRef}`);
    } catch (e) {
      report.failed.push({ case: cn, reason: String(e.message).slice(0, 120) });
      console.log(`${label}  ✗ 오류 ${String(e.message).slice(0, 60)}`);
    }
  }

  const reportPath = path.join(CACHE_DIR, `_report-${scope}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const need = [...report.notInApi.map((r) => r.case), ...report.noLowerRef.map((r) => r.case)];
  console.log(
    `\n확보 ${report.lowerAuto.length + report.lowerSelf.length + report.lowerManual.length}건` +
      ` (자동 ${report.lowerAuto.length} / 자체 ${report.lowerSelf.length} / 수기 ${report.lowerManual.length})` +
      ` · 미확보 ${need.length}건 · 실패 ${report.failed.length}건`,
  );
  if (need.length) {
    console.log(`\n── 수기 투입 대상 (${need.length}건) ──`);
    for (const r of report.notInApi) console.log(`  ${r.case}  ← ${r.lower} (법령정보센터 미수록)`);
    for (const r of report.noLowerRef) console.log(`  ${r.case}  ← 원심 표기 없음 · ${r.title}`);
    console.log(`\n  → ${MANUAL_DIRS[LAW]} 에 "<대법원사건번호> <법원> <하급심사건번호>.pdf" 로 넣고 재실행`);
  }
  console.log(`\n리포트: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
