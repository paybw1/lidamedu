// Per-year config: 2010 47회 1차 자연과학 A형. Consumed by data.mjs (tag=2010_47_A).
// PAGE_QUESTIONS + OVERRIDE_CUTS come from the OCR pass (.ocr/2010_47_A.json);
// this file holds the human-verified bits: exam meta, answer key, section topics.
export const EXAM = {
  year: 2010, examRoundNo: 47, examRound: "first", form: "A", subjectLabel: "자연과학",
  problemPdf: "source/기출모음(2010~2026)/1차/문제/2010_47_1_자과A.pdf",
  answerPdf: "source/기출모음(2010~2026)/1차/정답/2010_47_1_정답.pdf",
};

export const ANSWERS = {
  1: [1], 2: [4], 3: [1], 4: [5], 5: [3], 6: [2], 7: [2], 8: [4], 9: [2], 10: [3],
  11: [2], 12: [4], 13: [3], 14: [4], 15: [5], 16: [3], 17: [2], 18: [1], 19: [5], 20: [5],
  21: [5], 22: [2], 23: [3], 24: [1], 25: [3], 26: [5], 27: [4], 28: [1], 29: [4], 30: [2],
  31: [4], 32: [1, 3], 33: [3], 34: [1], 35: [1], 36: [5], 37: [2], 38: [3], 39: [5], 40: [2],
};

// problem_number -> science_sections.code (topic). Section codes:
//  phy.mech/thermo/em/wave/modern · chem.atom/gas/reaction/acidbase/thermo/organic
//  bio.cell/genetics/evolution/physiology/ecology · earth.geology/atmosphere/ocean/astro/envchange
export const SECTION_BY_N = {
  1: "phy.mech", 2: "phy.mech", 3: "phy.em", 4: "phy.em", 5: "phy.em",
  6: "phy.thermo", 7: "phy.wave", 8: "phy.modern", 9: "phy.modern", 10: "phy.modern",
  11: "chem.organic", 12: "chem.atom", 13: "chem.atom", 14: "chem.atom", 15: "chem.gas",
  16: "chem.gas", 17: "chem.acidbase", 18: "chem.atom", 19: "chem.reaction", 20: "chem.organic",
  21: "bio.cell", 22: "bio.cell", 23: "bio.genetics", 24: "bio.genetics", 25: "bio.physiology",
  26: "bio.genetics", 27: "bio.genetics", 28: "bio.genetics", 29: "bio.ecology", 30: "bio.genetics",
  31: "earth.geology", 32: "earth.geology", 33: "earth.geology", 34: "earth.geology", 35: "earth.geology",
  36: "earth.ocean", 37: "earth.atmosphere", 38: "earth.astro", 39: "earth.astro", 40: "earth.astro",
};

// override OCR page-assignment / cuts where the contact-sheet review found errors.
// (2010: OCR was hand-verified separately; manual cuts kept for reproducibility.)
export const MANUAL_PAGE_QUESTIONS = {
  1: [1, 2], 2: [3], 3: [4, 5, 6], 4: [7, 8, 9, 10], 5: [11, 12], 6: [13, 14], 7: [15, 16], 8: [17, 18],
  9: [19], 10: [20, 21, 22], 11: [23, 24, 25], 12: [26, 27, 28], 13: [29, 30, 31], 14: [32, 33, 34, 35], 15: [36, 37, 38], 16: [39, 40],
};
export const MANUAL_CUTS = {
  1: [570], 3: [960, 1290], 4: [510, 855, 1255], 5: [565], 6: [820], 7: [1130], 8: [920],
  10: [915, 1370], 11: [830, 1335], 12: [670, 1055], 13: [655, 1110], 14: [450, 835, 1210], 15: [695, 1195], 16: [405],
};
