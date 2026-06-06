# feat-7-037 — 판례 전문 자동 재확인·적재 (periodic re-check)

> 상태: ✅ 구현 완료 (로컬 검증 — 배포 후 cron 첫 실행·서버리스 번들 검증 대기) · 우선순위: P2 · 작성/구현: 2026-06-06

## 1. 배경 / 문제

학습정보 "최근 판례" 중 **전문(`official_text_md`)이 미적재**된 판례가 138건(2026-06-06 기준). 원인 진단:

- **최근 대법원 판례**(2024~25 선고, 후/다)는 국가법령정보센터 OPEN API(`target=prec`)에 **아직 미등록** — 선고 후 등록까지 수개월~1년+ 시차. **등록되면 받아올 수 있음.**
- 특허법원(허 ~45)·고등/지법(나/누/라 ~8)은 이 API에 거의 미수록 → 시간 지나도 안 옴 (이 기능 대상 아님).

현재 적재는 `scripts/precedents/import-law-precedents.ts` **수동 실행**뿐 → 등록 시차가 있는 대법원 판례가 방치됨. **목표: 미적재 대법원 판례를 주기적으로 자동 재확인 → 등록되면 전문+PDF 자동 적재.**

## 2. 3계층 게이트

**Layer 1 (Judgment)**: 운영상 필수(반복 작업의 자동화). KISS — 하루 1회 소량 배치. DRY — 기존 import 로직을 `.server.ts` 로 추출해 스크립트·cron 공유. 기존 cron/Storage/embed dirty-hook 인프라에 통합.

**Layer 2 (Structure)**:
- 소유자 = 서버 cron(자동) + staff 수동 트리거(같은 server lib 호출).
- 상태 경계: persisted = `cases.official_text_md/_pdf_path/law_api_serial_id` + **신규 추적 컬럼 3종**. derived 없음.
- 작은 코어: `precedent-import.server.ts`(단건 fetch+match+normalize), `render-official-text-pdf.server.ts`(기존), `precedent-recheck.server.ts`(배치 선택·orchestration).
- 멱등: 이미 `official_text_md` 있으면 skip(또는 force). triple-match 안전망 유지.

**Layer 3 (Code)**: 아래 §4~6.

## 3. DB 변경

`cases` 에 재확인 추적 컬럼 추가 (마이그레이션 `add_official_text_recheck_tracking`):

| 컬럼 | 타입 | 의미 |
|------|------|------|
| `official_text_checked_at` | `timestamptz null` | 마지막 재확인 시각 (오래된 것부터 라운드로빈) |
| `official_text_check_count` | `int not null default 0` | 누적 재확인 시도 횟수 |
| `official_text_unavailable` | `boolean not null default false` | 영구 미수록 마킹(하급심·장기 미발견) → 재확인 제외 |

부분 인덱스(재확인 대상 빠른 선택):
```sql
create index cases_recheck_due_idx on cases (official_text_checked_at nulls first)
where official_text_md is null and deleted_at is null and official_text_unavailable = false;
```

**사전 백필 없음** (사용자 결정 2026-06-06). 제외는 cron 정책으로:
- **대법원 + 선고 최근 5년**: 영구 재확인(give-up 없음 — 언제 등록될지 모름).
- **대법원 + 5년 초과**: 자동 재확인 제외(cron WHERE `decided_at` 필터). 필요 시 staff 수동/역방향 PDF.
- **대법원 외(특허법원·고등/지법)**: **cron 이 1회 시도 → 실패하면 `official_text_unavailable=true` 마킹**(다음부터 제외). 혹시 API 에 수록된 하급심을 놓치지 않으려는 1회 기회.

## 4. 서버 모듈 (lib 추출)

`import-law-precedents.ts` 의 단건 처리 로직을 `app/features/cases/lib/precedent-import.server.ts` 로 추출:

