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

/** 법원명 정규화 — "서울고등법원" ↔ "서울고법", "대구지방법원" ↔ "대구지법" 을 같게 본다. */
export function normalizeCourt(name) {
  return String(name ?? "")
    .replace(/\s+/g, "")
    .replace(/고등법원/g, "고법")
    .replace(/지방법원/g, "지법")
    .replace(/가정법원/g, "가법")
    .replace(/행정법원/g, "행법")
    .trim();
}

/**
 * 대법원 원문 헤더에서 원심 표기 추출. 판결·결정 둘 다.
 *
 * ★표기가 세 갈래다(원장 지적 2026-08-20 — "전문에 원심번호가 있는데 미상으로 나온다"):
 *   ① 【원심판결】 특허법원 2023. 6. 16. 선고 2022허4635 판결
 *   ② 원 심 판 결  특허법원 2016. 1. 21. 선고 2014허4913 판결   ← 글자 사이 공백·괄호 없음
 *   ③ 【원심결정】 대구지법 2024. 12. 5.자 2024라10826 결정
 *   ②를 못 잡아 41건이 통째로 "원심 미상"으로 분류돼 있었다.
 * 사건번호 연도도 2자리(98노8499)가 있어 \d{2,4} 로 받는다.
 */
// "원심판결" / "원 심 판 결" / "원심결정" — 앞뒤 【】는 있어도 없어도 된다.
const LOWER_MARKER = "【?\\s*원\\s*심\\s*(?:판\\s*결|결\\s*정)\\s*】?";
const CASE_NO = "\\d{2,4}\\s*[가-힣]{1,3}\\s*\\d+";

function parseLowerRef(officialTextMd) {
  // 줄바꿈이 공백으로 들어온 전문이 많아 공백을 한 칸으로 눌러 놓고 찾는다.
  const text = String(officialTextMd ?? "").replace(/\s+/g, " ");
  const clean = (s) => s.replace(/\s+/g, "");

  const withDate = new RegExp(
    `${LOWER_MARKER}\\s*([^【]*?)\\s*(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.\\s*(?:선고|자)\\s*(${CASE_NO})`,
  );
  const md = text.match(withDate);
  if (md) {
    const pad = (v) => String(v).padStart(2, "0");
    return {
      court: md[1].replace(/[,\s]+$/, "").trim(),
      decidedAt: `${md[2]}.${pad(md[3])}.${pad(md[4])}`,
      caseNumber: clean(md[5]),
    };
  }
  const noDate = new RegExp(`${LOWER_MARKER}\\s*([^【]*?)\\s*(${CASE_NO})`);
  const m = text.match(noDate);
  if (!m) return null;
  return {
    court: m[1].replace(/[,\s]+$/, "").trim(),
    decidedAt: null,
    caseNumber: clean(m[2]),
  };
}

/**
 * 국가법령정보센터 — 사건번호로 판례일련번호 조회. ★nb= 가 사건번호 키(query= 는 사건명).
 *
 * ★사건번호만으로는 판례가 유일하지 않다 — `허` 는 특허법원 전용이라 안전하지만
 *   `나`·`가합`·`라` 는 법원마다 같은 번호가 존재한다(서울고법 2008나68717 ≠ 부산고법 2008나68717).
 *   법원명이 다르면 채택하지 않는다. 엉뚱한 사건의 사실관계에 그럴듯한 출처를 달아 주는 게
 *   이 기능의 최악 실패다. 선고일자가 파싱된 경우 2차 확인으로 쓴다.
 */
async function findSerial(caseNumber, expected) {
  const url = `${API}/lawSearch.do?OC=${OC}&target=prec&type=JSON&nb=${encodeURIComponent(caseNumber)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawSearch ${res.status}`);
  const json = await res.json().catch(() => null);
  const raw = json?.PrecSearch?.prec;
  if (!raw) return { hit: null, reason: "미수록" };
  const list = Array.isArray(raw) ? raw : [raw];
  // 부분일치가 섞여 올 수 있어 사건번호 완전일치만 후보로.
  const sameNumber = list.filter(
    (p) => String(p?.사건번호 ?? "").trim() === caseNumber,
  );
  if (!sameNumber.length) return { hit: null, reason: "미수록" };

  const wantCourt = normalizeCourt(expected?.court);
  const verified = sameNumber.filter((p) => {
    const gotCourt = normalizeCourt(p?.법원명);
    const courtOk = !wantCourt || !gotCourt || gotCourt === wantCourt;
    const gotDate = String(p?.선고일자 ?? "").trim();
    const dateOk = !expected?.decidedAt || !gotDate || gotDate === expected.decidedAt;
    return courtOk && dateOk;
  });
  if (!verified.length) {
    const got = sameNumber
      .map((p) => `${p?.법원명 ?? "?"} ${p?.선고일자 ?? "?"}`)
      .join(" / ");
    return {
      hit: null,
      reason: `법원·선고일 불일치 (기대 ${expected?.court ?? "?"} ${expected?.decidedAt ?? "?"} / 실제 ${got})`,
    };
  }
  const hit = verified[0];
  if (!hit?.판례일련번호) return { hit: null, reason: "미수록" };
  return {
    hit: {
      serial: String(hit.판례일련번호),
      court: String(hit.법원명 ?? "").trim(),
      decidedAt: String(hit.선고일자 ?? "").trim(),
    },
    reason: null,
  };
}

