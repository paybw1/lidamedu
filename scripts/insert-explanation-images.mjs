// 답안 HWPX 안의 [IMG:imageN] 마커를 해당 문제의 종합해설(problems.explanation_md)에 그림으로 삽입.
//
// 매칭 흐름:
//  1) source/_converted/answer.json paragraphs 를 순회.
//  2) 각 [IMG:imageN] paragraph 에 대해 직전 1~3개 paragraph 를 fingerprint 로 사용.
//  3) source/_converted/matched-problems.json 안에서 fingerprint 로 problem 엔트리 찾기.
//  4) 그 problem 의 stem 으로 DB problems 행 조회 → explanation_md 끝부분에 image 삽입.
//
// 이미지 삽입 형태:
//   "...기존 해설...\n\n그림으로 표현하면 다음과 같다." 다음 줄에 ![](URL) (markdown 이미지).
//   같은 URL 이 이미 있으면 skip (멱등).
//
// 사용:
//   node scripts/insert-explanation-images.mjs              # dry-run
//   node scripts/insert-explanation-images.mjs --apply      # DB 업데이트

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const APPLY = process.argv.includes("--apply");

const answer = JSON.parse(
  readFileSync("source/_converted/answer.json", "utf8"),
);
const matched = JSON.parse(
  readFileSync("source/_converted/matched-problems.json", "utf8"),
);
const imgMap = JSON.parse(
  readFileSync("source/_converted/explanation-image-map.json", "utf8"),
);

const ps = answer.paragraphs;

// answer 순회 — [IMG:imageN] 와 그 앞쪽 substantive paragraph 들의 텍스트 (fingerprint).
// "해설" 단독, "NN ⓪" 정답 표시, 챕터 헤더는 noise — fingerprint 에서 제거.
// noise = paragraph 가 의미있는 컨텐츠가 없는 경우. "해설" 단독, "NN ⓪" 정답표시, 챕터 헤더만 제거.
// "해설①②사실관계..." 같이 본문이 이어지는 케이스는 substantive 로 인정.
const NOISE_FULL_RE = /^(?:해설|정답|리담)\s*$/;
const NOISE_PROB_RE = /^\d{1,2}\s+[①②③④⑤]+\s*$/;
const NOISE_CH_RE = /^제\s*\d+\s*[장절]\s*\S*\s*$/;
function isNoise(t) {
  if (!t) return true;
  const tt = t.trim();
  if (tt.length < 5) return true;
  return NOISE_FULL_RE.test(tt) || NOISE_PROB_RE.test(tt) || NOISE_CH_RE.test(tt);
}

