// 시험정보(/lecture/exam-info) 콘텐츠 스키마·기본값 — 클라/서버 공용(비-server).
//   DB(exam_info.data JSONB) 에 저장되며, 행이 없으면 EXAM_INFO_DEFAULT 로 폴백.
//   운영자 편집 폼(admin-exam-info)·공개 렌더(exam-info)·저장 액션이 이 스키마를 공유.
//   콘텐츠 출처: source/변리사시험로드맵.html(2026 제63회 공고 반영) + 시행령 별표2.
import { z } from "zod";

// ── 스키마 ──
const rowSchema = z.object({ label: z.string(), value: z.string() });
const cardSchema = z.object({
  title: z.string(),
  kind: z.string(),
  rows: z.array(rowSchema),
});
const subjectSchema = z.object({ name: z.string(), desc: z.string() });
const engSchema = z.object({ name: z.string(), score: z.string() });
// 과목별 시험시간표 한 행.
const timeSchema = z.object({
  section: z.string(), // 구분(1차/2차)
  period: z.string(), // 교시
  subject: z.string(), // 과목
  entry: z.string(), // 입실완료
  time: z.string(), // 시험시간
  count: z.string(), // 문항수
});
// 연도별 통계 한 행.
const yearSchema = z.object({
  year: z.string(),
  applied: z.string(), // 1차 응시(대상)
  cut: z.string(), // 커트라인
  passed: z.string(), // 1차 합격
  rate: z.string(), // 응시율/합격률
  second: z.string(), // 2차 대상
  final: z.string(), // 최종 합격
  ratio: z.string(), // 최종 경쟁률
});
const faqSchema = z.object({ q: z.string(), a: z.string() });

export const examInfoSchema = z.object({
  intro: z.string(),
  schedule: z.array(cardSchema),
  scheduleNote: z.string(),
  firstSubjects: z.array(subjectSchema),
  firstCriteria: z.string(),
  secondRequired: z.string(),
  secondElective: z.string(),
  secondCriteria: z.string(),
  examTimes: z.array(timeSchema),
  examTimesNote: z.string(),
  english: z.array(engSchema),
  englishNote: z.string(),
  englishValidity: z.string(),
  englishTip: z.string(),
  yearlyStats: z.array(yearSchema),
  statNotes: z.array(z.string()),
  studyPrinciples: z.array(z.string()),
  subjectNotes: z.array(subjectSchema),
  studyFlow: z.string(),
  faq: z.array(faqSchema),
  source: z.string(),
});

export type ExamInfoData = z.infer<typeof examInfoSchema>;
export type ExamCard = z.infer<typeof cardSchema>;
export type ExamSubject = z.infer<typeof subjectSchema>;
export type ExamEng = z.infer<typeof engSchema>;
export type ExamTime = z.infer<typeof timeSchema>;
export type ExamYear = z.infer<typeof yearSchema>;
export type ExamFaq = z.infer<typeof faqSchema>;

// unknown(JSONB) → ExamInfoData. 검증 실패·빈 문서는 기본값으로 폴백.
export function parseExamInfo(raw: unknown): ExamInfoData {
  const r = examInfoSchema.safeParse(raw);
  return r.success ? r.data : EXAM_INFO_DEFAULT;
}

