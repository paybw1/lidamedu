# feat-2-030 — 조문 빈칸 난이도 계층 (하·중·상 게이트 + 게임화)

## 배경 / 목적
조문 빈칸 채우기(feat-4-A-130, V2 `BlankFillViewV2`)가 수험생에게 인기. 단일 난이도라
"조금씩 어렵게" 오르는 성취 곡선·완결성·몰입이 없다. → **마스킹 밀도 3단계**(하/중/상)로
나누고 **아래 단계 통과 시 위 단계 해금**(게이트)해 암기 완결성 + 게임적 요소를 더한다.

## 핵심 모델 — "마스킹 밀도" 3단계
한 조문의 **기존 빈칸 세트(`article_blank_sets`)의 빈칸 풀**에서 얼마나 많이 가리느냐로 단계 정의.
새 빈칸을 따로 만들지 않는다(Phase 1).

| 단계 | tier | 가리는 빈칸(읽기 순 상위) |
|---|---|---|
| **하** | 1 | 상위 **2개** |
| **중** | 2 | 상위 **4개**(하 포함) |
| **상** | 3 | **전체** |

- 랭킹 = **읽기 순**(blockIndex, cumOffset, idx) 기본. (Phase 1.5에서 스태프 중요도 재정렬 가능)
- 하 ⊂ 중 ⊂ 상 (누적). 세트 빈칸 수가 적으면 단계가 자연 축소(N≤2면 하=중=상, N=3~4면 상=중).
- **Phase 2**: 진짜 "상" = 서술어/구간 빈칸을 `article_blank_candidates`(AI 후보 → 스태프 승인)로
  추가 → 상 단계에 합류. Phase 1은 "전체 명사 마스킹"까지.

상수(SSOT): `blanks/lib/tiers.ts` `TIER_BLANK_COUNTS = { 1: 2, 2: 4, 3: Infinity }`.

## 통과 / 게이트 (★사용자 결정: 100%)
- **통과 = 해당 단계 활성 빈칸 전부 정답(100%)**. 틀리면 "틀린 곳만 다시" 재도전.
- **게이트**: tier 1(하) 항상 열림. tier T(≥2)는 tier T−1 통과 기록이 있어야 열림.
- **서버 권위**: 통과는 클라가 아니라 서버가 정답 재검증(`normalizeAnswer`) 후 기록.

## 데이터
- **`blank_tier_completions`** (신규): `(user_id, set_id, tier smallint, completed_at)`,
  unique `(user_id, set_id, tier)`. RLS: 본인만 R/W. → 게이트·게임화 파생 소스.
- 빈칸 자체(`article_blank_sets.blanks`)는 무변경(tier 는 파생).

## 서버
- `blanks/lib/tiers.ts` (순수): `activeBlankIdxsForTier(blanks, tier)` · `orderBlanksForTier` ·
  `tierUnlockState(completions)` · `nextTier`. 단위 테스트 필수.
- `blanks/tiers.server.ts`: `getTierCompletions(client,userId,setIds)` ·
  `recordTierCompletion(admin,userId,setId,tier)`(멱등 upsert).
- API `/api/blanks/tier-complete` (POST, zod): `{setId, tier, answers:{idx:input}}` →
  서버가 set 로드 → tier 활성 빈칸 전부 정답 검증 → 통과 시 completion upsert →
  `{ok, passed, unlockedTier}` 반환. 하나라도 오답이면 `passed:false`(기록 안 함).

## 프론트 (`BlankFillViewV2`)
- 새 prop: `tier`(1|2|3), `activeIdxs:Set<number>`, `unlocked:{2:boolean,3:boolean}`,
  `completed:{1,2,3:boolean}`, `tierCompleteAction`(API href).
- **렌더**: 활성 빈칸만 slot, 비활성(상위 단계) 빈칸은 **정답을 본문 텍스트로 노출**(가리지 않음).
  → `buildInlineSegs` 가 hit.blank.idx ∉ activeIdxs 면 blank 대신 정답 tok 렌더.
- **단계 셀렉터**: 하/중/상 세그먼트(잠김=자물쇠, 완료=체크). 잠긴 단계 선택 불가.
- **완료 감지**: 활성 빈칸 전부 correct 되면 `tier-complete` fetch(순수 fetch, revalidation 회피)
  → 성공 시 다음 단계 해금 안내 + "다음 단계 도전" CTA. (초록 전환은 기존 로직 유지)
