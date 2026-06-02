// §0 보강 — 목록 조회 파라미터 변형 시도 + 본문 ID/LM 양쪽 확인.
//
// 기존 probe-law-api.mjs 는 한 가지 조합만 시도해서 "필수입력 누락" 응답을 받았다.
// 이 스크립트는 6가지 variant 를 순차 호출해서 어느 조합이 200 + 데이터 응답을 주는지 확인.
//
// 사용:
//   node scripts/precedents/probe-law-api-variants.mjs
//   node scripts/precedents/probe-law-api-variants.mjs --case "2018후10848"
//
// 출력:
//   tmp/law-api-probe/variants/v<n>.<list|service>.xml  각 variant raw
//   tmp/law-api-probe/variants/summary.json             요약

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
  process.stderr.write("✗ .env LAW_API_KEY 누락\n");
  process.exit(2);
}
const CASE_RAW = arg("--case", "2012후726");
const OUT_DIR = resolve(process.cwd(), "tmp/law-api-probe/variants");
mkdirSync(OUT_DIR, { recursive: true });

const BASE = "https://www.law.go.kr/DRF";

function buildUrl(endpoint, params) {
  const u = new URL(`${BASE}/${endpoint}`);
  u.searchParams.set("OC", OC);
  u.searchParams.set("target", "prec");
  u.searchParams.set("type", "XML");
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

async function fetchText(url) {
  const t0 = Date.now();
  const resp = await fetch(url, {
    headers: { "User-Agent": "lidami-case-import/0.1 (probe-variants)" },
  });
  const text = await resp.text();
  return {
    url,
    status: resp.status,
    ct: resp.headers.get("content-type"),
    bytes: text.length,
    ms: Date.now() - t0,
    body: text,
  };
}

function pickTag(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return m ? m[1].trim() : null;
}
function isErrorEnvelope(xml) {
  // 에러 응답은 <Response><result>...</result><msg>...</msg></Response>
  return /<Response>\s*<result>/.test(xml) && /<msg>/.test(xml);
}

const LIST_VARIANTS = [
  { name: "L1: query 만", params: { query: CASE_RAW } },
  { name: "L2: query + search=1(법령/사건명)", params: { query: CASE_RAW, search: 1 } },
  { name: "L3: query + search=2(본문)", params: { query: CASE_RAW, search: 2 } },
  { name: "L4: LM (사건번호 전용)", params: { LM: CASE_RAW } },
  { name: "L5: nw=1 (법령정보·신규) + query", params: { query: CASE_RAW, nw: 1 } },
  { name: "L6: prncYd + query (선고연도)", params: { query: CASE_RAW, prncYd: "20120101~20131231" } },
];

const SERVICE_VARIANTS_NO_ID = [
  { name: "S-LM: 사건번호 직접", params: { LM: CASE_RAW } },
  { name: "S-CASE: case=사건번호", params: { case: CASE_RAW } },
];

async function main() {
  process.stdout.write(`\n=== §0 variants — ${CASE_RAW} ===\n`);

  const summary = { at: new Date().toISOString(), caseInput: CASE_RAW, list: [], service: [], serialIdFound: null };

  for (let i = 0; i < LIST_VARIANTS.length; i++) {
    const v = LIST_VARIANTS[i];
    const url = buildUrl("lawSearch.do", v.params);
    const r = await fetchText(url);
    const f = resolve(OUT_DIR, `v${i + 1}.list.xml`);
    writeFileSync(f, r.body, "utf-8");
    const err = isErrorEnvelope(r.body);
    const errMsg = err ? pickTag(r.body, "msg") ?? pickTag(r.body, "result") : null;
    const totalCnt = pickTag(r.body, "totalCnt");
    const serialId =
      pickTag(r.body, "판례일련번호") ??
      pickTag(r.body, "id") ??
      null;
    if (serialId && !summary.serialIdFound) summary.serialIdFound = serialId;

    const tagSnapshot = r.body.replace(/\s+/g, " ").slice(0, 300);
    process.stdout.write(`  ${v.name}\n`);
    process.stdout.write(`    ${r.status} ${r.bytes}B ${r.ms}ms  err=${err ? "Y" : "N"} totalCnt=${totalCnt ?? "?"} 판례일련번호=${serialId ?? "?"}\n`);
    if (err) process.stdout.write(`    msg: ${errMsg}\n`);
    summary.list.push({
      variant: v.name,
      params: { ...v.params, OC: "<OC>" },
      status: r.status,
      bytes: r.bytes,
      ms: r.ms,
      isError: err,
      errMsg,
      totalCnt,
      serialId,
      file: f,
      head: tagSnapshot,
    });
    await new Promise((r) => setTimeout(r, 300)); // gentle rate limit
  }

  // 본문 조회 — 목록에서 ID 찾았으면 ID 로, 아니면 ID 없는 변형들.
  if (summary.serialIdFound) {
    const id = summary.serialIdFound;
    const url = buildUrl("lawService.do", { ID: id });
    const r = await fetchText(url);
    const f = resolve(OUT_DIR, `s.id.xml`);
    writeFileSync(f, r.body, "utf-8");
    const err = isErrorEnvelope(r.body);
    process.stdout.write(`  S-ID: ID=${id}\n`);
    process.stdout.write(`    ${r.status} ${r.bytes}B ${r.ms}ms  err=${err ? "Y" : "N"}\n`);
    if (err) process.stdout.write(`    msg: ${pickTag(r.body, "msg")}\n`);
    summary.service.push({ variant: "S-ID", id, status: r.status, bytes: r.bytes, isError: err, file: f });
  } else {
    for (let i = 0; i < SERVICE_VARIANTS_NO_ID.length; i++) {
      const v = SERVICE_VARIANTS_NO_ID[i];
      const url = buildUrl("lawService.do", v.params);
      const r = await fetchText(url);
      const f = resolve(OUT_DIR, `s${i + 1}.xml`);
      writeFileSync(f, r.body, "utf-8");
      const err = isErrorEnvelope(r.body);
      const errMsg = err ? pickTag(r.body, "msg") : null;
      process.stdout.write(`  ${v.name}\n`);
      process.stdout.write(`    ${r.status} ${r.bytes}B ${r.ms}ms  err=${err ? "Y" : "N"}\n`);
      if (err) process.stdout.write(`    msg: ${errMsg}\n`);
      summary.service.push({
        variant: v.name,
        params: { ...v.params, OC: "<OC>" },
        status: r.status,
        bytes: r.bytes,
        isError: err,
        errMsg,
        file: f,
      });
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const out = resolve(OUT_DIR, "summary.json");
  writeFileSync(out, JSON.stringify(summary, null, 2), "utf-8");
  process.stdout.write(`\nsummary: ${out}\n`);

  const winners = summary.list.filter((l) => !l.isError && (l.totalCnt || l.serialId));
  if (winners.length) {
    process.stdout.write(`\n✓ 동작 variant: ${winners.map((w) => w.variant).join(", ")}\n`);
  } else {
    process.stdout.write(`\n✗ 동작 variant 없음 — 모두 에러 응답. 위 msg 확인.\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