const imageEvents = []; // { ref, pIndex, substantive[] }
// "사안의 사실관계를 그림으로 표현하면 다음과 같다" 같은 generic intro 는 매칭 helper 가 못 쓴다.
const GENERIC_RE = /^해설(?:[①-⑳]+)?\s*사안.*?그림.*?다음과\s*같다/;
for (let i = 0; i < ps.length; i++) {
  const t = ps[i].text || "";
  const m = t.match(/\[IMG:(image\d+)\]/);
  if (!m) continue;
  const ref = m[1];
  // 뒷쪽 (image 다음) substantive paragraph — 실제 분석/per-choice 텍스트 (가장 distinctive).
  const after = [];
  for (let j = i + 1; j < ps.length && j - i < 12; j++) {
    const tj = (ps[j].text || "").trim();
    if (/\[IMG:/.test(tj)) break; // 다음 이미지 도달.
    if (isNoise(tj)) continue;
    if (/^\d{1,2}\s+[①②③④⑤]/.test(tj)) break; // 다음 문제 도달.
    after.push(tj);
    if (after.length >= 5) break;
  }
  // 앞쪽 substantive — generic intro 는 마지막에 가져와도 안 쓰지만 fallback 으로 보존.
  const before = [];
  for (let j = i - 1; j >= 0 && i - j < 8; j--) {
    const tj = (ps[j].text || "").trim();
    if (/^\[IMG:/.test(tj)) continue;
    if (isNoise(tj)) continue;
    before.unshift(tj);
    if (before.length >= 3) break;
  }
  // distinctive 우선순위: after non-generic > before non-generic > before/after generic.
  const subs = [];
  for (const t of after) if (!GENERIC_RE.test(t)) subs.push(t);
  for (const t of before) if (!GENERIC_RE.test(t)) subs.push(t);
  // generic 도 fallback 으로 추가.
  for (const t of [...after, ...before]) if (!subs.includes(t)) subs.push(t);
  imageEvents.push({
    ref,
    pIndex: i,
    substantive: subs,
  });
}
console.log(`[IMG:*] paragraphs: ${imageEvents.length}`);

// fingerprint → matched problem 매칭.
// substantive paragraph 의 시작 40자(공백 제거) 가 matched explanation/perChoice 에 포함되면 match.
function findMatched(ev) {
  if (ev.substantive.length === 0) return null;
  // 모든 substantive 시도. 첫 매치 반환.
  for (const para of ev.substantive) {
    const probes = [];
    if (para.length > 60) {
      probes.push(para.slice(0, 60));
      probes.push(para.slice(-60));
    } else {
      probes.push(para);
    }
    for (const probe of probes) {
      const cleanProbe = probe.replace(/\s+/g, "").slice(0, 40);
      if (cleanProbe.length < 15) continue;
      for (const p of matched.problems) {
        const expRaw = p.explanation || "";
        const expClean = expRaw.replace(/\s+/g, "");
        if (expClean.includes(cleanProbe)) return p;
        for (const k of Object.keys(p.perChoice ?? {})) {
          const pcClean = (p.perChoice[k] || "").replace(/\s+/g, "");
          if (pcClean.includes(cleanProbe)) return p;
        }
      }
    }
  }
  return null;
}

// matched-problems 에 hit 한 stem → DB problem 매칭.
async function findDbProblemByStem(stem) {
  if (!stem) return null;
  const cands = await supa
    .from("problems")
    .select("problem_id, body_md, explanation_md")
    .ilike("body_md", `%${stem.slice(0, 80).replace(/[%_]/g, "\\$&")}%`)
    .is("deleted_at", null)
    .limit(5);
  if (cands.error) {
    console.error("DB 조회 실패:", cands.error.message);
    return null;
  }
  if (!cands.data || cands.data.length === 0) return null;
  const bestExact = cands.data.find((c) =>
    c.body_md?.replace(/\s+/g, "").startsWith(stem.replace(/\s+/g, "").slice(0, 60)),
  );
  return bestExact ?? cands.data[0];
}

// 자동 매칭이 일관되게 실패하는 케이스 manual override.
// (key = answer:imageN, value = problem_id) — 여기 추가하면 자동 매칭 결과보다 우선.
const MANUAL_OVERRIDE = {
  image8: "3b4f631f-9c7a-47ca-a6c1-9e81fa4e26ad", // 특허공보 제5호 6호 신규성
  image41: "ea09c569-89ed-49f7-9879-7e2ed309a0c8", // 전용실시권 미등록 통상실시권 (2004)
};

// matched-problems lookup 실패 시 fallback — substantive 텍스트로 DB body_md / explanation_md 직접 검색.
// 보수적 — false positive 방지 위해 probe 길이는 충분히 길게 유지.
async function findDbProblemByText(substantive) {
  for (const para of substantive) {
    if (/^해설사안.*?그림.*?다음과\s*같다/.test(para)) continue;
    const stripped = para.replace(/^[해설①-⑳\s]+/, "").trim();
    if (stripped.length < 30) continue;
    const probe = stripped.slice(0, 60).trim();
    const escaped = probe.replace(/[%_]/g, "\\$&");
    const { data } = await supa
      .from("problems")
      .select("problem_id, body_md, explanation_md")
      .or(`body_md.ilike.%${escaped}%,explanation_md.ilike.%${escaped}%`)
      .is("deleted_at", null)
      .limit(3);
    if (data && data.length > 0) return data[0];
  }
  return null;
}

// 같은 explanation_md 에 동일 URL 이 이미 있으면 skip (멱등). 아니면 끝에 append.
// 동일 문제에 여러 이미지가 들어갈 수 있어 location 추론 대신 단순 append 하고 운영자 보정에 맡김.
function insertImage(expMd, url) {
  if (!expMd) return `![](${url})`;
  if (expMd.includes(url)) return expMd;
  return expMd.replace(/\s*$/, "") + `\n\n![](${url})\n`;
}

let matched_ok = 0;
let unmatched = [];
let updated = 0;

for (const ev of imageEvents) {
  const url = imgMap[`answer:${ev.ref}`];
  if (!url) {
    unmatched.push({ ev, reason: "no url" });
    continue;
  }
  let db = null;
  if (MANUAL_OVERRIDE[ev.ref]) {
    const { data } = await supa
      .from("problems")
      .select("problem_id, body_md, explanation_md")
      .eq("problem_id", MANUAL_OVERRIDE[ev.ref])
      .is("deleted_at", null)
      .single();
    if (data) db = data;
  }
  let mp = null;
  if (!db) {
    mp = findMatched(ev);
    if (mp) db = await findDbProblemByStem(mp.stem);
    if (!db) db = await findDbProblemByText(ev.substantive);
  }
  if (!db) {
    const reason = mp ? `no DB problem (stem=${(mp.stem ?? "").slice(0, 40)})` : "no matched problem & no DB hit";
    unmatched.push({ ev, reason });
    continue;
  }
  matched_ok += 1;
  // 같은 문제에 여러 image 들어가는 경우 대비 — 직전 update 가 반영된 explanation_md 를 다시 읽음.
  let before;
  if (APPLY) {
    const { data: fresh } = await supa
      .from("problems")
      .select("explanation_md")
      .eq("problem_id", db.problem_id)
      .single();
    before = fresh?.explanation_md ?? "";
  } else {
    before = db.explanation_md ?? "";
  }
  const after = insertImage(before, url);
  const stemPreview = (db.body_md ?? "").slice(0, 50);
  console.log(
    `${ev.ref} → ${db.problem_id}  ${stemPreview}…  ${before === after ? "no-op (already)" : "insert"}`,
  );
  if (APPLY && before !== after) {
    const { error } = await supa
      .from("problems")
      .update({ explanation_md: after })
      .eq("problem_id", db.problem_id);
    if (error) {
      console.error(`  ✗ update 실패: ${error.message}`);
    } else {
      updated += 1;
    }
  }
}

console.log("---");
console.log(`매칭 성공: ${matched_ok} / ${imageEvents.length}`);
console.log(`unmatched: ${unmatched.length}`);
for (const u of unmatched.slice(0, 20)) {
  const sub = u.ev.substantive?.[u.ev.substantive.length - 1] || "";
  console.log(
    `  ${u.ev.ref} (${u.reason}) — substantive: ${sub.slice(0, 80)}…`,
  );
}
if (APPLY) console.log(`업데이트 완료: ${updated} 건`);
else console.log("dry-run — 적용하려면 --apply");
