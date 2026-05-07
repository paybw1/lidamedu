// 마이그레이션(`move-choice-tables-to-explanation.mjs`) 으로 종합 해설에 추가된 표가
// 실제로 그 문제와 매칭되는지 점검.
//
// 동작:
// - explanation_md 에 우리가 추가한 헤더 (`**지문 X 관련**` 또는 `**박스 X 관련**`) 가 있는 problem 만 대상.
// - 각 problem 에 대해 본문/조문/연도와 함께 추가된 각 표 섹션의 첫 행(헤더)·인접 키워드를 출력.
// - 휴리스틱 의심 신호:
//   * 문제 본문에 특정 조문(法 128 등) 이 나오는데 표 헤더에 다른 조문이 등장
//   * 표 텍스트 안에 "다른 문제 번호" 처럼 보이는 NN. 표시
//   * 표가 본문/지문에서 전혀 언급되지 않은 주제 (heuristic 으로 판단 어려움 — 사람 눈 검토용 자료 제공)
//
// 출력:
// - stdout: 사람 읽기용 보고서
// - source/_converted/audit-moved-tables.json: 기계 처리용 raw 데이터

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// 추가된 섹션 패턴: "**지문 X 관련**" 또는 "**박스 X 관련**"
const SECTION_RE = /\*\*((지문|박스)[^*]+)관련\*\*\n+([\s\S]*?)(?=\n\*\*(지문|박스)[^*]+관련\*\*|$)/g;

// 본문·표에서 "法 NNN" / "제NNN조" 형태의 조문 번호를 모두 추출.
function extractArticleMentions(text) {
  if (!text) return [];
  const mentions = new Set();
  // "法 128" 같은 한자 표기.
  for (const m of text.matchAll(/法\s*(\d{1,3}(?:의\d+)?)/g)) mentions.add(m[1]);
  // "제128조" / "제 128 조" 한국어 표기.
  for (const m of text.matchAll(/제\s*(\d{1,3}(?:의\d+)?)\s*조/g)) mentions.add(m[1]);
  return Array.from(mentions);
}

// 표 블록 첫 행(헤더) 만 가독성 있게 추출.
function tableHeader(tableMd) {
  const firstNl = tableMd.indexOf("\n");
  return firstNl < 0 ? tableMd : tableMd.slice(0, firstNl);
}

