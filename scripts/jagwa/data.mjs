// Single source of truth for the 2010 47회 1차 자연과학(A형) extraction.
// Consumed by crop-questions.mjs (cropping) and build-problems.mjs (problems.json).
// Verified by reading every rendered page + the answer key (crop+upscale).

export const EXAM = {
  year: 2010,
  examRoundNo: 47, // 회차
  examRound: "first", // 1차
  form: "A", // A형 (no DB column; recorded in storage path only)
  subjectLabel: "자연과학",
};

// Answer key — A형 자연과학개론 (from 3교시 정답표, crop+upscale verified).
// Array form supports 복수정답 (e.g. Q32 = 1·3 both accepted).
export const ANSWERS = {
  1: [1], 2: [4], 3: [1], 4: [5], 5: [3],
  6: [2], 7: [2], 8: [4], 9: [2], 10: [3],
  11: [2], 12: [4], 13: [3], 14: [4], 15: [5],
  16: [3], 17: [2], 18: [1], 19: [5], 20: [5],
  21: [5], 22: [2], 23: [3], 24: [1], 25: [3],
  26: [5], 27: [4], 28: [1], 29: [4], 30: [2],
  31: [4], 32: [1, 3], 33: [3], 34: [1], 35: [1],
  36: [5], 37: [2], 38: [3], 39: [5], 40: [2],
};

const physics = (n) => (n >= 1 && n <= 10);
const chemistry = (n) => (n >= 11 && n <= 20);
const biology = (n) => (n >= 21 && n <= 30);
const scienceSubjectOf = (n) =>
  physics(n) ? "physics" : chemistry(n) ? "chemistry" : biology(n) ? "biology" : "earth_science";

// mc_box = has a <보기> ㄱ/ㄴ/ㄷ statement box; otherwise mc_short.
const MC_BOX = new Set([12, 14, 15, 17, 18, 19, 20, 21, 23, 25, 29, 30, 31, 35, 36, 37, 38, 40]);
// 부정형("옳지 않은 것은") — best-effort, flagged for human verify (non-critical for image-first).
const NEGATIVE = new Set([13, 22, 27, 33, 34]);

// page -> [question numbers], in reading order. Sums to 40.
export const PAGE_QUESTIONS = {
  1: [1, 2], 2: [3], 3: [4, 5, 6], 4: [7, 8, 9, 10],
  5: [11, 12], 6: [13, 14], 7: [15, 16], 8: [17, 18],
  9: [19], 10: [20, 21, 22], 11: [23, 24, 25], 12: [26, 27, 28],
  13: [29, 30, 31], 14: [32, 33, 34, 35], 15: [36, 37, 38], 16: [39, 40],
};

// Cut Y positions (px at render scale 2.2) between consecutive questions on a page.
// Read off the ruler overlays (ruler.mjs) per page — reliable where auto gap-detection
// fails because choices are left-aligned at the same margin as the question number.
// p2 (Q3) and p9 (Q19) are single-question pages → no cuts.
export const OVERRIDE_CUTS = {
  1: [570],
  3: [960, 1290],
  4: [510, 855, 1255],
  5: [565],
  6: [820],
  7: [1130],
  8: [920],
  10: [915, 1370],
  11: [830, 1335],
  12: [670, 1055],
  13: [655, 1110],
  14: [450, 835, 1210],
  15: [695, 1195],
  16: [405],
};

export const QUESTIONS = Object.entries(PAGE_QUESTIONS).flatMap(([page, nums]) =>
  nums.map((n) => ({
    n,
    page: Number(page),
    scienceSubject: scienceSubjectOf(n),
    format: MC_BOX.has(n) ? "mc_box" : "mc_short",
    polarity: NEGATIVE.has(n) ? "negative" : "positive",
    answers: ANSWERS[n],
  })),
).sort((a, b) => a.n - b.n);

export const RENDER_DIR = "C:/project/lidamedu/scripts/jagwa/.render/q";
export const CROP_DIR = "C:/project/lidamedu/scripts/jagwa/.crops";
