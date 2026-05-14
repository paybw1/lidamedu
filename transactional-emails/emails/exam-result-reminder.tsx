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

interface Props {
  link: string;
  studentName: string;
  examYear: number;
  examRoundLabel: string; // "1차" or "2차"
}

export default function ExamResultReminder({
  link,
  studentName,
  examYear,
  examRoundLabel,
}: Props) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-gray-50 font-sans">
          <Preview>
            {`${studentName}님, ${examYear}년 ${examRoundLabel} 시험 결과를 입력해 주세요`}
          </Preview>
          <Container className="mx-auto max-w-[600px] bg-white py-6 pb-12">
            <Section className="px-8">
              <Text className="m-0 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                시험 결과 입력 요청
              </Text>
              <Heading className="mt-2 mb-0 text-2xl font-bold text-black">
                {studentName}님, {examYear}년 {examRoundLabel} 시험은 어땠나요?
              </Heading>
            </Section>

            <Hr className="mx-8" />

            <Section className="px-8">
              <Text className="m-0 text-sm text-gray-700 leading-relaxed">
                응시하신 시험 결과를 등록해 주세요. 짧은 입력으로 다음과 같은
                가치를 받으실 수 있습니다.
              </Text>
              <Text className="m-0 mt-2 text-sm text-gray-700">
                • <strong>합격 진단 점수</strong>가 더 정확해집니다 (휴리스틱 →
                실측 합격자 기반 모델)
              </Text>
              <Text className="m-0 mt-1 text-sm text-gray-700">
                • <strong>합격자 학습 패턴 비교</strong> 컨설팅 카드가 대시보드에
                활성화됩니다
              </Text>
              <Text className="m-0 mt-1 text-sm text-gray-700">
                • 다음 응시 권장 진도가 합격자 실측 데이터로 보정됩니다
              </Text>
            </Section>

            <Section className="px-8">
              <Text className="m-0 mt-3 text-sm text-gray-600">
                합격증/성적표 사진을 첨부하시면 데이터 신뢰도가 더 높아지며, 모든
                분석은 <strong>익명·집계</strong> 형태로만 활용됩니다.
              </Text>
            </Section>

            <Section className="mt-6 px-8 text-center">
              <Button
                href={link}
                className="rounded-md bg-[#16a34a] px-5 py-3 text-[14px] font-semibold text-white"
              >
                결과 입력 (1분 소요)
              </Button>
            </Section>

            <Hr className="mx-8" />
            <Section className="px-8">
              <Text className="m-0 text-xs text-gray-500">
                이 메일은 시험 결과가 미입력 상태일 때 자동 발송됩니다. 결과를
                입력하시면 더 이상 발송되지 않으며, 동일 시험 차수에 대해
                14일에 한 번만 안내드립니다.
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

ExamResultReminder.PreviewProps = {
  link: "http://localhost:5173/me/exam-results",
  studentName: "홍길동",
  examYear: 2026,
  examRoundLabel: "1차",
} satisfies Props;
