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
  roundTitle: string;
  subjectName: string;
  assignedCount: number;
  deadline: string;
}

export default function GsPeerAssignmentEmail({
  link,
  roundTitle,
  subjectName,
  assignedCount,
  deadline,
}: Props) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>{`동료 채점 ${assignedCount}건 배정 — ${roundTitle}`}</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            <Heading className="pt-4 text-xl leading-tight font-semibold text-black">
              동료 채점 {assignedCount}건이 배정되었습니다
            </Heading>
            <Text className="text-sm text-gray-600">
              {subjectName} · {roundTitle}
            </Text>
            <Hr />
            <Section>
              <Text className="text-[14px] leading-relaxed text-black">
                다른 수험생이 작성한 답안을 채점할 작업이 배정되었습니다. 모범답안과
                본인의 학습 경험을 바탕으로 공정하게 채점해 주세요.
              </Text>
              <Text className="text-[13px] leading-relaxed text-gray-700">
                · 답안 작성자 정보는 노출되지 않습니다 (익명 채점)
                <br />· 점수와 피드백을 모두 입력하고 "채점 제출"을 눌러야 마무리됩니다
                <br />· 마감: {deadline}
              </Text>
            </Section>
            <Section className="mt-6">
              <Button
                href={link}
                className="rounded-md bg-[#2563eb] px-5 py-3 text-[14px] font-semibold text-white"
              >
                채점하러 가기
              </Button>
            </Section>
            <Text className="mt-6 text-xs text-gray-500">
              본인의 답안이 다른 수험생에게도 동일한 방식으로 익명 배정되었습니다.
              채점 결과는 운영자만 확인할 수 있습니다.
            </Text>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

GsPeerAssignmentEmail.PreviewProps = {
  link: "http://localhost:5173/gs",
  roundTitle: "2026 5월 GS 1회 (특허법)",
  subjectName: "특허법",
  assignedCount: 3,
  deadline: "2026-05-15 18:00",
} satisfies Props;
