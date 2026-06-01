/**
 * article_revisions.body_json → 평문 직렬화.
 *
 * 본 DB 의 `article_revisions.body_text` 컬럼은 body_json 의 raw JSON 캐스트 문자열을
 * 담고 있어 평문 캐시가 아니다 → 본 모듈에서 body_json 을 항상 평문화한다.
 *
 * 알 수 없는 block.kind / inline.type 은 안전 fallback 으로 처리:
 *  - inline 은 text 필드만 join
 *  - block 은 children + inline 재귀
 * docs/article-tree.md §3 의 토큰 셋을 시작점으로 두되, 신규 토큰 추가 시 깨지지 않는다.
 */

type InlineRecord = Record<string, unknown>;
type BlockRecord = Record<string, unknown>;

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function renderInline(parts: unknown[] | undefined): string {
  if (!parts) return '';
  return parts
    .map((raw) => {
      if (typeof raw === 'string') return raw;
      if (!raw || typeof raw !== 'object') return '';
      const p = raw as InlineRecord;
      const type = asString(p.type);
      switch (type) {
        case 'text':           return asString(p.text);
        case 'ref_article':    return asString(p.raw);
        case 'ref_law':        return asString(p.raw);
        case 'amendment_note': return ` ${asString(p.text)}`;
        case 'title_marker':   return asString(p.text);
        case 'footnote':       return ` [주${(p.n as number) ?? ''}: ${asString(p.body_md)}]`;
        default: {
          // 안전 fallback — raw/text/label 중 있는 것을 평문으로
          return asString(p.text) || asString(p.raw) || asString(p.label) || '';
        }
      }
    })
    .join('');
}

function renderBlock(raw: unknown, depth: number): string {
  if (!raw || typeof raw !== 'object') return '';
  const b = raw as BlockRecord;
  const pad = '  '.repeat(depth);
  const kind = asString(b.kind);
  const label = asString(b.label);
  const inlineText = renderInline(asArray(b.inline)).trim();
  const children = asArray(b.children);

  switch (kind) {
    case 'para':
      return pad + inlineText;
    case 'clause':
    case 'item':
    case 'sub': {
      const head = `${pad}${label}`.trimEnd();
      const lines: string[] = [];
      if (head || inlineText) lines.push(inlineText ? `${head} ${inlineText}`.trim() : head);
      for (const c of children) {
        const rendered = renderBlock(c, depth + 1);
        if (rendered) lines.push(rendered);
      }
      return lines.join('\n');
    }
    case 'title_marker':
      return `${pad}${asString(b.text)}`;
    case 'header_refs': {
      // 관련조문 chip → "〔관련: 法 132, 法 89〕" 한 줄로 평문화
      const refs = asArray(b.refs)
        .map((r) => {
          if (!r || typeof r !== 'object') return '';
          return asString((r as InlineRecord).raw);
        })
        .filter(Boolean);
      return refs.length ? `${pad}〔관련: ${refs.join(', ')}〕` : '';
    }
    default: {
      // unknown block — inline + children 만이라도 보존
      const lines: string[] = [];
      if (inlineText) lines.push(`${pad}${inlineText}`);
      for (const c of children) {
        const rendered = renderBlock(c, depth + 1);
        if (rendered) lines.push(rendered);
      }
      return lines.join('\n');
    }
  }
}

export function serializeBodyJson(bodyJson: unknown): string {
  // body_json 이 문자열로 들어온 경우(잘못 저장됐을 수도) 1회 parse 시도
  let body: unknown = bodyJson;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return ''; }
  }
  if (!body || typeof body !== 'object') return '';
  const blocks = asArray((body as { blocks?: unknown }).blocks);
  return blocks
    .map((b) => renderBlock(b, 0))
    .filter(Boolean)
    .join('\n')
    .trim();
}
