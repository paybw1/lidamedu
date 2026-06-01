# AI Q&A 진행 상황 핸드오프 (2026-06-01 갱신)

## 한 줄 요약

**v9 원가 최적화 완료 — topk=8 채택 권장**. 합격선 전부 통과 + 안전성 100% + 회귀 0 + 월 22% 절감(예상 $3,751/월 = 연 $45k).

---

## 진행해 온 라운드 (전체)

| 라운드 | 핵심 작업 | 결과 |
|---|---|---|
| v4 | rag-lab 실험 → production 이식 + 비용 가드 | no_ev 100%, statute+case 4.62/5, b 0/5 (코퍼스 미적재) |
| v5 | textbook/practice 4732 청크 적재 + authority_tier | b 0→4.00/5 회복, 안전성 유지 |
| baseline-v6 | 5회 반복 변동성 측정 | st5/9/12 5회 모두 0점 회귀 발견 |
| v7-A | article body_json 평문화 (rag-lab v1 fix 이식) | st5/12 0→**5점** 완전 회복, statute 3.85→4.83 |
| v8-B1 | b6 회복 (practice_intent 검색 path 추가) | b6 0→**5점**, 비회귀 |
| **baseline-v8** | **최적화 직전 기준선** | statute 4.84 / case 4.83 / b 4.57 |
| v9-A | 프롬프트 캐싱 시도 | **회귀 — 비용 +20% 역효과, 폐기·롤백** |
| **v9-C** | **topk 12 → 8** | **✓ 채택. statute 4.84 / case 4.87 / b 4.79, 안전성 100%, -23%** |
| v9-D | Haiku (claude-haiku-4-5) + topk=8 | **✗ 채택 불가. statute 4.7067 < 4.71 합격선 미달(-0.003). 70% 절감 무효** |

---

## v9 최종 결과 (cap $15 중 $15.80 사용 — v9-A $9.58 + v9-C $6.23)

### 채택안: topk = 8

| 카테고리 | baseline-v8 | **v9-C (채택)** | 합격선 | 판정 |
|---|---:|---:|---:|---|
| statute | 4.84 | **4.84** | ≥4.71 | ✓ |
| case | 4.83 | **4.87** | ≥4.66 | ✓ |
| b 필수 | 4.57 | **4.79** | ≥4.34 | ✓ (오히려 향상) |
| 전체 | 4.78 | **4.84** | ≥4.61 | ✓ |
| no_ev+ref | 20/20 | **20/20** | 100% | ✓ |
| b6/st5/st12 | 5/5 | **5/5** | 비회귀 | ✓ |

### 비용

| 시나리오 | $/q | 월 (300k건) | v8 대비 |
|---|---:|---:|---:|
| baseline-v8 | $0.0533 | $15,990 | — |
| **v9-C 채택** | **$0.0408** | **$12,239** | **-$3,751 / 월 (연 -$45k)** |

### 안 채택 / 폐기
- **v9-A 캐싱**: production buildSystemPrompt가 가드레일+컨텍스트 단일 문자열 반환 → cache prefix invalidate. 가드레일 단독 토큰 1,025 < Sonnet 최소 prefix 2,048 → 구조적 불가능. **이번 라운드 폐기**. 코드 롤백 완료.

---

## 다음 할 일 (사용자 결정 / 후속 라운드)

### 즉시 (사용자 승인 시)
- **production topK 기본값 8로 변경** — `app/features/ai-qna/lib/hybrid-search.server.ts` 또는 호출부. 변경 파일 1개 수준.

### 후속 라운드 후보
1. **topk=6 추가 시도** — v9-C에서 b 카테고리가 오히려 좋아진 경향 → 6에서도 통과 가능성. 안전 마진 좁아질 위험은 측정 필요
2. ~~**v9-D Haiku 측정**~~ — **완료 (2026-06-01). statute 회귀로 채택 불가** (`docs/eval/cost-opt-v9-D.md`). 안전성 100% 유지, 회귀는 statute -0.003 만. 라우팅·topk=10 확장 등 후속 검토 가능
3. **모델 라우팅** — 짧은 질문/safety 는 Haiku, statute 복잡 질문은 Sonnet 분기. 잠재 절감 30-50%
4. **Haiku + topk=10** — 컨텍스트 확장으로 statute 정확도 보강 가능성. 비용 추정 $0.020/q (Sonnet+topk=8 $0.0408 대비 -50%)
5. **가드레일 분리 캐싱 재시도** — 가드레일 확장(도메인 예시·반례 추가)으로 2,048 토큰 돌파 + 별도 캐시 블록. 토큰 추가 부담 vs 캐시 절감 trade-off 추산 필요

---

## 변경 파일 (v9 전체)

| 파일 | 변경 |
|---|---|
| `app/features/ai-qna/lib/answer.server.ts` | cache_control 마킹 추가→제거, tokenUsage 필드 확장 (캐싱 제거 + cacheRead/Create 필드 향후 측정용 보존) |
| `scripts/cost-opt-v9.ts` | 안전성 먼저 측정 순서, 변형 토글 (--variant=A/B/C/D) |
| `scripts/measure-guardrail-tokens.ts` (신규) | 가드레일 토큰 측정 |
| `scripts/analyze-cost-opt-v9.ts` (신규) | JSONL 분석 + 합격선 판정 + 월환산 |
| `docs/eval/cost-opt-v9.md` (신규) | v9 종합 리포트 |
| `rag-lab/eval/reports/cost-opt-v9-A-*.jsonl` | v9-A raw |
| `rag-lab/eval/reports/cost-opt-v9-C-*.jsonl` | v9-C raw |

**DB 변경 0 · RLS 변경 0 · 코퍼스 변경 0**.

---

## 운영 default (현재)
- `AI_QNA_STAFF_ONLY=true`, `AI_QNA_DOMAIN_GATE=off`, **topk=12** (← v9-C 채택 시 8로 변경)
- 권위 가중치 0.7 (1차 tier=1.0, 2차 tier=0.7)

## 합격선 (baseline-v8 — 다음 라운드도 이 기준)
- statute ≥4.71, case ≥4.66, b ≥4.34, 전체 ≥4.61
- no_evidence/refusal 100%
- v9-C가 baseline-v8보다 같거나 좋지만 ERROR 누락(3건) 있어 합격선은 v8 그대로 유지
