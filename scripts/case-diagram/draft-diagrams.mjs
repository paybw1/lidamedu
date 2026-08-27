// feat-2-035 S3 — 판례 도식 배치 생성. 산출은 전부 draft(승인 큐) — 학생 비노출.
//
// ★AI 호출을 2번으로 나눈다. 설계 §2 소스 이원화를 코드에서도 지키기 위해서다.
//   ① 사실관계  ← 하급심 전문(로컬 캐시)만 입력
//   ② 쟁점~결론 ← 대법원 원문 + 판결요지만 입력
//   한 번에 넣으면 모델이 두 소스를 섞어 "대법원이 압축한 사실"을 사실관계로 쓰게 된다.
//
//   npx tsx scripts/case-diagram/draft-diagrams.mjs --year 2025            # dry-run(대상·비용 추정)
//   npx tsx scripts/case-diagram/draft-diagrams.mjs --year 2025 --apply
//   npx tsx scripts/case-diagram/draft-diagrams.mjs --case 2023후10712 --apply --force
//
// ★--facts-only — **사실관계만** 채운다(쟁점~결론은 그대로 둔다).
//   도식을 먼저 만들고 하급심 판결문을 나중에 구한 건들이 생긴다(2025년분 7건이 그랬다:
//   도식 08-19 생성 → 판결문 08-20 적재). 전체 재생성하면 검수를 마친 쟁점~결론까지
//   날아가므로, 빠진 사실관계만 붙인다. **승인본도 대상**이지만 검수 안 한 서술이 학생에게
//   바로 가면 안 되므로 **검수 대기로 되돌린다** — 다시 승인해야 학생에게 보인다.
//
//   npx tsx scripts/case-diagram/draft-diagrams.mjs --facts-only            # dry-run
//   npx tsx scripts/case-diagram/draft-diagrams.mjs --facts-only --apply
//
// --force 없이는 이미 도식이 있는 판례를 건너뛴다(멱등). 승인된 도식은 --force 여도 건드리지 않는다.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
// ★조각남 판정은 재추출 스크립트와 **같은 것**을 쓴다 — 사본을 두면 한쪽이 뺀 것을
//   다른 쪽이 통과시킨다. 그래서 이 파일은 node 가 아니라 tsx 로 돌린다.
import {
  SCRAMBLE_MAX,
  scrambleRatio,
} from "../../app/features/cases/lib/lower-court-text.ts";

const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const YEAR = argOf("--year");
// 쉼표로 여러 건 지정 가능 — "--case 2015라20296,2013다14361".
const ONE_CASE = argOf("--case");
const CASE_LIST = ONE_CASE
  ? ONE_CASE.split(",").map((x) => x.trim()).filter(Boolean)
  : [];
const LIMIT = argOf("--limit") ? Number(argOf("--limit")) : Infinity;
// ★사실관계 소스(하급심)가 있는 건만 생성 — 없는 건 쟁점~결론만 남아 반쪽 도식이 되고,
//   나중에 하급심을 구하면 --force 로 다시 돌려야 한다. 그럴 바엔 확보된 것부터 채운다.
const WITH_FACTS_ONLY = argv.includes("--with-facts");
// 사실관계가 비어 있는 기존 도식만 골라 그 칸만 채운다(쟁점~결론·검수 이력 보존).
const FACTS_ONLY = argv.includes("--facts-only");
const LAW = argOf("--law") ?? "patent";

const CACHE_DIR = path.resolve(process.cwd(), "source", "하급심 판결문", ".cache");
const BACKUP_DIR = path.resolve(process.cwd(), "tmp", "case-diagram");
const MODEL = "claude-opus-4-7";
// pricing.ts 와 동일 단가.
const COST = { inputPerM: 5.0, outputPerM: 25.0 };
const MIN_OFFICIAL_TEXT = 200;

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── 쟁점~결론 프롬프트는 앱 드래프터에서 그대로 읽어 온다 ──────────────────
// 복사해 두면 인앱 초안과 배치 초안이 조용히 갈라진다. 추출 실패 시 즉시 중단.
const DRAFTER_PATH = "app/features/cases/lib/ai-case-diagram-drafter.server.ts";
function loadBlocksSystemPrompt() {
  const src = fs.readFileSync(DRAFTER_PATH, "utf8");
  const marked = src.split("const SYSTEM_PROMPT = `")[1];
  if (!marked) throw new Error(`SYSTEM_PROMPT 를 못 찾음: ${DRAFTER_PATH}`);
  const prompt = marked.split("`;")[0];
  if (!prompt.includes("법리 4축") || !prompt.includes("비워 두세요")) {
    throw new Error("SYSTEM_PROMPT 형태가 바뀐 듯 — 추출 결과를 확인하세요.");
  }
  return prompt;
}
const BLOCKS_SYSTEM = loadBlocksSystemPrompt();

