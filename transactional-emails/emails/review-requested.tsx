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
  problemLabel: string;
  excerpt: string;
}

export default function ReviewRequestedEmail({
  link,
  studentName,
  problemLabel,
  excerpt,
}: Props) {
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>주관식 첨삭 요청 도착</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            <Heading className="pt-4 text-xl leading-tight font-semibold text-black">
              주관식 첨삭 요청
            </Heading>
            <Text className="text-sm text-gray-600">
              {studentName} 님이 첨삭을 요청했습니다 · {problemLabel}
            </Text>
            <Hr />
            <Section>
              <Text className="text-[15px] leading-relaxed whitespace-pre-line text-black">
                {excerpt}
              </Text>
            </Section>
            <Section className="mt-6">
              <Button
                href={link}
                className="rounded-md bg-[#2563eb] px-5 py-3 text-[14px] font-semibold text-white"
              >
                첨삭 큐 열기
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

ReviewRequestedEmail.PreviewProps = {
  link: "http://localhost:5173/admin/subjective-reviews",
  studentName: "김수험",
  problemLabel: "2024년 2차 특허법 1번",
  excerpt:
    "[발명자의 추가 및 정정] 1. 의의 — 특허출원서에 발명자를 잘못 기재하거나 누락한 경우, 특허법 제42조 제1항에 따라…",
} satisfies Props;
