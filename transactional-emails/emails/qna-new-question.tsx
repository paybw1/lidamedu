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
  title: string;
  targetLabel: string;
  questionMd: string;
  askerName: string;
}

export default function QnaNewQuestion({
  link,
  title,
  targetLabel,
  questionMd,
  askerName,
}: Props) {
  const excerpt =
    questionMd.length > 600 ? questionMd.slice(0, 600) + "…" : questionMd;
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>{`새 ${targetLabel} 질문: ${title}`}</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            <Heading className="pt-4 text-xl leading-tight font-semibold text-black">
              [{targetLabel}] {title}
            </Heading>
            <Text className="text-sm text-gray-600">
              {askerName} 님이 새 질문을 등록했습니다.
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
                className="rounded-md bg-[#635bff] px-5 py-3 text-[14px] font-semibold text-white"
              >
                답변하러 가기
              </Button>
            </Section>
            <Text className="mt-6 text-xs text-gray-500">
              먼저 답변 등록한 강사가 자동으로 답변자가 됩니다. 같은 질문에
              대한 알림은 이메일로 더 발송되지 않습니다.
            </Text>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

QnaNewQuestion.PreviewProps = {
  link: "http://localhost:5173/qna/00000000-0000-0000-0000-000000000000",
  title: "특허법 제29조 진보성 판단 기준 — 소위 사후적 고찰의 의미?",
  targetLabel: "조문",
  questionMd:
    "특허법 제29조 제2항에서 진보성을 판단할 때 \"용이하게 발명할 수 있다\"는 기준에 대해 사후적 고찰이 왜 금지되는지 구체적인 판례 흐름이 궁금합니다.",
  askerName: "홍길동",
} satisfies Props;