// ── 사실관계 프롬프트 (배치 전용 — 인앱에는 없는 경로) ─────────────────────
const FACTS_SYSTEM = `당신은 대한민국 변리사 2차(주관식) 시험 대비 자료를 만드는 사람입니다.
주어진 **하급심 판결문**에서 학생이 읽을 **사실관계**를 정리합니다.

2차 시험은 이 사실관계를 각색해 출제됩니다. 따라서 "무슨 일이 있었는가"가 구체적으로 남아야 합니다.

# 반드시 지킬 것
- 판결문의 기초사실·심결의 경위·당사자 주장 부분에서만 뽑습니다. **없는 사실을 지어내지 마세요.**
- 시간 순서로: 누가 언제 무엇을 출원·등록·실시·청구했는지.
- 심판·심결·소 제기 같은 절차 경과도 사실로서 포함합니다(2차 발문이 그대로 쓰는 부분입니다).
- 발명·표장의 내용은 쟁점을 이해하는 데 필요한 만큼만. 청구범위 전문을 옮기지 마세요.
- 당사자 표기는 판결문 그대로(원고/피고, ○○○ 같은 익명 표기 유지).

# 쓰지 말 것
- **법원의 판단·결론·법리** — 그건 도식의 뒷부분에서 따로 다룹니다.
  "법원은 ~라고 판단하였다", "따라서 ~이다", "쟁점은 ~이다" 같은 문장 금지.
- 상고심 결과("파기환송" 등).
- 판결문에 없는 사건번호·조문 번호.

# 형식
- markdown. 소제목(##)과 목록을 써도 좋습니다.
- **맨 앞에 "사실관계" 같은 전체 제목은 붙이지 마세요** — 화면이 이미 제목을 답니다.
- 400~1200자. 학생이 2분 안에 읽고 사안을 그릴 수 있게.`;

const BLOCKS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          issue: { type: "string" },
          statutes: { type: "array", items: { type: "string" } },
          doctrine: {
            type: "object",
            additionalProperties: false,
            properties: {
              textual: { type: "string" },
              purpose: { type: "string" },
              objective: { type: "string" },
              balance: { type: "string" },
            },
          },
          application: { type: "string" },
          conclusion: { type: "string" },
        },
        required: ["issue", "statutes", "doctrine", "application", "conclusion"],
      },
    },
  },
  required: ["blocks"],
};

let spentInput = 0;
let spentOutput = 0;
const usd = () =>
  (spentInput / 1e6) * COST.inputPerM + (spentOutput / 1e6) * COST.outputPerM;

const textOf = (res) =>
  res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

async function callModel({ system, prompt, maxTokens, schema }) {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      ...(schema ? { format: { type: "json_schema", schema } } : {}),
    },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  spentInput += res.usage?.input_tokens ?? 0;
  spentOutput += res.usage?.output_tokens ?? 0;
  return textOf(res);
}

// 사실관계와 타임라인은 같은 소스(하급심)에서 한 번에 뽑는다 — 따로 부르면 두 결과가
// 어긋난다(산문에는 있는 날짜가 타임라인엔 없는 식). 화면은 같은 사실을 두 형태로 보여준다.
const FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    facts_md: { type: "string" },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          when: { type: "string" },
          what: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "filing",
              "disclosure",
              "registration",
              "trial",
              "litigation",
              "other",
            ],
          },
        },
        required: ["when", "what", "kind"],
      },
    },
  },
  required: ["facts_md", "timeline"],
};

