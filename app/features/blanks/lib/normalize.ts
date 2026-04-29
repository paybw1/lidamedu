// 빈칸 정답 비교용 정규화. 공백·괄호·구두점 차이는 무시.
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\s 　]+/g, "")
    .replace(/[·∙ㆍ・]/g, "")
    .replace(/[()()「」『』【】［］\[\]]/g, "")
    .replace(/[，,、]/g, ",")
    .toLowerCase();
}