/**
 * 사실관계가 실린 전문인지 판정. law.go.kr 은 같은 사건이라도 판시사항·판결요지만
 * 수록한 레코드를 주는 일이 있는데, 그건 "확보"가 아니다(도식의 사실관계를 못 쓴다).
 */
export function hasFactSection(text) {
  const t = String(text ?? "");
  // 사실관계 표제는 법원·사건유형마다 다르다. 특허법원 심결취소소송은 "1. 기초사실" 이 많지만
  // "1. 이 사건 심결의 경위" 로 시작하는 판결도 그만큼 많다(둘 다 사실관계 절이다).
  if (
    /기초\s*사실|인정\s*사실|사실\s*관계|심결의\s*경위|처분의\s*경위|사건의\s*개요|분쟁의\s*경과|당사자의\s*주장/.test(
      t,
    )
  ) {
    return true;
  }
  // 표제가 위 어디에도 안 걸리는 판결문도 있다 — 당사자 표시와 【이 유】가 모두 있으면 전문으로 본다.
  // (판시사항·판결요지만 실린 레코드에는 둘 다 없다. 이 플래그의 목적이 바로 그 구분이다.)
  return (
    /【\s*원\s{0,6}고\s*】|【\s*신\s*청\s*인\s*】|【\s*채\s*권\s*자\s*】|【\s*항\s*소\s*인\s*】/.test(t) &&
    /【\s*이\s{0,6}유\s*】/.test(t)
  );
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
    noFacts: [],
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
      if (!hasFactSection(cached.text)) {
        report.noFacts.push({
          case: cn,
          lower: cached.sourceRef,
          chars: cached.text.length,
        });
        console.log(
          `${label}  △ 사실관계 없음(${cached.text.length}자)  ${cached.sourceRef}`,
        );
        continue;
      }
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
        hasFacts: hasFactSection(row.official_text_md),
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
          hasFacts: hasFactSection(text),
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
      const { hit: found, reason } = await findSerial(ref.caseNumber, ref);
      await sleep(REQUEST_GAP_MS);
      if (!found) {
        report.notInApi.push({
          case: cn,
          lower: `${ref.court} ${ref.caseNumber}`,
          reason,
        });
        console.log(`${label}  ✗ ${reason}  ${ref.court} ${ref.caseNumber}`);
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
        // ★수록은 됐어도 판시사항·요지만 실린 레코드가 있다 — 그건 사실관계 소스가 못 된다.
        //   캐시는 남기되(재요청 방지) 플래그로 갈라, 생성기는 hasFacts 인 것만 쓴다.
        hasFacts: hasFactSection(text),
        text,
      };
      fs.writeFileSync(cachePath, JSON.stringify(rec, null, 2), "utf8");
      if (!rec.hasFacts) {
        report.noFacts.push({ case: cn, lower: rec.sourceRef, chars: text.length });
        console.log(`${label}  △ 요지만 ${String(text.length).padStart(6)}자  ${rec.sourceRef}`);
      } else {
        report.lowerAuto.push({ case: cn, ref: rec.sourceRef, chars: text.length });
        console.log(`${label}  자동 ${String(text.length).padStart(6)}자  ${rec.sourceRef}`);
      }
    } catch (e) {
      report.failed.push({ case: cn, reason: String(e.message).slice(0, 120) });
      console.log(`${label}  ✗ 오류 ${String(e.message).slice(0, 60)}`);
    }
  }

  const reportPath = path.join(CACHE_DIR, `_report-${scope}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const need = [
    ...report.notInApi.map((r) => r.case),
    ...report.noFacts.map((r) => r.case),
    ...report.noLowerRef.map((r) => r.case),
  ];
  console.log(
    `\n확보 ${report.lowerAuto.length + report.lowerSelf.length + report.lowerManual.length}건` +
      ` (자동 ${report.lowerAuto.length} / 자체 ${report.lowerSelf.length} / 수기 ${report.lowerManual.length})` +
      ` · 미확보 ${need.length}건 · 실패 ${report.failed.length}건`,
  );
  if (need.length) {
    console.log(`\n── 수기 투입 대상 (${need.length}건) ──`);
    for (const r of report.notInApi) console.log(`  ${r.case}  ← ${r.lower} (${r.reason ?? "법령정보센터 미수록"})`);
    for (const r of report.noFacts) console.log(`  ${r.case}  ← ${r.lower} (수록됐으나 요지만 ${r.chars}자 — 사실관계 없음)`);
    for (const r of report.noLowerRef) console.log(`  ${r.case}  ← 원심 표기 없음 · ${r.title}`);
    console.log(`\n  → ${MANUAL_DIRS[LAW]} 에 "<대법원사건번호> <법원> <하급심사건번호>.pdf" 로 넣고 재실행`);
  }
  console.log(`\n리포트: ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
