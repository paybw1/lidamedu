// 빈칸 정답 비교용 정규화. 공백·괄호·구두점 차이는 무시.
// 법령·판례의 한자 병기 "공지(公知)" 는 괄호 안이 전부 한자일 때 선택 표기로 보고
// 통째로 제거 — 한자를 입력하지 않아도 정답 인정. (괄호 안에 한글이 섞이면 의미
// 구분일 수 있으므로 유지.)
const HANJA_PAREN_RE = /[((][\p{Script=Han}·∙ㆍ・,，、\s]+[))]/gu;

// 괄호 한자 병기 제거 — 빈칸 정답 비교 + 암송(recitation) 유사도 비교가 같은 정책 공유.
export function stripHanjaParen(s: string): string {
  return s.replace(HANJA_PAREN_RE, "");
}

export function normalizeAnswer(s: string): string {
  const base = s.normalize("NFC");
  const withoutHanja = stripHanjaParen(base);
  // 답 자체가 통째로 한자 병기뿐인 극단 케이스 방어 — 다 지워지면 원본으로 비교.
  const target = withoutHanja.trim() !== "" ? withoutHanja : base;
  return target
    .replace(/[\s 　]+/g, "")
    .replace(/[·∙ㆍ・]/g, "")
    .replace(/[()()「」『』【】［］\[\]]/g, "")
    .replace(/[，,、]/g, ",")
    .toLowerCase();
}
