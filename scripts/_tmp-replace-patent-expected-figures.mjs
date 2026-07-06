// 특허 예상문제 해설 도해 교체 — patent-expected-figure-mapping.json 기반.
//   dry-run(기본): 매핑 검증(URL 존재·loc 일치)만. --apply: JPG를 problem-explanations
//   버킷에 업로드(내용 해시 파일명=캐시 무효화) 후 해당 md의 oldUrl을 신규 URL로 치환.
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const SRC_DIR = "source/특허법 예상(1차)/2. 예상(50개)";
const BUCKET = "problem-explanations";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const mapping = JSON.parse(readFileSync("tmp/jagwa/patent-expected-figure-mapping.json", "utf8"))
  .filter((m) => m.problemId);

// 문항별 그룹 — 같은 문항 여러 이미지 치환을 한 번의 md 업데이트로.
const byProblem = new Map();
for (const m of mapping) {
  if (!byProblem.has(m.problemId)) byProblem.set(m.problemId, []);
  byProblem.get(m.problemId).push(m);
}

let checked = 0, applied = 0, failed = 0;
const backup = [];
for (const [problemId, items] of byProblem) {
  const { data: p, error } = await sb
    .from("problems")
    .select("problem_id, problem_number, body_md, explanation_md, problem_choices(choice_id, choice_index, explanation_md), problem_box_items(box_item_id, marker, explanation_md)")
    .eq("problem_id", problemId)
    .single();
  if (error) { console.log(`FAIL 조회 ${problemId}: ${error.message}`); failed++; continue; }

  for (const m of items) {
    let holder, table, idCol, idVal, field = "explanation_md";
    if (m.loc === "expl") {
      holder = p.explanation_md; table = "problems"; idCol = "problem_id"; idVal = problemId;
    } else if (m.loc === "body") {
      holder = p.body_md; table = "problems"; idCol = "problem_id"; idVal = problemId; field = "body_md";
    } else if (m.loc.startsWith("choice_expl:")) {
      const c = p.problem_choices.find((c) => c.choice_index === Number(m.loc.split(":")[1]));
      holder = c?.explanation_md; table = "problem_choices"; idCol = "choice_id"; idVal = c?.choice_id;
    } else if (m.loc.startsWith("box_expl:")) {
      const b = p.problem_box_items.find((b) => (b.marker ?? "") === m.loc.split(":")[1]);
      holder = b?.explanation_md; table = "problem_box_items"; idCol = "box_item_id"; idVal = b?.box_item_id;
    }
    if (!holder || !holder.includes(m.oldUrl)) {
      console.log(`MISS #${p.problem_number} ${m.file} — loc=${m.loc} 에 oldUrl 없음`);
      failed++;
      continue;
    }
    checked++;
    if (!APPLY) continue;

    const buf = readFileSync(`${SRC_DIR}/${m.file}`);
    const hash = createHash("md5").update(buf).digest("hex");
    const objectName = `${hash}.jpg`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(objectName, buf, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upErr) { console.log(`FAIL 업로드 ${m.file}: ${upErr.message}`); failed++; continue; }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(objectName);
    const newUrl = pub.publicUrl;

    const updated = holder.split(m.oldUrl).join(newUrl);
    const { error: e2 } = await sb.from(table).update({ [field]: updated }).eq(idCol, idVal);
    if (e2) { console.log(`FAIL 치환 #${p.problem_number}: ${e2.message}`); failed++; continue; }
    backup.push({ no: p.problem_number, problemId, loc: m.loc, file: m.file, oldUrl: m.oldUrl, newUrl });
    if (m.loc === "expl") p.explanation_md = updated;
    else if (m.loc === "body") p.body_md = updated;
    else if (table === "problem_choices") p.problem_choices.find((c) => c.choice_id === idVal).explanation_md = updated;
    else p.problem_box_items.find((b) => b.box_item_id === idVal).explanation_md = updated;
    applied++;
    console.log(`OK #${p.problem_number} ${m.loc} ← ${m.file}`);
  }
}
if (APPLY) writeFileSync("tmp/jagwa/patent-expected-figure-replace-backup.json", JSON.stringify(backup, null, 1));
console.log(`검증통과 ${checked} · 적용 ${applied} · 실패/누락 ${failed}${APPLY ? " · 백업 tmp/jagwa/patent-expected-figure-replace-backup.json" : " (dry-run)"}`);
