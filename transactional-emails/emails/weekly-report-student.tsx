import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface WeakItem {
  label: string;
  hint: string | null;
}

interface PendingAssignmentItem {
  title: string;
  dueAt: string;
  completedItems: number;
  totalItems: number;
}

interface Props {
  link: string;
  studentName: string;
  weekRangeLabel: string; // "2026-05-12 ~ 2026-05-18"
  // 이번 주 핵심 수치
  problemsAttempted: number;
  accuracyPct: number | null;
  articlesViewed: number;
  streakDays: number;
  // 전체 진척 (참고)
  overallArticlesPct: number;
  overallProblemsPct: number;
  // 약점 top 3
  weakAreas: WeakItem[];
  // 미완 과제 top 3
  pendingAssignments: PendingAssignmentItem[];
}

export default function WeeklyReportStudent({
  link,
  studentName,
  weekRangeLabel,
  problemsAttempted,
  accuracyPct,
  articlesViewed,
  streakDays,
  overallArticlesPct,
  overallProblemsPct,
  weakAreas,
  pendingAssignments,
}: Props) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Preview>
            {`${studentName}님의 주간 학습 리포트 — ${weekRangeLabel}`}
          </Preview>
          <Container className="mx-auto max-w-[600px] bg-white py-6 pb-12">
            <Section className="px-8">
              <Text className="m-0 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                주간 학습 리포트 · {weekRangeLabel}
              </Text>
              <Heading className="mt-2 mb-0 text-2xl font-bold text-black">
                {studentName}님, 이번 주 어떻게 보내셨나요?
              </Heading>
            </Section>

            <Hr className="mx-8" />

            <Section className="px-8">
              <Heading as="h2" className="mb-2 text-base font-semibold text-black">
                📊 이번 주 학습
              </Heading>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">문제 풀이</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {problemsAttempted}건
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">정답률</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {accuracyPct === null ? "—" : `${accuracyPct}%`}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">조문 열람</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {articlesViewed}건
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">연속 학습 일수</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {streakDays}일{streakDays >= 7 ? " 🔥" : ""}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section className="px-8">
              <Heading as="h2" className="mb-2 text-base font-semibold text-black">
                📈 전체 진척
              </Heading>
              <Text className="m-0 text-sm text-gray-700">
                조문 열람 <strong>{overallArticlesPct}%</strong> · 문제 풀이{" "}
                <strong>{overallProblemsPct}%</strong>
              </Text>
            </Section>

            {pendingAssignments.length > 0 ? (
              <Section className="px-8">
                <Heading as="h2" className="mb-2 text-base font-semibold text-black">
                  📌 다음 주 마감 과제 ({pendingAssignments.length})
                </Heading>
                {pendingAssignments.map((a, i) => (
                  <Text key={i} className="m-0 mt-1 text-sm text-gray-700">
                    • <strong>{a.title}</strong> — 마감 {a.dueAt.slice(0, 10)} · 진척{" "}
                    {a.completedItems}/{a.totalItems}
                  </Text>
                ))}
              </Section>
            ) : null}

            {weakAreas.length > 0 ? (
              <Section className="px-8">
                <Heading as="h2" className="mb-2 text-base font-semibold text-black">
                  🎯 다시 복습할 약점
                </Heading>
                {weakAreas.map((w, i) => (
                  <Text key={i} className="m-0 mt-1 text-sm text-gray-700">
                    • <strong>{w.label}</strong>
                    {w.hint ? (
                      <span className="text-gray-500"> — {w.hint}</span>
                    ) : null}
                  </Text>
                ))}
              </Section>
            ) : null}

            <Section className="mt-6 px-8 text-center">
              <Button
                href={link}
                className="rounded-md bg-[#16a34a] px-5 py-3 text-[14px] font-semibold text-white"
              >
                학습 계속하기
              </Button>
            </Section>

            <Hr className="mx-8" />
            <Section className="px-8">
              <Text className="m-0 text-xs text-gray-500">
                매주 월요일 자동 발송 · 메일 수신을 원치 않으시면 학원에
                문의해주세요.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

WeeklyReportStudent.PreviewProps = {
  link: "http://localhost:5173/dashboard",
  studentName: "홍길동",
  weekRangeLabel: "2026-05-05 ~ 2026-05-11",
  problemsAttempted: 87,
  accuracyPct: 73,
  articlesViewed: 12,
  streakDays: 5,
  overallArticlesPct: 54,
  overallProblemsPct: 31,
  weakAreas: [
    { label: "특허법 제29조 진보성", hint: "글로벌 정답률 42%" },
    { label: "특허법 제33조 발명자", hint: null },
  ],
  pendingAssignments: [
    {
      title: "[특허법 8주차] 발명/특허요건",
      dueAt: "2026-05-18T23:59",
      completedItems: 4,
      totalItems: 10,
    },
  ],
} satisfies Props;
