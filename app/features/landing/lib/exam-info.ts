// 시험정보(/lecture/exam-info) 콘텐츠 스키마·기본값 — 클라/서버 공용(비-server).
//   DB(exam_info.data JSONB) 에 저장되며, 행이 없으면 EXAM_INFO_DEFAULT 로 폴백.
//   운영자 편집 폼(admin-exam-info)·공개 렌더(exam-info)·저장 액션이 이 스키마를 공유.
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
const statSchema = z.object({ value: z.string(), label: z.string() });

export const examInfoSchema = z.object({
  intro: z.string(),
  schedule: z.array(cardSchema),
  firstSubjects: z.array(subjectSchema),
  firstCriteria: z.string(),
  secondRequired: z.string(),
  secondElective: z.string(),
  secondCriteria: z.string(),
  english: z.array(engSchema),
  englishNote: z.string(),
  stats: z.array(statSchema),
  source: z.string(),
});

export type ExamInfoData = z.infer<typeof examInfoSchema>;
export type ExamCard = z.infer<typeof cardSchema>;
export type ExamSubject = z.infer<typeof subjectSchema>;
export type ExamEng = z.infer<typeof engSchema>;
export type ExamStat = z.infer<typeof statSchema>;

// unknown(JSONB) → ExamInfoData. 검증 실패·빈 문서는 기본값으로 폴백.
export function parseExamInfo(raw: unknown): ExamInfoData {
  const r = examInfoSchema.safeParse(raw);
  return r.success ? r.data : EXAM_INFO_DEFAULT;
}

// ── 기본값(2026년 기준 요약, 정적 버전과 동일) ──
export const EXAM_INFO_DEFAULT: ExamInfoData = {
  intro:
    "산업재산권 분야 유일의 국가전문자격. 1차(객관식)·2차(논술)로 치러지며, 아래는 2026년 시행 기준 요약입니다.",
  schedule: [
    {
      title: "제1차 시험",
      kind: "객관식 5지선다",
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
  firstSubjects: [
    { name: "산업재산권법", desc: "특허법·실용신안법, 상표법, 디자인보호법" },
    { name: "민법개론", desc: "친족·상속법 제외" },
    { name: "자연과학개론", desc: "물리·화학·생물·지구과학" },
    { name: "영어", desc: "공인 어학시험 성적으로 대체" },
  ],
  firstCriteria:
    "매 과목 40점 이상, 전 과목 평균 60점 이상 득점자 중 고득점자순으로 선발예정인원(600명, 동점자 포함) 결정",
  secondRequired: "특허법, 상표법, 민사소송법",
  secondElective: "19개 과목 중 1개 선택 (50점 이상 합격 · Pass)",
  secondCriteria:
    "필수과목 매 과목 40점 이상·평균 60점 이상, 선택과목 50점 이상. 필수과목 성적으로 고득점자순 선발",
  english: [
    { name: "TOEIC", score: "775" },
    { name: "TOEFL (PBT)", score: "560" },
    { name: "TOEFL (iBT)", score: "83" },
    { name: "TEPS", score: "385" },
    { name: "G-TELP", score: "77 (Level-2)" },
    { name: "FLEX", score: "700" },
    { name: "IELTS", score: "5" },
  ],
  englishNote:
    "※ 인정 성적: 2022. 4. 27. ~ 2026. 1. 16. 사이 응시하고 접수마감일까지 발표된 성적. 청각장애인 등 별도 기준은 공식 공고를 확인하세요.",
  stats: [
    { value: "3,541명", label: "2025년 제1차 응시" },
    { value: "661명", label: "2025년 제1차 합격" },
    { value: "5.99 : 1", label: "2025년 최종 경쟁률" },
  ],
  source:
    "본 정보는 특허청·한국산업인력공단 공고를 요약한 참고자료입니다. 정확한 일정·기준·점수는 반드시 큐넷(Q-Net) 및 특허청 공식 공고를 확인하시기 바랍니다.",
};
