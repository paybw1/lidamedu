# feat-3-305 — 자연과학 1차 기출 AI 해설 생성 + 학생 노출 게이트

## 배경
feat-3-304로 자연과학 1차 기출 **680문항(2010~2026)**을 image-first(발문+5선지 스캔 이미지)로 적재했으나 **해설이 없다**. 출처 폴더에 공식/시판 해설이 없어(문제·정답 PDF만 존재) **AI(Claude opus, 비전)로 생성**한다. 단, 수험 콘텐츠라 정확성이 중요하므로 **강사 검수를 거치기 전에는 학생에게 노출하지 않는다.**

## 핵심 설계 — 학생 노출 게이트
**불변식: 운영 `problems.explanation_md` 컬럼에는 "승인된 해설"만 들어간다.**

- AI 초안은 운영 컬럼이 아니라 **별도 테이블 `problem_explanation_drafts`** 에 stage 한다.
- 학생 렌더 경로(pack-sheet "종합 해설", pack-result 근거, 오답노트 인쇄 등 8경로)와 **AI-Q&A 색인**은 모두 `explanation_md` 가 non-null 일 때만 동작 → 초안이 운영 컬럼에 없으니 **렌더 코드를 한 줄도 안 바꿔도 구조적으로 차단**된다(미승인 누출 0).
- 스태프가 승인하면 RPC가 `content_md` 를 `explanation_md` 로 복사 → 그때부터 기존 경로로 자동 노출.

조사 근거: 미승인 노출 위험 지점이 학생 렌더 8곳 + AI-Q&A 백도어인데, draft-table 방식은 이를 전부 우회한다. (`problems.review_status` 는 **문제** 게이트이고 기출 문항은 이미 `approved`(문제 자체는 정상 노출)라 재사용 불가 — 해설 전용 게이트가 필요했다.)

## DB (마이그레이션: `scripts/sql/20260611_problem_explanation_drafts.sql`)
운영(mcgdoplo)에 **Supabase Management API**(`scripts/jagwa/mgmt-sql.mjs`, ref 명시)로 적용. 직접 pg 호스트는 IPv6 전용이라 이 환경에서 미해결 → Management API 사용. 순수 추가형(기존 테이블·데이터 무변경).

- enum `explanation_draft_status` = `pending | approved | rejected`
- table `problem_explanation_drafts`
  - `draft_id` PK, `problem_id` FK→problems (unique, 문제당 1행, 재생성 upsert), `content_md`
  - `ai_answer`(AI 도출 선지), `answer_match`(정답키 일치 여부 → 검수 우선순위), `model`
  - `status`(default pending), `note`, `created_at`, `reviewed_at`, `reviewed_by`
  - **RLS: 스태프(`private.is_staff`) 전용** R/W. 학생 접근 없음.
- RPC `approve_explanation_draft(p_draft_id uuid)` — SECURITY DEFINER, staff 확인 후 `content_md`→`problems.explanation_md` 복사 + 초안 status=approved (원자적).

## 생성 파이프라인 (`scripts/jagwa/`)
1. `build-haesol-worklist.mjs` — 해설 없는 문항(670건, 2010 물리 10건은 파일럿 적재) 조회 + 정답키(`problem_choices.is_correct`) + 크롭 이미지 절대경로 → `.haesol/_batch_{year}_{subject}.json`(67배치×10) + `_batches.json`.
2. **워크플로우 `jagwa-haesol-gen`** (다중 에이전트 팬아웃, 67배치 병렬, opus) — 각 에이전트가 배치의 10문항에 대해: 크롭 이미지 Read(비전) → **독립 풀이** → 정답키와 비교(`answer_match`) → 한국어 해설 markdown 작성 → `.haesol/{year}_q{NN}.json` 기록. 불일치면 해설에 `⚠️ AI 검토 … 검수 필요` 라인 추가.
3. `persist-haesol.mjs` — `.haesol/*.json` → `problem_explanation_drafts` upsert(status=pending).

파일럿(2010 물리 10문항): 이미지 판독+풀이 결과가 정답키와 **10/10 일치**(`seed-haesol-2010-physics.mjs`).

## 검수 화면 — `/admin/problems/explanations`
- `app/features/admin/screens/admin-explanation-review.tsx` (loader: `getStaffRole` 게이트)
- `app/features/admin/queries/explanation-drafts.server.ts` — `listExplanationDrafts`(pending 목록, 문제 이미지+정답키+AI답+일치배지, 불일치 우선 정렬, 과목/연도/불일치 필터). staff 검증 후 adminClient 읽기.
- `app/features/admin/api/explanation-review.tsx` — intents `approve`(RPC) / `reject`(status=rejected) / `bulk-approve`.
- UI: 문제 이미지 ↔ AI 해설 2단, 정답키·AI답 배지, 불일치 카드 강조. 승인 시 RPC로 `explanation_md` 복사 → pack-sheet "종합 해설"로 노출.
- 네비: 운영자 사이드바 problems 클러스터 "기출 해설 검수".

## 상태
- ✅ 게이트(테이블·RLS·RPC) + 타입 + 검수 화면/액션/쿼리 (typecheck clean)
- 🟡 670문항 생성 워크플로우 실행 → persist → 검수(승인) 진행
- 파일럿 10건 pending 적재 완료(게이트 검증: explanation_md 여전히 null).

## 주의
- 마이그레이션·운영 쿼리는 **Supabase Management API / .env supabase-js(mcgdoplo ref 명시)** 로. 직접 pg 호스트 미해결, MCP/CLI는 stale 프로젝트 주의.
- AI 해설은 **초안**이다. 화학 구조식·생물 유전 도식 등은 비전 오독 가능 → 정답키 교차검증이 1차 안전망, 최종 노출은 강사 승인 필수.
