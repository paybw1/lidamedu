// Tag-driven SSOT. Active year = process.env.JAGWA_TAG (default 2010_47_A).
// Loads years/<tag>.mjs (exam meta · answers · section topics · optional manual
// page/cut overrides) + .ocr/<tag>.json (OCR-detected page→questions + cuts).
// Manual overrides win over OCR. Subjects default to the 10/10/10/10 block.
import fs from "node:fs";
import path from "node:path";

export const TAG = process.env.JAGWA_TAG ?? "2010_47_A";
const HERE = import.meta.dirname;
const cfg = await import(`./years/${TAG}.mjs`);

export const EXAM = cfg.EXAM;
export const ANSWERS = cfg.ANSWERS;
const SECTION_BY_N = cfg.SECTION_BY_N ?? {};
export const EXPECT = cfg.EXPECT ?? 40;

const ocrPath = path.join(HERE, ".ocr", `${TAG}.json`);
const ocr = fs.existsSync(ocrPath) ? JSON.parse(fs.readFileSync(ocrPath, "utf8")) : null;
const numKeys = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [Number(k), v]));

export const PAGE_QUESTIONS =
  cfg.MANUAL_PAGE_QUESTIONS ?? (ocr ? numKeys(ocr.pageQuestions) : {});

// cuts: manual wins; else OCR. Replace any null cut (inferred, no y) with an evenly
// interpolated value within the page so the crop structure (len cuts = len q - 1) holds;
// the contact-sheet review flags wrong ones for a manual override.
function resolveCuts(raw) {
  const out = {};
  for (const [page, ns] of Object.entries(PAGE_QUESTIONS)) {
    const cuts = (raw?.[Number(page)] ?? raw?.[page] ?? []).slice();
    for (let i = 0; i < cuts.length; i++) {
      if (cuts[i] == null) {
        const prev = i > 0 ? cuts[i - 1] : 165;
        const next = cuts.slice(i + 1).find((c) => c != null) ?? 1700;
        cuts[i] = Math.round(prev + (next - prev) / 2);
      }
    }
    out[Number(page)] = cuts;
  }
  return out;
}
export const OVERRIDE_CUTS = cfg.MANUAL_CUTS
  ? cfg.MANUAL_CUTS
  : resolveCuts(ocr?.cuts ?? {});

const subjectOf = cfg.SUBJECT_BY_N
  ? (n) => cfg.SUBJECT_BY_N[n]
  : (n) => (n <= 10 ? "physics" : n <= 20 ? "chemistry" : n <= 30 ? "biology" : "earth_science");

export const QUESTIONS = Object.entries(PAGE_QUESTIONS)
  .flatMap(([page, nums]) =>
    nums.map((n) => ({
      n,
      page: Number(page),
      scienceSubject: subjectOf(n),
      format: "mc_short",
      polarity: "positive",
      section: SECTION_BY_N[n] ?? null,
      answers: ANSWERS[n],
    })),
  )
  .sort((a, b) => a.n - b.n);

export const RENDER_DIR = path.join(HERE, ".render", TAG);
export const CROP_DIR = path.join(HERE, ".crops", TAG);