```ts
// 단건: 사건번호 → 등록 여부 확인 → 본문 fetch → triple-match → normalize
export async function fetchOfficialText(caseNumber, opts): Promise<
  | { status: "not_registered" }                       // 검색 매칭 0
  | { status: "ambiguous"; count }                     // 매칭 ≥2
  | { status: "api_error"; msg }
  | { status: "ok"; serialId; textMd; meta }>          // 성공

// PDF 렌더+업로드 (기존 render-official-text-pdf + storage)
export async function renderAndStorePdf(caseId, textMd, meta): Promise<
  { status: "ok"; path } | { status: "skipped_unrenderable"; chars } | { status: "error"; msg }>
```

- search/service 호출·`pickAllPrec`·`caseNumbersEqual`·`verifyTripleMatch`·`normalizeOfficialText` 재사용.
- `import-law-precedents.ts` 스크립트도 이 모듈을 쓰도록 리팩토링(중복 제거, 동작 동일 — 별도 검증).
- 서버리스 호환: `pdf-lib`(순수 JS) + 폰트 파일 `public/fonts/NotoSerifCJKkr-Regular.otf`. Vercel 함수 번들에 폰트 포함되도록 `vercel.json` `functions.includeFiles` 또는 import-time 번들 확인 필요(구현 시 점검 항목).

## 5. cron 라우트

`app/features/cron/api/recheck-precedents.tsx` (기존 cron 패턴: `CRON_SECRET` 인증, `?limit=`):

```
1. 인증(checkAuth) → 미인증 403.
2. LAW_API_KEY 없으면 dry-run(대상 수만 보고).
3. 재확인 대상 선택: official_text_md IS NULL AND NOT unavailable AND deleted_at IS NULL
   AND ( (court='supreme' AND decided_at >= current_date - interval '5 years')   -- 영구
         OR court <> 'supreme' OR court IS NULL ),                                -- 1회 시도
   ORDER BY official_text_checked_at NULLS FIRST, LIMIT N(기본 5, 캡 20).
4. 각 건:
   - fetchOfficialText():
     · ok      → renderAndStorePdf() → cases UPDATE(official_text_md, _pdf_path?, serial_id,
                  checked_at=now, check_count++) → content_chunks dirty(reindexCase) → 성공 카운트
     · 그 외(실패) → checked_at=now, check_count++.
       **court <> 'supreme' 이면 official_text_unavailable=true** (1회 시도 후 제외).
       대법원(최근5년)은 마킹 안 함 → 영구 재확인.
   - 호출 간격 sleep(API 한도 보호)
5. 결과 JSON: { checked, recovered, notRegistered, errors, dirtyTotal }
```

- **배치 캡 N=5**: Hobby 함수 10초 타임아웃 대비(건당 API 2회 + PDF + 업로드 ≈ 1~2초). 대량은 다음 날 cron 이 이어 처리(`checked_at` 라운드로빈).
- 성공 시 `content_chunks` dirty 처리 → 다음 embed cron 이 AI Q&A 인덱스에도 반영(기존 hook 재사용).

### vercel.json cron 추가
```json
{ "path": "/api/cron/recheck-precedents?limit=5", "schedule": "30 16 * * *" }
```
(KST 새벽 1:30. embed-chunks `0 17` 직전.)

> ⚠️ **Hobby cron 개수 제한 확인 필요**: 현재 3개 동작 중. 4번째 추가가 Hobby 에서 거부되면 → 대안: `promote-law-revisions`(법령 콘텐츠 cron, `5 0 * * *`)에 piggyback 하여 한 라우트에서 순차 호출. 구현 시 결정.

## 6. 운영자 화면 (수동 트리거 + 가시성)

기존 `admin-case-pdf-missing.tsx` 확장:
- 표에 **마지막 재확인 / 시도 횟수** 컬럼 추가.
- **"지금 재확인" 버튼**(staff) — 선택/전체 미적재 대법원분을 즉시 1배치 재확인(cron 과 동일 server lib, 화면 action 에서 직접 호출, 결과 toast).
- `unavailable` 마킹 토글(오판정 복구용).