(async () => {
  // explanation_md 에 마이그레이션 헤더 패턴이 있는 problems 만 조회.
  const { data: problems, error } = await sb
    .from("problems")
    .select(
      "problem_id, problem_number, year, exam_round_no, body_md, explanation_md, primary_article_id, articles!primary_article_id(article_number)",
    )
    .is("deleted_at", null)
    .like("explanation_md", "%관련**%");
  if (error) {
    console.error(error);
    process.exit(1);
  }

  // 같은 라이브러리 정보 일괄 fetch — choices/box_items 의 잔여 explanation 비교용.
  const ids = problems.map((p) => p.problem_id);
  const choicesById = new Map();
  const boxesById = new Map();
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const [{ data: cs }, { data: bs }] = await Promise.all([
      sb
        .from("problem_choices")
        .select("problem_id, choice_index, body_md, explanation_md")
        .in("problem_id", slice),
      sb
        .from("problem_box_items")
        .select("problem_id, marker, position_index, body_md, explanation_md")
        .in("problem_id", slice),
    ]);
    for (const c of cs ?? []) {
      const arr = choicesById.get(c.problem_id) ?? [];
      arr.push(c);
      choicesById.set(c.problem_id, arr);
    }
    for (const b of bs ?? []) {
      const arr = boxesById.get(b.problem_id) ?? [];
      arr.push(b);
      boxesById.set(b.problem_id, arr);
    }
  }
  for (const arr of choicesById.values()) arr.sort((a, b) => a.choice_index - b.choice_index);
  for (const arr of boxesById.values()) arr.sort((a, b) => a.position_index - b.position_index);

  const lines = [];
  const audits = [];

  // 연도/회차/문제번호 순 정렬.
  problems.sort((a, b) => {
    const ay = a.year ?? 0, by = b.year ?? 0;
    if (ay !== by) return ay - by;
    const ar = a.exam_round_no ?? 0, br = b.exam_round_no ?? 0;
    if (ar !== br) return ar - br;
    return (a.problem_number ?? 0) - (b.problem_number ?? 0);
  });

  lines.push(`총 ${problems.length}개 문제 점검\n`);
  lines.push("=".repeat(80));

  for (const p of problems) {
    const articleNum = p.articles?.article_number ?? null;
    const bodyArticles = extractArticleMentions(p.body_md ?? "");
    const choices = choicesById.get(p.problem_id) ?? [];
    const boxes = boxesById.get(p.problem_id) ?? [];

    // 추가된 섹션들 추출.
    const sections = [];
    const expl = p.explanation_md ?? "";
    for (const m of expl.matchAll(SECTION_RE)) {
      const heading = m[1].trim(); // e.g. "지문 ② "
      const block = m[3].trim();
      sections.push({ heading, block });
    }
    if (sections.length === 0) continue;

    // 각 섹션 표에서 조문 mention 추출.
    const sectionArticles = sections.map((s) => extractArticleMentions(s.block));
    const allTableArticles = Array.from(new Set(sectionArticles.flat()));

    // 의심 신호:
    // 1) 본문 / primary_article 둘 다 있고, 표에 등장한 조문 중 어느 하나도 본문·primary 와 겹치지 않음.
    const bodyOrPrimary = new Set([...(articleNum ? [articleNum] : []), ...bodyArticles]);
    const hasOverlap =
      allTableArticles.length === 0 ||
      bodyOrPrimary.size === 0 ||
      allTableArticles.some((a) => bodyOrPrimary.has(a));
    const suspect = !hasOverlap;

    const head = `[${suspect ? "⚠" : " "}] ${p.year ?? "?"}-${p.exam_round_no ?? "?"} #${p.problem_number ?? "?"} · 조문 ${articleNum ?? "—"} · ${p.problem_id}`;
    lines.push(head);

    const bodyPreview = (p.body_md ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
    lines.push(`  본문: ${bodyPreview}${(p.body_md ?? "").length > 140 ? "…" : ""}`);
    if (bodyArticles.length > 0) lines.push(`  본문 조문 mention: ${bodyArticles.join(", ")}`);

    for (let i = 0; i < sections.length; i++) {
      const s = sections[i];
      const arts = sectionArticles[i];
      lines.push(`  • ${s.heading.trim()}`);
      lines.push(`      표 헤더: ${tableHeader(s.block).slice(0, 120)}`);
      if (arts.length > 0) lines.push(`      표 조문: ${arts.join(", ")}`);

      // 해당 choice/box 잔여 explanation 도 함께 출력 — 표 외 텍스트가 어떤 주제였는지 확인용.
      const m = s.heading.match(/^지문\s*(.)/);
      if (m) {
        const idxLabel = m[1];
        const map = { "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5, "⑥": 6 };
        const idx = map[idxLabel];
        const c = idx ? choices.find((c) => c.choice_index === idx) : null;
        if (c) {
          lines.push(`      지문 본문: ${(c.body_md ?? "").replace(/\s+/g, " ").trim().slice(0, 120)}`);
          if (c.explanation_md) {
            lines.push(`      지문 잔여해설: ${c.explanation_md.replace(/\s+/g, " ").trim().slice(0, 120)}`);
          }
        }
      } else {
        const m2 = s.heading.match(/^박스\s*(.)/);
        if (m2) {
          const marker = m2[1];
          const b = boxes.find((b) => b.marker === marker);
          if (b) {
            lines.push(`      박스 본문: ${(b.body_md ?? "").replace(/\s+/g, " ").trim().slice(0, 120)}`);
            if (b.explanation_md) {
              lines.push(`      박스 잔여해설: ${b.explanation_md.replace(/\s+/g, " ").trim().slice(0, 120)}`);
            }
          }
        }
      }
    }
    lines.push("");

    audits.push({
      problemId: p.problem_id,
      year: p.year,
      round: p.exam_round_no,
      problemNumber: p.problem_number,
      primaryArticleNumber: articleNum,
      bodyArticles,
      sections: sections.map((s, i) => ({
        heading: s.heading.trim(),
        tableHeader: tableHeader(s.block),
        articles: sectionArticles[i],
      })),
      suspect,
    });
  }

  const suspects = audits.filter((a) => a.suspect);
  lines.push("=".repeat(80));
  lines.push(`의심 (⚠) ${suspects.length}건 / 전체 ${audits.length}건`);
  for (const a of suspects) {
    lines.push(
      `  ⚠ ${a.year}-${a.round} #${a.problemNumber} 조문${a.primaryArticleNumber ?? "—"} : 본문조문[${a.bodyArticles.join(",")}] vs 표조문[${a.sections.flatMap((s) => s.articles).join(",")}]`,
    );
  }

  const out = lines.join("\n");
  console.log(out);

  const outPath = "source/_converted/audit-moved-tables.json";
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(audits, null, 2), "utf8");
  console.log(`\n[json] ${outPath}`);
})().catch((e) => {
  console.error("[fatal]", e?.message ?? e);
  process.exit(1);
});