// ── 기본값(2026 제63회 기준, 변리사시험로드맵 반영) ──
export const EXAM_INFO_DEFAULT: ExamInfoData = {
  intro:
    "산업재산권 분야 유일의 국가전문자격. 1차(객관식)·2차(논술)로 치러지며, 아래는 2026년(제63회) 공고 기준입니다.",
  schedule: [
    {
      title: "제1차 시험",
      kind: "객관식 5지택일",
      rows: [
        { label: "원서접수", value: "2026. 1. 12.(월) 09:00 ~ 1. 16.(금) 18:00" },
        { label: "시험일", value: "2026. 2. 28.(토)" },
        { label: "합격자 발표", value: "2026. 3. 25.(수)" },
      ],
    },
    {
      title: "제2차 시험",
      kind: "주관식 논술",
      rows: [
        { label: "원서접수", value: "2026. 4. 20.(월) 09:00 ~ 4. 24.(금) 18:00" },
        { label: "시험일", value: "2026. 7. 31.(금) ~ 8. 1.(토)" },
        { label: "합격자 발표", value: "2026. 10. 28.(수)" },
      ],
    },
  ],
  scheduleNote: "※ 2차 일정은 예년 토·일에서 금·토 시행으로 변경되었습니다.",
  firstSubjects: [
    { name: "산업재산권법", desc: "특허법·실용신안법, 상표법, 디자인보호법" },
    { name: "민법개론", desc: "친족·상속 제외" },
    { name: "자연과학개론", desc: "물리·화학·생물·지구과학" },
    { name: "영어", desc: "공인 어학시험 성적으로 대체" },
  ],
  firstCriteria:
    "매 과목 40점 이상, 전 과목 평균 60점 이상 득점자 중 고득점자순으로 선발예정인원(600명, 동점자 포함) 결정",
  secondRequired: "특허법, 상표법, 민사소송법",
  secondElective: "19개 과목 중 1개 선택 (50점 이상 합격 · P/F)",
  secondCriteria:
    "필수과목 매 과목 40점 이상·평균 60점 이상, 선택과목 50점 이상. 필수과목 성적으로 고득점자순 선발",
  examTimes: [
    { section: "1차", period: "1교시", subject: "산업재산권법", entry: "09:00", time: "09:30~10:40 (70분)", count: "40" },
    { section: "1차", period: "2교시", subject: "민법개론", entry: "11:00", time: "11:10~12:20 (70분)", count: "40" },
    { section: "1차", period: "3교시", subject: "자연과학개론", entry: "13:20", time: "13:40~14:40 (60분)", count: "40" },
    { section: "2차", period: "1일 1교시", subject: "특허법", entry: "09:00", time: "09:30~11:30 (120분)", count: "4" },
    { section: "2차", period: "1일 2교시", subject: "상표법", entry: "12:50", time: "13:30~15:30 (120분)", count: "4" },
    { section: "2차", period: "2일 1교시", subject: "민사소송법", entry: "09:00", time: "09:30~11:30 (120분)", count: "4" },
    { section: "2차", period: "2일 2교시", subject: "선택과목", entry: "12:50", time: "13:30~15:30 (120분)", count: "4" },
  ],
  examTimesNote:
    "※ 신분증 미지참·전자·통신기기 반입 등 주요 유의사항은 응시 전 반드시 확인하세요.",
  english: [
    { name: "TOEIC", score: "775" },
    { name: "TEPS", score: "385" },
    { name: "G-TELP", score: "77 (Level-2)" },
    { name: "TOEFL (PBT)", score: "560" },
    { name: "TOEFL (iBT)", score: "83" },
    { name: "FLEX", score: "700" },
    { name: "IELTS", score: "5" },
  ],
  englishNote:
    "※ 유효 성적으로 인정되려면 정기시험 응시 · Q-Net 사전등록 · 진위확인 승인 요건을 모두 충족해야 합니다.",
  englishValidity:
    "2026년 1차 유효 성적: 2022. 4. 27. ~ 2026. 1. 16. 기간에 실시된 정기시험 성적. 유효기간 만료 전 Q-Net 등록·승인이 필요합니다.",
  englishTip:
    "영어는 법과목이 본격화되면 시간을 내기 어렵습니다. 가능한 한 이른 시점에 안정적으로 확보하는 것이 유리합니다.",
  yearlyStats: [
    { year: "2026", applied: "3,697 (4,236)", cut: "80.00", passed: "632", rate: "87.27% / 17.09%", second: "10/28 발표", final: "10/28 발표", ratio: "10/28 발표" },
    { year: "2025", applied: "3,541 (3,974)", cut: "79.16", passed: "661", rate: "89.10% / 18.66%", second: "1,204", final: "201", ratio: "5.99:1" },
    { year: "2024", applied: "3,071 (3,465)", cut: "76.66", passed: "607", rate: "88.62% / 19.76%", second: "1,219", final: "200", ratio: "5.77:1" },
    { year: "2023", applied: "3,312 (3,640)", cut: "70.83", passed: "614", rate: "90.98% / 18.54%", second: "1,184", final: "209", ratio: "5.66:1" },
  ],
  statNotes: [
    "1차는 상대평가 + 선발(600명)이므로 사실상 '총점 싸움'입니다.",
    "자연과학은 고득점보다 과락(40점 미만) 리스크 관리가 핵심입니다.",
    "과락은 한 과목만 미달해도 탈락 — 전 과목 균형이 중요합니다.",
    "기출로 출제 방향을 정리한 뒤, 하반기에는 신규 문항으로 대응력을 점검하세요.",
  ],
  studyPrinciples: [
    "과락 방지가 1순위입니다.",
    "법과목 고득점이 합격권 진입의 기반입니다.",
    "자연과학은 '고득점'보다 효율적 점수 확보 전략으로 접근합니다.",
  ],
  subjectNotes: [
    { name: "민법", desc: "방대하고 휘발성이 커 회독 설계가 관건" },
    { name: "특허·상표", desc: "2차까지 연계가 핵심" },
    { name: "디자인", desc: "2차 선택과목과 연계(전략 과목)" },
    { name: "자연과학", desc: "과락 가능성 유의, 난이도 부담이 큼" },
  ],
  studyFlow:
    "법과목은 [민법 → 특허 → 상표 → 디자인] 흐름으로 기본을 잡고 자연과학을 병행합니다. 진입 시기·자연과학 베이스·2차 병행 여부에 따라 개인별 커리큘럼 설계가 필요합니다.",
  faq: [
    {
      q: "대부분 어느 정도 기간을 준비하나요?",
      a: "개인차가 있지만 최종 합격생 기준 보통 3~4년 준비가 가장 많습니다. 1년 6개월 미만 단기 합격 사례도 매년 존재하지만 비율은 낮은 편입니다.",
    },
    {
      q: "영어 성적은 언제까지 확보하는 게 좋을까요?",
      a: "법과목이 본격화되면 시간을 내기 어려워 영어 성적을 확보하지 못해 1차를 치르지 못하는 경우가 계속 발생합니다. 초기에 우선순위를 높게 두고 준비하는 것이 안전합니다.",
    },
    {
      q: "온라인 강의로 시작해도 되나요?",
      a: "1차는 객관식이라 온라인 강의로도 충분히 준비할 수 있습니다. 다만 2차는 논술형이라 답안 작성·피드백·즉각적 질의응답이 중요해 현장 강의를 선호하는 경우가 많습니다.",
    },
    {
      q: "기출 위주로만 공부해도 될까요?",
      a: "기출은 반드시 반복할 핵심 자료지만, 같은 문제를 반복하면 '이미 본 문제'라 쉽게 풀려 실력 착시가 생깁니다. 기출로 방향을 정리한 뒤 하반기 신규 문항으로 실제 대응력을 점검하세요.",
    },
    {
      q: "이공계 전공이 아니어도 도전할 수 있나요?",
      a: "현재 제도에서 전공 차이가 결정적 변수는 아닙니다. 선택과목은 P/F로 최소 기준만 충족하면 되고, 자연과학도 고득점 경쟁이 아니라 필요한 점수를 효율적으로 확보하는 전략이라 충분히 보완 가능합니다.",
    },
  ],
  source:
    "본 정보는 지식재산처·한국산업인력공단 공고를 요약한 참고자료입니다. 정확한 일정·기준·점수는 반드시 큐넷(Q-Net) 및 지식재산처 공식 공고를 확인하시기 바랍니다.",
};
