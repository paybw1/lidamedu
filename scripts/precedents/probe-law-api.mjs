// §0 — 국가법령정보 OPEN API (판례) 진단 1건 probe.
//
// 목적: 코드 적재 전 실제 요청·응답을 추측 없이 확인.
//   (a) 목록 조회 (lawSearch.do?target=prec&query=<사건번호>) → 판례일련번호·필드
//   (b) 본문 조회 (lawService.do?target=prec&ID=<일련번호>)   → 전문·메타 필드
//
// 입력:
//   .env  LAW_API_KEY=<발급 ID>   (국가법령정보센터 OPEN API 신청 후 메일로 받는 식별자,
//                                  일반적으로 메일 @ 앞 ID. URL 파라미터 이름은 `OC`)
//   --case "2012후726"   (기본값. 다른 사건번호로 바꿔서 probe 가능)
//   --type XML|JSON      (기본 XML — 목록·본문 모두 일관 형식 사용)
//
// 출력:
//   tmp/law-api-probe/list.<ext>          목록 응답 원본
//   tmp/law-api-probe/service.<ext>       본문 응답 원본
//   tmp/law-api-probe/report.json         필드 매핑·시도 요약
//
// 사용:
//   node scripts/precedents/probe-law-api.mjs
//   node scripts/precedents/probe-law-api.mjs --case "2018후10848"
//
// 키 누락 시 사용자 액션 안내만 출력 후 종료(코드 적재 단계 진입 X).

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return fallback;
}

