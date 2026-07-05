// 화면 안 "?" 도움 버튼의 화면 키 SSOT — 가이드(guide_articles.screen_key)와 화면을 잇는다.
// 새 화면에 도움 버튼을 달 때 여기에 키를 등록하고, 운영자 폼 datalist 에도 자동 노출된다.
export const GUIDE_SCREEN_KEYS: ReadonlyArray<{ key: string; label: string }> =
  [
    { key: "dashboard", label: "대시보드" },
    { key: "article-viewer", label: "조문 뷰어 (학습과목)" },
    { key: "problem-viewer", label: "문제 풀이 (학습과목)" },
    { key: "study-stats", label: "학습현황" },
    { key: "wrong-note", label: "오답노트" },
    { key: "study-srs", label: "복습" },
    { key: "mcq-exams", label: "1차 모의고사" },
    { key: "gs", label: "2차 모의고사 (온라인 GS)" },
    { key: "qna", label: "Q&A" },
  ];
