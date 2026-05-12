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
  reviewerName: string;
  problemLabel: string;
  score: number | null;
  commentMd: string | null;
}

export default function ReviewCompletedEmail({
  link,
  reviewerName,
  problemLabel,
  score,
  commentMd,
}: Props) {
  const trimmed = (commentMd ?? "").trim();
  const excerpt =
    trimmed.length > 600 ? trimmed.slice(0, 600) + "…" : trimmed;
  return (
    <Tailwind>
      <Html>
        <Head />
        <Body className="bg-white font-sans">
          <Preview>주관식 첨삭이 완료되었습니다</Preview>
          <Container className="mx-auto max-w-[560px] py-5 pb-12">
            <Heading className="pt-4 text-xl leading-tight font-semibold text-black">
              첨삭 완료
            </Heading>
            <Text className="text-sm text-gray-600">
              {reviewerName} 강사가 답안에 코멘트를 남겼습니다 · {problemLabel}
            </Text>
            {score !== null ? (
              <Text className="text-[15px] font-semibold text-black">
                강사 점수: {score}점
              </Text>
            ) : null}
            <Hr />
            <Section>
              <Text className="text-[15px] leading-relaxed whitespace-pre-line text-black">
                {excerpt || "(코멘트 없이 점수만 등록되었습니다)"}
              </Text>
            </Section>
            <Section className="mt-6">
              <Button
                href={link}
                className="rounded-md bg-[#2563eb] px-5 py-3 text-[14px] font-semibold text-white"
              >
                답안에서 확인
              </Button>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

ReviewCompletedEmail.PreviewProps = {
  link: "http://localhost:5173/subjects/patent/problems/00000000-0000-0000-0000-000000000000",
  reviewerName: "김강사",
  problemLabel: "2024년 2차 특허법 1번",
  score: 78,
  commentMd:
    "1. 의의 부분에서 ‘특허출원인 본인의 의사’ 요건을 명확히 짚어주면 더 좋겠습니다. 2. 사례 적용에서 다른 사람이 잘못 기재한 경우에 대한 구분이 빠졌습니다.",
} satisfies Props;
