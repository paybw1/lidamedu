// feat-2-035 S3 — 판례 도식 배치 생성. 산출은 전부 draft(승인 큐) — 학생 비노출.
//
// ★AI 호출을 2번으로 나눈다. 설계 §2 소스 이원화를 코드에서도 지키기 위해서다.
//   ① 사실관계  ← 하급심 전문(로컬 캐시)만 입력
//   ② 쟁점~결론 ← 대법원 원문 + 판결요지만 입력
//   한 번에 넣으면 모델이 두 소스를 섞어 "대법원이 압축한 사실"을 사실관계로 쓰게 된다.
//
//   node scripts/case-diagram/draft-diagrams.mjs --year 2025            # dry-run(대상·비용 추정)
//   node scripts/case-diagram/draft-diagrams.mjs --year 2025 --apply
//   node scripts/case-diagram/draft-diagrams.mjs --case 2023후10712 --apply --force
//
// --force 없이는 이미 도식이 있는 판례를 건너뛴다(멱등). 승인된 도식은 --force 여도 건드리지 않는다.
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : null;
};
const APPLY = argv.includes("--apply");
const FORCE = argv.includes("--force");
const YEAR = argOf("--year");
const ONE_CASE = argOf("--case");
const LIMIT = argOf("--limit") ? Number(argOf("--limit")) : Infinity;
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
- markdown. 문단 또는 번호 목록.
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

async function draftFacts(kase, cache) {
  const prompt = [
    "# 사건",
    `- 대법원 사건번호: ${kase.case_number}`,
    `- 하급심: ${cache.sourceRef}`,
    "",
    "# 하급심 판결문",
    cache.text,
    "",
    "위 판결문에서 사실관계를 정리하세요. 법원의 판단·결론은 쓰지 마세요.",
  ].join("\n");
  const out = await callModel({
    system: FACTS_SYSTEM,
    prompt,
    maxTokens: 4000,
  });
  return out.trim();
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
  if (ONE_CASE) q = q.eq("case_number", ONE_CASE);
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
    .select("case_id, diagram_id, review_status, facts_md, blocks")
    .in("case_id", ids)
    .is("deleted_at", null);
  const byCase = new Map((existing ?? []).map((d) => [d.case_id, d]));

  const targets = [];
  const skipped = [];
  for (const c of cases) {
    const prev = byCase.get(c.case_id) ?? null;
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
    if (targets.length >= LIMIT) break;
  }

  console.log(
    `대상 ${targets.length}건 (사실관계 소스 있음 ${targets.filter((t) => t.cache).length}) · 건너뜀 ${skipped.length}`,
  );
  for (const s of skipped) console.log(`  skip ${s.case} — ${s.why}`);
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
      const factsMd = t.cache ? await draftFacts(t.kase, t.cache) : "";
      const blocks = await draftBlocks(t.kase);
      if (blocks.length === 0) throw new Error("쟁점 0개");

      const payload = {
        case_id: t.kase.case_id,
        facts_md: factsMd,
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
      results.push({ case: cn, blocks: blocks.length, factsChars: factsMd.length, axes });
      console.log(
        `[${i + 1}/${targets.length}] ${cn.padEnd(13)} 쟁점 ${blocks.length} · 축 ${axes.join("/")} · 사실관계 ${factsMd.length}자 · 누적 $${usd().toFixed(2)}`,
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
