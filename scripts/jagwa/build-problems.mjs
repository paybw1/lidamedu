// Build problems.json — the full insert plan for the 40 자연과학 questions.
// DRY-RUN: writes only a local JSON + summary. No DB / Storage writes.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { EXAM, QUESTIONS, CROP_DIR } from "./data.mjs";

const BUCKET = "problem-images";
const CIRCLED = ["①", "②", "③", "④", "⑤"];
const pad = (n) => String(n).padStart(2, "0");

const problems = [];
for (const q of QUESTIONS) {
  const cropFile = path.join(CROP_DIR, `q${pad(q.n)}.png`);
  if (!fs.existsSync(cropFile)) throw new Error(`missing crop ${cropFile}`);
  const dim = await sharp(cropFile).metadata();
  const storagePath = `past-exam/${EXAM.year}_${EXAM.examRoundNo}_${EXAM.form}/q${pad(q.n)}.png`;
  problems.push({
    n: q.n,
    // --- problems row ---
    problem_number: q.n,
    subject_type: "science",
    science_subject: q.scienceSubject,
    origin: "past_exam",
    exam_round: EXAM.examRound, // "first"
    exam_round_no: EXAM.examRoundNo, // 47
    year: EXAM.year, // 2010
    format: "mc_short", // image-first: every Q = image stem + 5 choices
    polarity: q.polarity, // best-effort, verify
    choice_count: 5,
    review_status: "approved",
    // --- image-first content ---
    hasBogiBox: q.format === "mc_box", // original was 보기형 (baked into image)
    cropFile: path.relative("C:/project/lidamedu", cropFile).replace(/\\/g, "/"),
    cropSize: `${dim.width}x${dim.height}`,
    storageBucket: BUCKET,
    storagePath,
    bodyMd: `![자과 ${EXAM.year}-${EXAM.examRoundNo} ${q.n}번](IMAGE_URL)`, // IMAGE_URL filled after upload
    // --- problem_choices rows ---
    choices: CIRCLED.map((mark, i) => ({
      choice_index: i + 1,
      body_md: mark,
      is_correct: q.answers.includes(i + 1),
    })),
    multiAnswer: q.answers.length > 1 ? q.answers : undefined,
  });
}

const out = {
  meta: {
    exam: EXAM,
    bucket: BUCKET,
    total: problems.length,
    bySubject: problems.reduce((a, p) => ((a[p.science_subject] = (a[p.science_subject] || 0) + 1), a), {}),
    boxCount: problems.filter((p) => p.hasBogiBox).length,
    multiAnswer: problems.filter((p) => p.multiAnswer).map((p) => p.n),
    note: "format forced to mc_short (image-first). hasBogiBox kept for reference. IMAGE_URL substituted after Storage upload.",
  },
  problems,
};
const jsonPath = path.join(path.dirname(CROP_DIR), "problems.json");
fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));

// summary table
console.log(`exam=${EXAM.year} ${EXAM.examRoundNo}회 1차 자연과학(${EXAM.form})  total=${out.meta.total}`);
console.log(`bySubject=${JSON.stringify(out.meta.bySubject)}  보기형=${out.meta.boxCount}  복수정답=${JSON.stringify(out.meta.multiAnswer)}`);
console.log("n  subject     ans  box size");
for (const p of problems) {
  console.log(
    `${pad(p.n)} ${p.science_subject.padEnd(12)} ${p.choices.filter((c) => c.is_correct).map((c) => c.choice_index).join(",")}    ${p.hasBogiBox ? "B" : " "}  ${p.cropSize}`,
  );
}
console.log(`\nwrote ${jsonPath}`);