const OC = process.env.LAW_API_KEY;
if (!OC) {
  process.stderr.write(
    [
      "✗ .env 에 LAW_API_KEY 가 없습니다.",
      "",
      "  국가법령정보 OPEN API 식별자 발급 안내:",
      "  1) https://open.law.go.kr  접속 → 회원가입",
      "  2) [OPEN API] → [API 신청] → 활용 사이트(도메인) 등록",
      "  3) 승인 후 메일로 받은 식별자(통상 메일 @ 앞 ID) = OC 파라미터",
      "  4) .env 에 추가:  LAW_API_KEY=<발급ID>",
      "     (URL 파라미터 이름은 OC 지만, 우리는 LAW_API_KEY 라는 이름으로 보관)",
      "",
      "  등록 후 다시 실행:  node scripts/precedents/probe-law-api.mjs",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const CASE_RAW = arg("--case", "2012후726");
const TYPE = (arg("--type", "XML") || "XML").toUpperCase();
const EXT = TYPE === "JSON" ? "json" : "xml";

const OUT_DIR = resolve(process.cwd(), "tmp/law-api-probe");
mkdirSync(OUT_DIR, { recursive: true });

// 베이스 URL — 국가법령정보 OPEN API (DRF: Data Request Framework).
//   판례:  target=prec, query=사건번호 또는 키워드
//   본문:  ID=판례일련번호 (목록 응답에서 추출)
const BASE = "https://www.law.go.kr/DRF";

function buildUrl(endpoint, params) {
  const u = new URL(`${BASE}/${endpoint}`);
  u.searchParams.set("OC", OC);
  u.searchParams.set("target", "prec");
  u.searchParams.set("type", TYPE);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function fetchText(url, label) {
  const t0 = Date.now();
  const resp = await fetch(url, {
    headers: { "User-Agent": "lidami-case-import/0.1 (probe)" },
  });
  const elapsedMs = Date.now() - t0;
  const text = await resp.text();
  return {
    label,
    url,
    status: resp.status,
    ok: resp.ok,
    contentType: resp.headers.get("content-type"),
    contentLength: text.length,
    elapsedMs,
    body: text,
  };
}

// 매우 가벼운 XML 파싱 (의존성 추가 없이) — 진단 목적의 필드 추출만.
// 정식 적재 단계는 fast-xml-parser 등 도입 검토 (별도 결정).
function pickXmlTag(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return m ? m[1].trim() : null;
}
function listXmlTags(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

function describeChildren(xml, maxKeys = 30) {
  // 한 단계 child 태그 이름을 수집해 상위 N개만 노출.
  const re = /<([A-Za-z가-힣_][^\s/>]*)[^>]*>/g;
  const counts = new Map();
  let m;
  while ((m = re.exec(xml)) !== null) {
    const name = m[1];
    if (name.startsWith("/")) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeys)
    .map(([name, n]) => `${name}×${n}`);
}

async function main() {
  process.stdout.write(`\n=== §0 국가법령정보 OPEN API 진단 ===\n`);
  process.stdout.write(`  사건번호:  ${CASE_RAW}\n`);
  process.stdout.write(`  type:      ${TYPE}\n`);
  process.stdout.write(`  out:       ${OUT_DIR}\n\n`);

  // (a) 목록 조회 — 사건번호를 query 로 던져 판례일련번호 추출 가능한지 확인.
  const listUrl = buildUrl("lawSearch.do", {
    query: CASE_RAW,
    display: 5,
    page: 1,
    search: 2, // 일부 API 는 1=법령명, 2=본문 — 진단으로 둘 다 시도해 볼 수 있게 표시
  });
  process.stdout.write(`① 목록 조회\n`);
  process.stdout.write(`   GET ${listUrl.replace(OC, "<OC>")}\n`);
  const listResp = await fetchText(listUrl, "list").catch((e) => ({
    label: "list",
    error: e instanceof Error ? e.message : String(e),
  }));
  if (listResp.error) {
    process.stdout.write(`   ✗ ${listResp.error}\n`);
    process.exit(1);
  }
  const listPath = resolve(OUT_DIR, `list.${EXT}`);
  writeFileSync(listPath, listResp.body, "utf-8");
  process.stdout.write(
    `   status=${listResp.status} ct=${listResp.contentType} bytes=${listResp.contentLength} t=${listResp.elapsedMs}ms\n`,
  );
  process.stdout.write(`   saved: ${listPath}\n`);

  // (a) 응답에서 판례일련번호 시도 추출 (XML 가정).
  // 국가법령정보 OPEN API 판례 검색 응답의 식별자 후보 태그:
  //   판례일련번호 / 판례ID / id  — 환경마다 다를 수 있어 모두 시도.
  let serialId = null;
  let listChildren = [];
  let listCount = null;
  if (TYPE === "XML") {
    listChildren = describeChildren(listResp.body, 40);
    listCount = pickXmlTag(listResp.body, "totalCnt");
    serialId =
      pickXmlTag(listResp.body, "판례일련번호") ??
      pickXmlTag(listResp.body, "id") ??
      listXmlTags(listResp.body, "prec")
        .map((b) => pickXmlTag(b, "판례일련번호") ?? pickXmlTag(b, "id"))
        .find((v) => v != null) ??
      null;
  } else {
    // JSON — 일반적으로 {PrecSearch:{prec:[{판례일련번호:...}]}}
    try {
      const j = JSON.parse(listResp.body);
      const root = j.PrecSearch ?? j.precSearch ?? j;
      const arr = Array.isArray(root?.prec) ? root.prec : root?.prec ? [root.prec] : [];
      listCount = root?.totalCnt ?? null;
      listChildren = arr[0] ? Object.keys(arr[0]).slice(0, 40) : Object.keys(root ?? {});
      serialId = arr[0]?.["판례일련번호"] ?? arr[0]?.id ?? null;
    } catch {
      /* keep null */
    }
  }
  process.stdout.write(
    `   추출: totalCnt=${listCount ?? "?"}  판례일련번호=${serialId ?? "(미발견)"}\n`,
  );
  process.stdout.write(`   상위 태그/키: ${listChildren.slice(0, 12).join(", ")}\n\n`);

  // (b) 본문 조회 — 일련번호 있으면 ID 로, 없으면 사건번호 그대로 시도(폴백).
  let svcUrl;
  if (serialId) {
    svcUrl = buildUrl("lawService.do", { ID: serialId });
    process.stdout.write(`② 본문 조회 — ID=${serialId}\n`);
  } else {
    // 사건번호 직접 본문 호출 가능 여부 확인용 폴백(추측 검증).
    svcUrl = buildUrl("lawService.do", { LM: CASE_RAW });
    process.stdout.write(`② 본문 조회 — 폴백(LM=사건번호) ${CASE_RAW}\n`);
  }
  process.stdout.write(`   GET ${svcUrl.replace(OC, "<OC>")}\n`);
  const svcResp = await fetchText(svcUrl, "service").catch((e) => ({
    label: "service",
    error: e instanceof Error ? e.message : String(e),
  }));
  if (svcResp.error) {
    process.stdout.write(`   ✗ ${svcResp.error}\n`);
    process.exit(1);
  }
  const svcPath = resolve(OUT_DIR, `service.${EXT}`);
  writeFileSync(svcPath, svcResp.body, "utf-8");
  process.stdout.write(
    `   status=${svcResp.status} ct=${svcResp.contentType} bytes=${svcResp.contentLength} t=${svcResp.elapsedMs}ms\n`,
  );
  process.stdout.write(`   saved: ${svcPath}\n`);

  // 본문 필드 매핑 시도 — 어떤 태그가 전문(full text), 사건번호, 법원, 선고일, 사건명을 담는지.
  // (정식 매핑은 적재 단계에서 확정. 여기선 후보 태그만 노출.)
  const fieldGuess = {};
  if (TYPE === "XML") {
    fieldGuess["사건번호?"] = pickXmlTag(svcResp.body, "사건번호");
    fieldGuess["법원명?"] = pickXmlTag(svcResp.body, "법원명");
    fieldGuess["선고일자?"] = pickXmlTag(svcResp.body, "선고일자");
    fieldGuess["사건명?"] = pickXmlTag(svcResp.body, "사건명");
    fieldGuess["판시사항(앞 200자)"] = (pickXmlTag(svcResp.body, "판시사항") ?? "").slice(0, 200);
    fieldGuess["판결요지(앞 200자)"] = (pickXmlTag(svcResp.body, "판결요지") ?? "").slice(0, 200);
    fieldGuess["참조조문(앞 200자)"] = (pickXmlTag(svcResp.body, "참조조문") ?? "").slice(0, 200);
    fieldGuess["참조판례(앞 200자)"] = (pickXmlTag(svcResp.body, "참조판례") ?? "").slice(0, 200);
    fieldGuess["판례내용 길이"] =
      (pickXmlTag(svcResp.body, "판례내용") ?? "").length || 0;
    fieldGuess["상위태그"] = describeChildren(svcResp.body, 30);
  } else {
    try {
      const j = JSON.parse(svcResp.body);
      const root = j.PrecService ?? j.precService ?? j;
      fieldGuess["키"] = Object.keys(root ?? {}).slice(0, 30);
      fieldGuess["사건번호?"] = root?.["사건번호"] ?? null;
      fieldGuess["법원명?"] = root?.["법원명"] ?? null;
      fieldGuess["선고일자?"] = root?.["선고일자"] ?? null;
      fieldGuess["사건명?"] = root?.["사건명"] ?? null;
      fieldGuess["판례내용 길이"] =
        typeof root?.["판례내용"] === "string" ? root["판례내용"].length : 0;
    } catch {
      fieldGuess["error"] = "JSON parse failed";
    }
  }

  const report = {
    at: new Date().toISOString(),
    caseInput: CASE_RAW,
    type: TYPE,
    list: {
      url: listResp.url.replace(OC, "<OC>"),
      status: listResp.status,
      contentType: listResp.contentType,
      bytes: listResp.contentLength,
      elapsedMs: listResp.elapsedMs,
      totalCnt: listCount,
      serialId,
      topTags: listChildren.slice(0, 20),
      file: listPath,
    },
    service: {
      url: svcResp.url.replace(OC, "<OC>"),
      status: svcResp.status,
      contentType: svcResp.contentType,
      bytes: svcResp.contentLength,
      elapsedMs: svcResp.elapsedMs,
      file: svcPath,
      fieldGuess,
    },
    notes: [
      "본문 조회가 ID(판례일련번호) 키인지, 사건번호(LM) 키인지 시도 결과로 확정.",
      "응답이 HTML 로 오면(content-type) 인증/도메인 미승인 가능 — 신청 시 활용 도메인 등록 확인.",
      "일 한도 도달 시 별도 안내 페이지 응답 가능 — 그 경우도 file 로 dump 됨.",
    ],
  };
  const reportPath = resolve(OUT_DIR, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");

  process.stdout.write(`\n=== 요약 ===\n`);
  process.stdout.write(
    `  목록 ${listResp.status} / 본문 ${svcResp.status} / 판례일련번호 ${serialId ?? "?"}\n`,
  );
  process.stdout.write(`  필드 추정: ${Object.keys(fieldGuess).join(", ")}\n`);
  process.stdout.write(`  report:  ${reportPath}\n`);
  process.stdout.write(
    `\n다음 단계: 위 report 와 원본 응답을 보고 §1 정규화·§2 적재 흐름 확정.\n`,
  );
}

main().catch((e) => {
  process.stderr.write(
    `FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`,
  );
  process.exit(1);
});
