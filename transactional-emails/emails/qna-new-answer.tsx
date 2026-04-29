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
  answerMd: string;
  qualityGrade: "high" | "mid" | "low";
  answererName: string;
}

const GRADE_LABEL = { high: "상", mid: "중", low: "하" } as const;

export default function QnaNewAnswer({
  link,
  title,
  targetLabel,
  answerMd,
  qualityGrade,
  answererName,
}: Props) {
  const excerpt =
    answerMd.length > 600 ? answerMd.slice(0, 600) + "…" : answerMd;
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>{`${targetLabel} 질문에 답변이 도착했습니다`}</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            <Heading className="pt-4 text-xl leading-tight font-semibold text-black">
              [{targetLabel}] {title}
            </Heading>
            <Text className="text-sm text-gray-600">
              {answererName} 님이 답변을 등록했습니다 · 질문 수준 평가:{" "}
              <strong>{GRADE_LABEL[qualityGrade]}</strong>
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
                답변 전체 보기
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

QnaNewAnswer.PreviewProps = {
  link: "http://localhost:5173/qna/00000000-0000-0000-0000-000000000000",
  title: "특허법 제29조 진보성 판단 기준 — 소위 사후적 고찰의 의미?",
  targetLabel: "조문",
  answerMd:
    "사후적 고찰(hindsight) 금지는 발명 당시의 통상의 기술자 관점을 기준으로 진보성을 판단해야 한다는 원칙입니다. 대법원 2010후2865 등에서 자세히 설시하고 있습니다.",
  qualityGrade: "high",
  answererName: "김강사",
} satisfies Props;