const TIMELINE_RULE = `
# 타임라인(timeline)
사실관계와 **같은 판결문에서** 출원·공지·등록·심판·소송의 경과를 시간 순서대로 뽑습니다.
- when: 판결문에 적힌 그대로("2018. 7. 5.", "2011. 6.경"). 없는 날짜를 만들지 마세요.
- what: 그 시점에 무슨 일이 있었는지 한 줄(40자 내외).
- kind: filing(출원) · disclosure(공지·공개·실시) · registration(등록) · trial(심판) ·
  litigation(소송) · other 중 하나.
- 시간 순서로 정렬. 날짜가 확인되는 것만. 5~12개 정도.`;

async function draftFacts(kase, cache) {
  const prompt = [
    "# 사건",
    `- 대법원 사건번호: ${kase.case_number}`,
    `- 하급심: ${cache.sourceRef}`,
    "",
    "# 하급심 판결문",
    cache.text,
    "",
    "위 판결문에서 사실관계와 경과 타임라인을 JSON 으로 정리하세요.",
    "법원의 판단·결론은 쓰지 마세요.",
  ].join("\n");
  const raw = await callModel({
    system: FACTS_SYSTEM + TIMELINE_RULE,
    prompt,
    maxTokens: 6000,
    schema: FACTS_SCHEMA,
  });
  const parsed = JSON.parse(raw);
  const factsMd = String(parsed?.facts_md ?? "")
    .trim()
    // 화면이 이미 "사실관계" 제목을 달고 있다 — 본문 첫 머리글이 중복되면 떼어낸다.
    .replace(/^\s*#{1,3}\s*사실\s*관계\s*\n+/, "");
  const timeline = (Array.isArray(parsed?.timeline) ? parsed.timeline : [])
    .slice(0, 14)
    .map((e) => ({
      when: clamp(e?.when, 40),
      what: clamp(e?.what, 200),
      kind: clamp(e?.kind, 20) || "other",
    }))
    .filter((e) => e.when && e.what);
  return { factsMd, timeline };
}

const clamp = (v, n = 1200) =>
  typeof v === "string" ? v.trim().slice(0, n) : "";

async function draftBlocks(kase) {
  const items = Array.isArray(kase.summary_items) ? kase.summary_items : [];
  const prompt = [
    "# 판례",
    `- 사건명: ${kase.case_title}`,
    `- 사건번호: ${kase.case_number}`,
    `- 법원/선고일: ${kase.court} ${kase.decided_at}`,
    "",
    ...(items.length
      ? [
          "# 판결요지(쟁점 분해 힌트)",
          ...items.map(
            (it, i) => `${i + 1}. ${it?.title ?? ""}\n${it?.body ?? ""}`,
          ),
          "",
        ]
      : []),
    "# 판결문 전문",
    kase.official_text_md,
    "",
    "위 판결을 쟁점 단위로 도식화해 JSON 으로 출력하세요.",
    "근거가 확인되지 않는 법리 축은 반드시 비워 두세요.",
  ].join("\n");
  const raw = await callModel({
    system: BLOCKS_SYSTEM,
    prompt,
    maxTokens: 12000,
    schema: BLOCKS_SCHEMA,
  });
  const parsed = JSON.parse(raw);
  const blocks = (parsed?.blocks ?? []).slice(0, 8).map((b) => {
    const doctrine = {};
    for (const k of ["textual", "purpose", "objective", "balance"]) {
      const v = clamp(b?.doctrine?.[k]);
      if (v) doctrine[k] = v;
    }
    return {
      issue: clamp(b?.issue),
      statutes: Array.isArray(b?.statutes)
        ? b.statutes.map((s) => clamp(s, 200)).filter(Boolean).slice(0, 6)
        : [],
      doctrine,
      application: clamp(b?.application),
      conclusion: clamp(b?.conclusion),
    };
  });
  return blocks.filter((b) => b.issue.length >= 2);
}

function readCache(caseNumber) {
  const p = path.join(CACHE_DIR, `${caseNumber}.json`);
  if (!fs.existsSync(p)) return null;
  const rec = JSON.parse(fs.readFileSync(p, "utf8"));
  // "수록됐지만 요지만" 캐시는 사실관계 소스가 못 된다 — 없는 것으로 취급.
  if (rec.hasFacts === false) return null;
  return rec;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let q = sb
    .from("cases")
    .select(
      "case_id, case_number, case_title, court, decided_at, official_text_md, summary_items",
    )
    .is("deleted_at", null)
    .contains("subject_laws", [LAW])
    .order("decided_at");
  if (CASE_LIST.length === 1) q = q.eq("case_number", CASE_LIST[0]);
  else if (CASE_LIST.length > 1) q = q.in("case_number", CASE_LIST);
  else if (YEAR)
    q = q
      .gte("decided_at", `${YEAR}-01-01`)
      .lt("decided_at", `${Number(YEAR) + 1}-01-01`);
  else q = q.gte("decided_at", "2005-01-01");
  const { data: cases, error } = await q;
  if (error) throw new Error(error.message);

  const ids = cases.map((c) => c.case_id);
  const { data: existing } = await sb
    .from("case_diagrams")
    .select(
      "case_id, diagram_id, review_status, facts_md, facts_source_kind, blocks",
    )
    .in("case_id", ids)
    .is("deleted_at", null);
  const byCase = new Map((existing ?? []).map((d) => [d.case_id, d]));

  let targets = [];
  const skipped = [];
  for (const c of cases) {
    const prev = byCase.get(c.case_id) ?? null;
    if (FACTS_ONLY) {
      // 사실관계가 비어 있는 **기존** 도식만. 승인 여부는 보지 않는다(쟁점~결론은 안 건드린다).
      if (!prev) {
        skipped.push({ case: c.case_number, why: "도식 없음(--facts-only)" });
        continue;
      }
      const hasFacts =
        prev.facts_source_kind !== "none" &&
        (prev.facts_md ?? "").trim().length > 0;
      // ★--force 는 **이미 채워진 사실관계를 다시 만든다**. 대상을 --case 로 좁히지 않으면
      //   전건이 대상이 되니 주의(예행에서 대상 수를 먼저 확인할 것).
      if (hasFacts && !FORCE) continue; // 대부분이라 건너뛴 목록은 찍지 않는다.
      targets.push({ kase: c, prev, cache: readCache(c.case_number) });
      continue;
    }
    if (prev?.review_status === "approved") {
      skipped.push({ case: c.case_number, why: "이미 승인됨" });
      continue;
    }
    if (prev && !FORCE) {
      skipped.push({ case: c.case_number, why: "도식 있음(--force 로 재생성)" });
      continue;
    }
    if ((c.official_text_md ?? "").trim().length < MIN_OFFICIAL_TEXT) {
      skipped.push({ case: c.case_number, why: "판례 전문 없음/짧음" });
      continue;
    }
    targets.push({ kase: c, prev, cache: readCache(c.case_number) });
  }

  // ★로컬 캐시가 유일한 소스가 아니다 — 운영 화면(/admin/cases/lower-court)에서 적재한
  //   판결문은 DB 에만 있다. case_lower_courts 를 2차 소스로 보지 않으면 화면에서 방금 구해
  //   넣은 판결문이 도식 생성에 반영되지 않는다.
  const needDb = targets.filter((t) => !t.cache);
  if (needDb.length) {
    const { data: lower, error: lowerErr } = await sb
      .from("case_lower_courts")
      .select(
        "case_id, source_kind, source_ref, body_text, law_serial_id, fetched_at",
      )
      .in(
        "case_id",
        needDb.map((t) => t.kase.case_id),
      )
      .eq("status", "loaded")
      .is("deleted_at", null);
    if (lowerErr) throw new Error(lowerErr.message);
    const byId = new Map((lower ?? []).map((r) => [r.case_id, r]));
    for (const t of needDb) {
      const r = byId.get(t.kase.case_id);
      if (!r?.body_text) continue;
      t.cache = {
        sourceKind: r.source_kind ?? "lower_auto",
        sourceRef: r.source_ref,
        serial: r.law_serial_id,
        fetchedAt: r.fetched_at,
        text: r.body_text,
        hasFacts: true,
      };
    }
  }

  // ★조각난 판결문은 사실관계 소스로 쓰지 않는다.
  //   좌표 복원 전 추출기로 올린 PDF 는 문장이 조각나고 숫자가 줄 끝으로 밀려 있다
  //   ("갑 제호증 5(9)"). 그대로 넣으면 날짜·등록번호를 잘못 옮긴 사실관계가 만들어지는데,
  //   2차는 이 사실관계를 각색해 출제하므로 틀린 채로 학생에게 간다. 원본을 다시 받아
  //   재추출할 때까지 소스 없음으로 취급한다(쟁점~결론은 대법원 원문이라 영향 없음).
  const scrambled = [];
  for (const t of targets) {
    if (!t.cache?.text) continue;
    const ratio = scrambleRatio(t.cache.text);
    if (ratio <= SCRAMBLE_MAX) continue;
    scrambled.push({ case: t.kase.case_number, ref: t.cache.sourceRef, ratio });
    t.cache = null;
  }
  if (scrambled.length) {
    console.log(
      `[제외] 판결문이 조각난 ${scrambled.length}건은 사실관계 소스에서 뺍니다 — 원본 PDF 재투입 후 재생성하세요.`,
    );
    for (const s of scrambled) {
      console.log(
        `    ${s.case.padEnd(13)} ${s.ref ?? "-"} (조각 비율 ${s.ratio.toFixed(2)})`,
      );
    }
  }

  // ★LIMIT 은 사실관계 필터 뒤에 적용한다 — 먼저 자르면 --with-facts 가 한 줌만 남긴다.
  if (FACTS_ONLY) {
    // 소스가 없으면 채울 것이 없다 — 판결문을 먼저 구해야 한다.
    const dropped = targets.filter((t) => !t.cache);
    targets = targets.filter((t) => t.cache);
    if (dropped.length) {
      console.log(
        `[--facts-only] 하급심 판결문이 없는 ${dropped.length}건 제외 — 판결문부터 구하세요.`,
      );
      for (const t of dropped) console.log(`    ${t.kase.case_number}`);
    }
  }
  if (WITH_FACTS_ONLY) {
    const dropped = targets.filter((t) => !t.cache);
    targets = targets.filter((t) => t.cache);
    if (dropped.length) {
      console.log(
        `[--with-facts] 하급심 미확보 ${dropped.length}건 제외 — 판결문을 구한 뒤 생성하세요.`,
      );
    }
  }
  if (targets.length > LIMIT) targets = targets.slice(0, LIMIT);

  console.log(
    `대상 ${targets.length}건 (사실관계 소스 있음 ${targets.filter((t) => t.cache).length}) · 건너뜀 ${skipped.length}`,
  );
  for (const s of skipped) console.log(`  skip ${s.case} — ${s.why}`);
  if (!APPLY && FACTS_ONLY) {
    console.log("\n[dry-run] 사실관계를 채울 대상:");
    for (const t of targets) {
      console.log(
        `  ${t.kase.case_number.padEnd(13)} ${t.kase.decided_at}  ${t.prev.review_status.padEnd(8)} 쟁점 ${(t.prev.blocks ?? []).length}개 유지  소스=${t.cache.sourceRef} (${t.cache.text.length}자)`,
      );
    }
    const demote = targets.filter((t) => t.prev.review_status === "approved");
    if (demote.length) {
      console.log(
        `\n★승인본 ${demote.length}건은 검수 대기로 되돌립니다 — 다시 승인해야 학생에게 보입니다.`,
      );
    }
    console.log("\n--apply 를 붙이면 실행합니다.");
    return;
  }
  if (!APPLY) {
    console.log("\n[dry-run] 생성 대상:");
    for (const t of targets) {
      console.log(
        `  ${t.kase.case_number.padEnd(13)} ${t.kase.decided_at}  전문 ${String((t.kase.official_text_md ?? "").length).padStart(6)}자  사실관계=${t.cache ? t.cache.sourceRef : "(없음 — 쟁점~결론만)"}`,
      );
    }
    console.log("\n--apply 를 붙이면 실행합니다.");
    return;
  }

  // 재생성 대상의 기존 내용을 먼저 백업(원장 수정분이 있을 수 있다).
  const stamp = process.env.RUN_STAMP ?? String(targets.length);
  const backupPath = path.join(BACKUP_DIR, `backup-${YEAR ?? ONE_CASE ?? "all"}-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      targets.filter((t) => t.prev).map((t) => ({ case: t.kase.case_number, prev: t.prev })),
      null,
      2,
    ),
    "utf8",
  );

  const results = [];
  const failed = [];
  for (const [i, t] of targets.entries()) {
    const cn = t.kase.case_number;
    try {
      if (FACTS_ONLY) {
        // 사실관계 칸만 갱신 — blocks·generated_by 는 손대지 않는다(검수 결과 보존).
        const only = await draftFacts(t.kase, t.cache);
        if (!only.factsMd) throw new Error("사실관계 0자");
        const demote = t.prev.review_status === "approved";
        const { error: fErr } = await sb
          .from("case_diagrams")
          .update({
            facts_md: only.factsMd,
            timeline: only.timeline,
            facts_source_kind: t.cache.sourceKind,
            facts_source_ref: t.cache.sourceRef,
            facts_source_meta: {
              serial: t.cache.serial ?? null,
              files: t.cache.files ?? null,
              fetchedAt: t.cache.fetchedAt ?? null,
            },
            // ★검수하지 않은 서술이 학생에게 바로 가면 안 된다 — 승인본은 검수 대기로.
            ...(demote
              ? { review_status: "draft", approved_at: null, approved_by: null }
              : {}),
          })
          .eq("case_id", t.kase.case_id);
        if (fErr) throw new Error(fErr.message);
        results.push({
          case: cn,
          blocks: (t.prev.blocks ?? []).length,
          factsChars: only.factsMd.length,
          timeline: only.timeline.length,
          axes: [],
        });
        console.log(
          `[${i + 1}/${targets.length}] ${cn.padEnd(13)} 사실관계 ${only.factsMd.length}자 · 경과 ${only.timeline.length}${demote ? " · 승인→검수 대기" : ""} · 누적 ${usd().toFixed(2)}`,
        );
        continue;
      }
      const facts = t.cache
        ? await draftFacts(t.kase, t.cache)
        : { factsMd: "", timeline: [] };
      const factsMd = facts.factsMd;
      const blocks = await draftBlocks(t.kase);
      if (blocks.length === 0) throw new Error("쟁점 0개");

      const payload = {
        case_id: t.kase.case_id,
        facts_md: factsMd,
        timeline: facts.timeline,
        facts_source_kind: t.cache ? t.cache.sourceKind : "none",
        facts_source_ref: t.cache ? t.cache.sourceRef : null,
        facts_source_meta: t.cache
          ? {
              serial: t.cache.serial ?? null,
              files: t.cache.files ?? null,
              fetchedAt: t.cache.fetchedAt ?? null,
            }
          : {},
        blocks,
        generated_by: "ai",
        review_status: "draft",
        approved_at: null,
        approved_by: null,
        rejected_reason: null,
        deleted_at: null,
      };
      const { error: upErr } = await sb
        .from("case_diagrams")
        .upsert(payload, { onConflict: "case_id" });
      if (upErr) throw new Error(upErr.message);

      const axes = blocks.map(
        (b) => Object.keys(b.doctrine).length,
      );
      results.push({ case: cn, blocks: blocks.length, factsChars: factsMd.length, timeline: facts.timeline.length, axes });
      console.log(
        `[${i + 1}/${targets.length}] ${cn.padEnd(13)} 쟁점 ${blocks.length} · 축 ${axes.join("/")} · 사실관계 ${factsMd.length}자 · 경과 ${facts.timeline.length} · 누적 $${usd().toFixed(2)}`,
      );
    } catch (e) {
      failed.push({ case: cn, reason: String(e.message).slice(0, 160) });
      console.log(`[${i + 1}/${targets.length}] ${cn.padEnd(13)} ✗ ${e.message}`);
    }
  }

  const totalBlocks = results.reduce((a, r) => a + r.blocks, 0);
  const axisHist = {};
  for (const r of results) for (const n of r.axes) axisHist[n] = (axisHist[n] ?? 0) + 1;
  console.log(
    `\n생성 ${results.length}건 / 실패 ${failed.length}건 · 쟁점 총 ${totalBlocks}개 · 비용 $${usd().toFixed(2)}`,
  );
  console.log(
    `쟁점당 법리 축 개수 분포: ${Object.entries(axisHist)
      .sort()
      .map(([k, v]) => `${k}축 ${v}개`)
      .join(" · ")}`,
  );
  console.log(`사실관계 채워진 건: ${results.filter((r) => r.factsChars > 0).length}`);
  for (const f of failed) console.log(`  실패 ${f.case} — ${f.reason}`);
  console.log(`백업: ${backupPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
