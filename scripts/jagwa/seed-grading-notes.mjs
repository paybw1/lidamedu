// feat-2-032 — 2차 실제 채점위원 채점평 적재 → problem_grading_notes.
//   소스 = source/2차 채점평(2010~2017)/{NN회(YYYY년)}/*.hwpx (원장 hwpx 변환본).
//   회차=폴더, 과목·책형(A/B)=파일명. A책형→문제 1·2, B책형→문제 3·4 (폼 단위 채점평을 두 문제에 부착).
//   멱등: 대상 문제의 기존 examiner 노트 삭제 후 삽입.
// 사용: node scripts/jagwa/seed-grading-notes.mjs [--apply]
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const ROOT = "source/2차 채점평(2010~2017)";
const url = process.env.SUPABASE_URL;
if (!url || !url.includes("mcgdoplo"))
  throw new Error(`SAFETY: ${url} not prod`);
const sb = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUBJECT = [
  { re: /특허/, law: "patent", name: "특허법" },
  { re: /상표/, law: "trademark", name: "상표법" },
  { re: /민소|민사소송/, law: "civil-procedure", name: "민사소송법" },
];

// 파일명/폴더 → 메타 추출.
function meta(folder, file) {
  const rm = folder.match(/^(\d+)회/);
  if (!rm) return null;
  const round = Number(rm[1]);
  const subj = SUBJECT.find((s) => s.re.test(file));
  if (!subj) return null;
  const fm = file.match(/법\s*([AB])/); // 특허법A / 송법 A / 소법A …
  if (!fm) return null;
  const form = fm[1];
  return { round, year: round + 1963, ...subj, form };
}

// hwpx → 정리된 마크다운 본문.
function extract(hwpxPath) {
  const dir = mkdtempSync(join(tmpdir(), "cj-"));
  const out = join(dir, "x.json");
  execFileSync("node", ["scripts/hwpx-to-text.mjs", hwpxPath, "-o", out], {
    stdio: "ignore",
  });
  const j = JSON.parse(readFileSync(out, "utf8"));
  const raw = (j.paragraphs || [])
    .map((p) =>
      (p.text || "")
        .replace(/\|\s*-{2,}\s*\|/g, " ")
        .replace(/\|/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((t) => t && !/^[\s|:\-]+$/.test(t));
  const lines = [];
  for (const t of raw) if (t !== lines[lines.length - 1]) lines.push(t);
  return lines.join("\n\n");
}

async function main() {
  // 파일 수집
  const files = [];
  for (const folder of readdirSync(ROOT)) {
    const fdir = join(ROOT, folder);
    let entries;
    try {
      entries = readdirSync(fdir);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!/\.(hwpx|hwtx)$/i.test(f)) continue; // hwtx=한글 서식파일(52회 특허B가 이 형식)
      const m = meta(folder, f);
      if (!m) {
        console.log(`  ⚠ 메타 파싱 실패: ${folder}/${f}`);
        continue;
      }
      files.push({ ...m, path: join(fdir, f), file: f });
    }
  }
  files.sort((a, b) => a.round - b.round || a.law.localeCompare(b.law) || a.form.localeCompare(b.form));

  // law_id 캐시
  const { data: laws } = await sb.from("laws").select("law_id, law_code");
  const lawId = Object.fromEntries((laws ?? []).map((l) => [l.law_code, l.law_id]));

  let notes = 0,
    matchedProblems = 0,
    missing = 0;
  for (const it of files) {
    const nums = it.form === "A" ? [1, 2] : [3, 4];
    const { data: probs } = await sb
      .from("problems")
      .select("problem_id, problem_number")
      .eq("law_id", lawId[it.law])
      .eq("exam_round", "second")
      .eq("format", "subjective")
      .eq("year", it.year)
      .in("problem_number", nums)
      .is("deleted_at", null);
    const targets = probs ?? [];
    const body = extract(it.path);
    console.log(
      `${it.round}회(${it.year}) ${it.name}${it.form} → 문제 ${targets.map((p) => "#" + p.problem_number).join(",") || "(없음)"} · ${body.length}자`,
    );
    if (targets.length === 0) {
      missing++;
      continue;
    }
    matchedProblems += targets.length;
    if (apply) {
      for (const p of targets) {
        await sb
          .from("problem_grading_notes")
          .delete()
          .eq("problem_id", p.problem_id)
          .eq("source", "examiner");
        const { error } = await sb.from("problem_grading_notes").insert({
          problem_id: p.problem_id,
          source: "examiner",
          author: "실제 채점위원",
          body_md: body,
          source_year: it.year,
          form: it.form,
        });
        if (error) throw error;
        notes++;
      }
    }
  }
  console.log(
    `\n파일 ${files.length}개 · 매칭 문제 ${matchedProblems} · 미매칭 파일 ${missing}`,
  );
  console.log(apply ? `적용: ${notes}개 채점평 노트 삽입` : "dry-run(미적용) — 확인 후 --apply");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
