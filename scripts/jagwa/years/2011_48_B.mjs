// Per-year config: 48회 자연과학 B형. NOTE: 문제 파일명은 2012_48 로 연도 오기 —
// 실제 48회 = 2011년 (정답 파일이 2011_48_1_정답.pdf). year=2011 로 적재.
// PAGE_QUESTIONS + cuts = OCR (.ocr/2011_48_B.json). ANSWERS/SECTION = 검수 후 채움.
export const EXAM = {
  year: 2011, examRoundNo: 48, examRound: "first", form: "B", subjectLabel: "자연과학",
  problemPdf: "source/기출모음(2010~2026)/1차/문제/2012_48_1_자과B.pdf",
  answerPdf: "source/기출모음(2010~2026)/1차/정답/2011_48_1_정답.pdf",
};

// 정답표(3교시 자연과학개론 B형) 판독 — clean text table, 복수정답 없음.
export const ANSWERS = {
  1: [5], 2: [5], 3: [3], 4: [4], 5: [4], 6: [3], 7: [2], 8: [1], 9: [3], 10: [2],
  11: [2], 12: [5], 13: [3], 14: [2], 15: [4], 16: [1], 17: [4], 18: [1], 19: [5], 20: [4],
  21: [4], 22: [2], 23: [5], 24: [4], 25: [2], 26: [5], 27: [3], 28: [3], 29: [1], 30: [2],
  31: [5], 32: [4], 33: [2], 34: [3], 35: [5], 36: [2], 37: [3], 38: [2], 39: [1], 40: [3],
};

// 단원(science_section) 매핑은 본문 내용 판독이 필요 — 배치 적재에선 보류(null).
// 적재 후 별도 content-read 패스에서 map-sections 로 채운다(2010 과 동일 방식).
export const SECTION_BY_N = {};
