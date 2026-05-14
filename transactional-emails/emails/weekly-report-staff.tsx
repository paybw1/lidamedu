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

interface InactiveStudent {
  name: string;
  inactiveDays: number;
}

interface AssignmentSummary {
  title: string;
  dueAt: string;
  completed: number;
  total: number;
}

interface Props {
  link: string; // /admin/cohorts/:id/progress
  staffName: string;
  cohortName: string;
  weekRangeLabel: string;
  memberCount: number;
  active7dCount: number;
  avgAccuracyPct: number | null;
  avgProblemsAttempted: number;
  avgArticlesViewed: number;
  inactiveStudents: InactiveStudent[];
  assignments: AssignmentSummary[];
}

export default function WeeklyReportStaff({
  link,
  staffName,
  cohortName,
  weekRangeLabel,
  memberCount,
  active7dCount,
  avgAccuracyPct,
  avgProblemsAttempted,
  avgArticlesViewed,
  inactiveStudents,
  assignments,
}: Props) {
  const activeRatio =
    memberCount > 0 ? Math.round((active7dCount / memberCount) * 100) : 0;
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Preview>
            {`[${cohortName}] 주간 운영 리포트 · ${weekRangeLabel}`}
          </Preview>
          <Container className="mx-auto max-w-[600px] bg-white py-6 pb-12">
            <Section className="px-8">
              <Text className="m-0 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                주간 운영 리포트 · {weekRangeLabel}
              </Text>
              <Heading className="mt-2 mb-0 text-2xl font-bold text-black">
                {staffName} 선생님, {cohortName}
              </Heading>
              <Text className="m-0 mt-1 text-sm text-gray-600">
                반 멤버 {memberCount}명 · 최근 7일 활동 {active7dCount}명 (
                {activeRatio}%)
              </Text>
            </Section>

            <Hr className="mx-8" />

            <Section className="px-8">
              <Heading as="h2" className="mb-2 text-base font-semibold text-black">
                📊 반 평균
              </Heading>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className="py-1 text-gray-600">평균 정답률</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {avgAccuracyPct === null ? "—" : `${avgAccuracyPct}%`}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">평균 시도 문제</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {avgProblemsAttempted}건
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 text-gray-600">평균 조문 열람</td>
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {avgArticlesViewed}건
                    </td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {inactiveStudents.length > 0 ? (
              <Section className="px-8">
                <Heading as="h2" className="mb-2 text-base font-semibold text-rose-700">
                  ⚠️ 비활성 학생 ({inactiveStudents.length})
                </Heading>
                {inactiveStudents.map((s, i) => (
                  <Text key={i} className="m-0 mt-1 text-sm text-gray-700">
                    • <strong>{s.name}</strong> — {s.inactiveDays}일째 미접속
                  </Text>
                ))}
              </Section>
            ) : null}

            {assignments.length > 0 ? (
              <Section className="px-8">
                <Heading as="h2" className="mb-2 text-base font-semibold text-black">
                  📌 이번 주 과제 현황
                </Heading>
                {assignments.map((a, i) => {
                  const pct =
                    a.total > 0 ? Math.round((a.completed / a.total) * 100) : 0;
                  return (
                    <Text key={i} className="m-0 mt-1 text-sm text-gray-700">
                      • <strong>{a.title}</strong> — 마감 {a.dueAt.slice(0, 10)} · 완수{" "}
                      {a.completed}/{a.total} ({pct}%)
                    </Text>
                  );
                })}
              </Section>
            ) : null}

            <Section className="mt-6 px-8 text-center">
              <Button
                href={link}
                className="rounded-md bg-[#2563eb] px-5 py-3 text-[14px] font-semibold text-white"
              >
                반 진도 상세 보기
              </Button>
            </Section>

            <Hr className="mx-8" />
            <Section className="px-8">
              <Text className="m-0 text-xs text-gray-500">
                매주 월요일 자동 발송. 상세 통계는 /admin/cohorts/:id/stats 에서.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

WeeklyReportStaff.PreviewProps = {
  link: "http://localhost:5173/admin/cohorts/abc/progress",
  staffName: "김강사",
  cohortName: "27기 종합반",
  weekRangeLabel: "2026-05-05 ~ 2026-05-11",
  memberCount: 30,
  active7dCount: 26,
  avgAccuracyPct: 62.4,
  avgProblemsAttempted: 142.3,
  avgArticlesViewed: 84.5,
  inactiveStudents: [
    { name: "이학생", inactiveDays: 8 },
    { name: "박학생", inactiveDays: 12 },
  ],
  assignments: [
    {
      title: "[특허법] W3 발명/특허요건",
      dueAt: "2026-05-12T23:59",
      completed: 22,
      total: 30,
    },
  ],
} satisfies Props;
