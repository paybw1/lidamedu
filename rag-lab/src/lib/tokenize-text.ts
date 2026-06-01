/**
 * 키워드(BM25) 검색용 한국어 친화 토크나이저.
 *
 * 단순화: 한글/영문/숫자 그룹만 추출, 소문자화. mecab-ko 같은 형태소 분석은 본 실험 과함.
 * 같은 룰을 색인·질의 양쪽에 적용하므로 단어 경계가 정확히 일치하지 않아도 매칭은 됨.
 */
const TOKEN_RE = /[가-힣]+|[a-zA-Z]+|\d+/g;

const STOPWORDS = new Set([
  '이', '그', '저', '것', '수', '등', '및', '또는', '경우', '대한', '있는', '있다', '없다',
  '하는', '한다', '하다', '되는', '된다', '되다', '의', '를', '을', '에', '에서', '에게', '으로',
  'a', 'an', 'the', 'is', 'are', 'be', 'of', 'to', 'in', 'on', 'and', 'or', 'for',
]);

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(TOKEN_RE) ?? [];
  return raw.filter((t) => !STOPWORDS.has(t) && t.length >= 1);
}
