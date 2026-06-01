# rag-lab — RAG 통합 실험

본 폴더는 **실험 격리 영역**이다. 본 플랫폼 코드(`../app/`, `../supabase/`, `../scripts/`)와 분리되어 있으며 production 빌드·배포에 영향이 없다.

## 목적
1. 본 플랫폼 DB(조문·판례·문제)를 **읽기 전용으로 정적 export** 하고
2. 추가 기본서·실무서(PDF/HWP)와 **단일 공통 청크 스키마**로 합쳐
3. 단일 하이브리드(벡터+BM25) 인덱스를 빌드하고
4. **출처 인용 + "근거 없으면 모름"** 가드레일로 답변 생성·평가한다.

## 설계 철학
- 검색된 근거 안에서만 답한다.
- 답변에는 반드시 출처를 표기한다 (`doc_type` 라벨 포함: `[법령] / [판례] / [문제] / [기본서] / [실무서]`).
- 근거가 없으면 **"자료에서 근거를 찾지 못했습니다"**.
- 출처 권위 차등: 1차 = 법령·판례 / 2차 = 기본서·실무서. 충돌 시 1차 우선, 상이 의견은 "조문상으로는 X / 기본서 해석으로는 Y" 형식으로 등급 구분 제시.

## 비-침습 보증 (Non-negotiable)
- 본 플랫폼 DB는 **SELECT 만**. INSERT/UPDATE/DELETE/`apply_migration` 호출 없음.
- `service_role` 키는 본 실험 코드에서 SELECT 만 사용. `.env` 는 커밋 금지 (`.env.example` 참조).
- 외부 API 호출(Voyage 임베딩, Anthropic 생성) 전 예상 비용 보고 → confirm 필요. 모든 CLI 는 `--dry-run` 지원.
- 본 플랫폼 코드(`../app/` 등) 를 import 하지 않는다. 로직 차용은 복제로만.

## 폴더 구조
```
rag-lab/
├── src/
│   ├── schema/chunk.ts        # ★ 공통 청크 타입 + Zod 검증 (단일 소유)
│   ├── lib/                   # embed / llm / tokenize / hybrid (단계 ④~⑤에서 추가)
│   └── cli/
│       ├── 1-export-db.ts     # DB → data/db_export/*.jsonl              (단계 ②)
│       ├── 2-chunk-added.ts   # data/added/** → data/chunks/added/*.jsonl (단계 ③)
│       ├── 3-build-index.ts   # 통합 → index/                              (단계 ④)
│       ├── 4-ask.ts           # CLI 질의 (interactive)                     (단계 ⑤)
│       └── 5-eval.ts          # eval 실행 + 리포트                          (단계 ⑤)
├── data/
│   ├── db_export/             # JSONL (gitignore)
│   ├── added/
│   │   ├── textbook/          # ← 사용자가 PDF/HWP 둠
│   │   └── practice/
│   └── chunks/                # 통합 직전 청크 (gitignore)
├── index/                     # 벡터+BM25 (gitignore)
└── eval/
    ├── questions.jsonl        # 신규 라벨링 필요
    └── reports/               # eval 결과 (gitignore)
```

## 진행 단계
| # | 명령 | 산출물 |
|---|---|---|
| ① | (완료) skeleton + 공통 스키마 | `src/schema/chunk.ts` |
| ② | `npm run export-db` | `data/db_export/{statute,case,problem}.jsonl` |
| ③ | `npm run chunk-added` | `data/chunks/added/*.jsonl` |
| ④ | `npm run build-index` | `index/{vectors,bm25,meta}.bin` |
| ⑤ | `npm run ask "<질문>"` / `npm run eval` | `eval/reports/*.md` |

## 셋업
```bash
cd rag-lab
cp .env.example .env   # 값 채우기
npm install
npm run typecheck      # 스키마/타입만 확인
```

## 책임 분담
- **본 실험은 production AI Q&A([[../docs/features/feat-9-ai-qna.md]]) 와 별개**다.
- 단, 임베딩 모델·차원·LLM 모델은 feat-9 §14 결정과 정렬(voyage-3-large/1024, claude-sonnet-4-6)하여 실험 결과가 그대로 production 설계에 반영될 수 있게 한다.

---

## 결과 (1회차, 2026-05-31)

**인덱스 규모**: 6,579 청크 / 1,024 dim · 27 MB
- DB (1차 tier): statute 544 / case 372 / problem 931 = **1,847**
- Added (2차 tier): textbook 2,546 / practice 2,186 = **4,732**

**비용**: Voyage 임베딩 5.45M 토큰(무료 한도 내, 실청구 $0) · 평가 1회 Claude ~$0.82

**eval 8문항 × 2 모드(A only vs A+B) 결과**:

| mode | 컨텍스트 키워드 적중 | 답변 키워드 적중 | "근거 못 찾음" 비율 | LLM judge 평균 |
|---|---:|---:|---:|---:|
| **A only** (DB 1차만) | 58.7% | 52.1% | 25.0% | 2.38/3 |
| **A + B** (통합) | 63.3% | 51.7% | 25.0% | **2.63/3** |

**결론**:
1. **기본서·실무서 추가가 답변 품질을 끌어올린다** — judge 평균 2.38 → 2.63 (+0.25). 특히 절차·실무 질문(q3 진보성 절차)에서 효과 명확 (judge 2→3).
2. **권위 차등이 작동** — A+B 모드에서도 1차(statute/case/problem)가 검색 결과 상위를 차지하며, 2차(textbook/practice)는 절차·해석 보강 역할.
3. **가드레일 정상** — 코퍼스에 없는 도메인(민법, q7)·자연과학(q8)에 대해 "근거를 찾지 못했습니다" / 답변 거절 정확히 발화. judge 모두 3/3.
4. **두 모드 모두 25% noEvidence** — 검색은 됐지만 답변에 활용할 만큼 정확하지 않다고 모델이 판단한 케이스(q6, q7). 보수적이지만 환각 방지엔 OK.

상세는 `eval/reports/*.md` 참조.