- **틀린 곳만 다시**: 오답 빈칸만 초기화하는 버튼.

## 게임화 (앱 철학 = 자기성장·순위 아님, feat-2-027 연계)
- 세트별 **3칸 완성**(하✓중✓상✓) → 3개 다 = **"이 조문 완전 암기"** 배지.
- 조문 트리/학습현황에 암기 완성도 표시(후속 stage).
- 상(tier 3) 통과 = 그 조문 마스터리 기여(feat-2-027 `mastery`) — 후속 연계.
- 스트릭/레벨 연계는 후속. Phase 1 = 3칸 완성 + 배지 표시까지.

## 단계 (Stage)
- **S1 (스키마·백엔드)**: `blank_tier_completions` 마이그 + `tiers.ts`(+테스트) + `tiers.server.ts`
  + `/api/blanks/tier-complete`.
- **S2 (뷰어 UI)**: `BlankFillViewV2` tier 렌더/셀렉터/게이트/완료감지 + article-viewer loader 배선.
- **S3 (게임화 표시)**: 3칸 완성/배지 + "틀린 곳만 다시" + 완성도 표시. (마스터리 연계는 후속)

## v2 재설계 (2026-07-23, 사용자 피드백)

고정 2/4/전체가 27개 빈칸 조문에서 안 맞고, 상이 "단어만 더 가림"이라 중과 질적 차이가 없다는 피드백 → 모델 재정의.

### 단계 재정의
| 단계 | 정의 | 출처 |
|---|---|---|
| **중** | 명사 빈칸 **전체** | 특허·상표·디자인=기존 `article_blank_sets` 빈칸 / 민법(빈칸 미정의 조문)=문장 길이 비례 **명사 자동 선정**(S3c) |
| **하** | 중의 **절반**(⌈전체/2⌉, 읽기 순 앞 절반) | 중에서 파생 |
| **상** | 빈칸을 포함한 문장의 **특정 구간(구절)** 통째 입력 — 개별 단어 아님 | 자동 도출(아래) |

- `tierTakeCount(total, tier)`: 하=⌈total/2⌉, 중=total. (상은 단어 수 아니라 구간이라 별도.)

### 상(구간) 자동 도출 + 길이 캡
- **도출**: 각 항(block)에서 그 항의 빈칸들을 아우르는 구간(첫 빈칸 시작 ~ 마지막 빈칸 끝)을 하나의 큰 빈칸으로. AI·운영자 작업 불필요(기존 빈칸 위치에서 계산).
- **길이 캡(★결정)**: 구간이 너무 길면 수험생 부담 → **띄어쓰기(어절) 기준 최대 10어절**로 끊어 여러 구간으로 분할.
- answer = 구간 원문. 기존 슬롯 인프라(긴 answer)로 렌더 가능.

### 게이트 범위 (★결정 대기)
- (A1) **조문 단위**(현재): 한 조문 하 통과 → 그 조문 중 열림.
- (A2) **장/편 단위**: 특·상·디=제N장의 **모든 조문** 하 통과 → 그 장의 중 열림. 민법=제N편 단위.
  - 필요: 조문→장/편 매핑(체계도/조문 계층), 스코프 내 전 조문 하-완료 집계.
  - 강한 "장 클리어" 게임감. 단 breadth-first 강제(유연성↓).

### 민법 명사 자동(S3c)
- 빈칸 미정의 조문: 문장 길이 비례로 명사 자동 선정 → 중 소스. AI/형태소 필요(별도 단계, 후속).

### 재설계 단계
- **S3a ✅**: 하 = 중의 절반(`tierTakeCount` 비례).
- **S3b**: 상 = 구간 자동 도출(+10어절 캡) 렌더링. 특·상·디 기존 빈칸 조문 완성.
- **S3c**: 민법 명사 자동 생성(AI).
- **S4**: 게이트 범위 확정 반영 + `?tiers=1` 해제(학생 공개).

## 비고 / 결정
- 비활성 상위 빈칸을 "정답 노출"로 렌더 = 하 단계에서 3·4번 용어는 그냥 본문으로 보임(학습 순리).
- 세트 빈칸 수가 적어 단계가 겹치면 UI 는 구분되는 단계만 의미 있게 노출(겹치는 상위 단계는
  하위 통과 시 자동 완료 처리).
- 판례 빈칸(feat-2-029) 계층화는 본 기능 안정화 후 동일 패턴 이식 검토.