## 6.5 역방향: 전문 PDF 수동 업로드 → 텍스트 적재 (사용자 결정 2026-06-06)

API 로 못 받는 판례(특허법원·하급심 등)는 staff 가 **전문 PDF 를 수동으로 찾아 업로드**한다. 정방향(API 텍스트 → PDF 렌더)의 **역방향** — 업로드된 PDF 에서 텍스트를 추출해 적재·학습 활성화.

**흐름** (admin-case-pdf-missing 행별 "전문 PDF 업로드"):
1. staff 가 case 별 PDF 업로드 (multipart) → `/api/admin/case-official-pdf` (staff 가드, zod/파일검증, ≤20MB, application/pdf).
2. 서버:
   - PDF bytes → Storage `case-fulltext/{caseId}.pdf` 업로드 → `official_text_pdf_path`.
   - **텍스트 추출** (`pdfjs-dist` 또는 `mupdf` — 둘 다 설치됨): 페이지별 text 추출 → `normalizeOfficialText` 재사용 → `official_text_md`.
   - 추출 텍스트가 비면(스캔 이미지 PDF, text layer 없음) → **경고 반환, PDF 만 저장하고 text 는 비움**(OCR 은 범위 밖). staff 가 인지.
   - `official_text_unavailable = true` (API 재확인 중단 — 수동 적재 완료 표식), `official_text_checked_at = now`.
   - `reindexCases([caseId])` → content_chunks 갱신(AI Q&A·검색 학습 활성화).
3. 결과 toast: 추출 글자수 / PDF 저장 경로 / (스캔이면) 경고.

**서버 모듈**: `extractPdfText(bytes): Promise<{ text: string; pageCount: number }>` (`app/features/cases/lib/pdf-extract.server.ts`). 정방향 PDF 와 동일 버킷·컬럼 사용 → 학습 화면(case-viewer)·검색·AI Q&A 가 자동으로 동일하게 동작.

> 정방향(API)·역방향(PDF) 모두 종착점은 같다: `official_text_md`(학습·검색·RAG) + `official_text_pdf_path`(전문 뷰어). 두 경로가 같은 필드로 수렴하므로 다운스트림(case-viewer iframe, pg_trgm 검색, content_chunks) 변경 불필요.

## 7. 범위 밖 (YAGNI)

- 하급심(특허법원·고등법원) 판례 소스 연동 — 별도 과제(수동 입력 or 외부 소스).
- 옛 대법원 미회수분의 검색 파라미터 튜닝 — 별도 조사(이 기능과 무관, §D).
- 신규 판례 자동 "발견"(우리 DB 에 없는 판례를 API 에서 끌어오기) — 이번엔 **이미 cases 에 있는 미적재분 보강만**.

## 8. 검증 계획

- 마이그레이션 적용 + `db:typegen`.
- `precedent-import.server.ts` 추출 후 기존 import 스크립트 동작 동일 확인(알려진 성공 케이스 2012후726 재적재 dry-run).
- cron 라우트 로컬 수동 호출(`?secret=`)로 1배치 정상 동작 확인(대법원 미적재 5건 → checked_at 갱신, 등록된 게 있으면 recovered).
- `npm run typecheck`.

## 9. 미해결 / 결정 필요

1. ~~STALE_GIVEUP 횟수~~ **결정(2026-06-06)**: 대법원 + **선고 최근 5년** 은 영구 재확인(give-up 없음), 그 외(하급심 전부 + 5년 초과 대법원)는 자동 재확인 제외. 하급심은 초기 백필로 `unavailable=true`.
2. **Hobby cron 4번째** 추가 가능 여부(거부 시 piggyback).
3. 폰트 파일 서버리스 번들 포함 방식.
