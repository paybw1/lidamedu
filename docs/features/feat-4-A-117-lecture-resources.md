# feat-4-A-117 — 관련자료(강의노트) 패널

> 상태: 🔲 계획 (Phase 0 — 사용자 검토 대기)
> 우선순위: P0
> 첫 시드 콘텐츠: `source/리담특허법 강의노트(제10판).pdf` (263 MB)

## 1. 배경

조문/판례 우측 패널의 "관련자료(📎)" 탭은 현재 `PLACEHOLDER_TABS` 에 있어 `구현 대기` 안내만 표시된다 (`app/features/laws/components/article-right-panel.tsx:95-105, 473-491`). DB 에도 `lecture_resources` 테이블이 미적용. 강사가 학생에게 "이 조문은 강의노트 67쪽 봐라" 라고 말할 수 있는 통로가 없다.

학원이 보유한 강의노트(PDF)를 조문·판례 단위로 첨부해, 학생이 본문을 보다 즉시 같은 주제를 다룬 강의노트 페이지를 열 수 있게 한다.

## 2. 범위 (M1)

### In scope
- `lecture_resources` 테이블 + RLS + 인덱스
- `lecture-notes` Storage 버킷(private, signed URL 5 분)
- `kind = lecture_note`, `target_type ∈ {article, case}` 만 첫 사이클
- 학생 read-only / staff(instructor·admin) CRUD
- article-viewer · case-viewer 우측 패널 "materials" 탭 실 구현
- 첫 데이터: 리담특허법 강의노트(제10판) 페이지별 분할 import

### Out of scope (후속)
- 강의영상(`lecture_video`/`answer_video`) — feat-7-029 `lecture_views` 시스템과 통합 검토
- `target_type = problem` / `science_section`
- 결제/구독 게이팅 — feat-8-008 `area_subjects` 영역 통합으로 충분 (별도 게이팅 없음)
- 다중 강의노트 동시 노출 정렬(`ord` 순)·즐겨찾기

## 3. 데이터 모델

`docs/db-schema.md §17` 의 설계를 베이스로, 페이지 분할 추적용 컬럼 3개 추가.

```sql
create type public.resource_kind as enum
  ('lecture_note','lecture_video','reference','answer_video');
create type public.resource_target_type as enum
  ('article','case','problem','science_section');

create table public.lecture_resources (
  resource_id        uuid primary key default gen_random_uuid(),
  target_type        public.resource_target_type not null,
  target_id          uuid not null,
  kind               public.resource_kind not null,
  title              text not null,
  url                text,                              -- YouTube/Vimeo 외부 영상
  pdf_url            text,                              -- Storage object key (lecture-notes/...)
  duration_sec       int,
  ord                int not null default 0,
  -- 추가 (M1)
  source_pdf_id      uuid,                              -- 같은 원본 PDF 출처 묶음(nullable; 강의노트 단위)
  source_page_start  int,                               -- 원본 PDF 페이지 (표시·추적용)
  source_page_end    int,                               -- 단일 페이지면 same
  -- 표준 컬럼
  created_by         uuid references profiles(profile_id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz                        -- soft delete (CLAUDE.md non-negotiable §9)
);

create index lr_target on public.lecture_resources(target_type, target_id) where deleted_at is null;
create index lr_kind on public.lecture_resources(kind);
create index lr_source on public.lecture_resources(source_pdf_id) where source_pdf_id is not null;
```

### `source_pdf_id` 의미
- 한 강의노트 PDF(예: 리담특허법 제10판) = 1 UUID. 같은 원본의 페이지들을 묶음 식별.
- 옵션 — 별도 `lecture_books`(name/edition/publisher) 테이블도 가능하나 M1 에선 UUID 만으로 충분(검색·필터 필요 시 후속).

### RLS 정책
```sql
alter table public.lecture_resources enable row level security;

-- 모든 authenticated 사용자 read (deleted_at IS NULL)
create policy lr_select_authenticated
  on public.lecture_resources for select
  using (auth.role() = 'authenticated' and deleted_at is null);

-- staff 만 insert/update
create policy lr_write_staff
  on public.lecture_resources for insert
  with check (private.is_staff());
create policy lr_update_staff
  on public.lecture_resources for update
  using (private.is_staff());

-- soft delete 만 허용 (실 DELETE 차단)
create policy lr_delete_none on public.lecture_resources for delete using (false);
```

> 콘텐츠 자체는 RLS 약식 처리하고, paywall 은 후속 (feat-8-008 `area_subjects` 영역 안 → loader 에서 `requireFeature('area_subjects')` 호출). M1 에선 authenticated 만 통과.

## 4. Storage 버킷

| 항목 | 값 |
|------|----|
| 버킷명 | `lecture-notes` |
| public | **false** (private + signed URL) |
| signed URL 유효기간 | 5 분 (다운로드/뷰어 진입마다 재발급) |
| 경로 규칙 | `{book_slug}/p{start:04d}-{end:04d}.pdf` <br/> 예: `lidam-patent-v10/p0067-0072.pdf` |
| 최대 파일 | 50 MB (페이지 묶음 기준) |
| MIME | `application/pdf` |

기존 패턴 따름:
- `gs-papers` / `gs-answers` (private + `createSignedUrl(path, 600)`)
- `exam-certificates` (private + signed URL)

`law-revision-files` / `avatars` 처럼 `getPublicUrl` 은 사용하지 않는다 — 유료 학습 콘텐츠 보호.

## 5. UI

### 5.1 학생 화면

article-viewer / case-viewer 우측 패널 "관련자료(📎)" 탭:

```
┌─ 관련자료 (3 건) ────────────────────┐
│ 📄 리담특허법 강의노트 (제10판)        │
│    p.67–72 · 6쪽                     │
│    [ 열기 ↗ ]                        │
├──────────────────────────────────────┤
│ 📄 리담특허법 강의노트 (제10판)        │
│    p.85–87 · 3쪽                     │
│    [ 열기 ↗ ]                        │
└──────────────────────────────────────┘
```

- 카드 클릭/`[ 열기 ]` → signed URL 재발급 후 새 탭에서 PDF 열기 (`window.open`). 브라우저 내장 PDF 뷰어 사용 (별도 PDF.js 임베드는 후속).
- 자료가 없으면 카드 자체 표시 안 함 + 학생에겐 "등록된 자료가 없습니다" 만 노출.

### 5.2 staff 화면

같은 패널 상단에 `[ + 자료 추가 ]` 버튼:

```
[ + 자료 추가 ]
─────────────────────────
file:    [PDF 선택]
제목:    [_______________]
원본 페이지: [____] – [____]
출처 묶음:  [▼ 리담특허법 제10판]   (선택, 자동완성)
                                  [ 업로드 ]
```

목록 카드에 `삭제` 버튼(휴지통) — soft delete (`deleted_at = now()`).

### 5.3 컴포넌트 분할

```
app/features/lectures/
├── queries.server.ts        # 이미 존재 (lecture_views) → lecture_resources 함수 추가
├── components/
│   └── lecture-resources-panel.tsx   # 신규
└── api/
    └── lecture-resource.tsx          # 신규 (create/delete/signed-url)
```

> `case-references-panel.tsx` (관련 논문·기사, feat-4-A-214) 와 **별도 컴포넌트**. 둘 다 case 우측에 표시되지만 의미가 다르다(논문·기사 = 외부 자료 메타, 강의노트 = 본문 PDF).

## 6. OCR 매핑 자동화 (Phase 2)

### 도구
- `pdfjs-dist` (이미 설치) — PDF 페이지 → ImageData
- `tesseract.js` (신규 설치 필요) — wasm OCR, 한국어 모델 `kor.traineddata` 별도 다운로드
- `pdf-lib` (신규 설치 필요) — 페이지 분할

### 처리 흐름
```
PDF (263 MB)
  └─ page 1..N
       ├─ pdfjs-dist render → 좌상단 영역(예: top 12%, left 60%) Canvas crop
       ├─ tesseract.js (kor) → 헤더 텍스트
       ├─ regex 파서:
       │     "제29조제1항각호"   → {kind: article, key: "특허법 제29조 제1항"}
       │     "CASE STUDY"        → 다음 줄에서 사건번호 패턴 → {kind: case, ...}
       └─ identifier.ts(`parseDisplay`) + cases.case_number 매칭 → article_id/case_id
```

### 출력
`out/lecture-note-mapping.csv`:
```csv
page,kind,header_text,resolved_key,target_id,confidence
67,article,제29조제1항각호,특허법 제29조 제1항,<uuid>,0.92
68,article,제29조제1항각호,특허법 제29조 제1항,<uuid>,0.89
...
```

스크립트 위치: `scripts/import-lecture-note-ocr.ts` (별도 npm script: `npm run import:lecture-note`).

### 한계
- OCR 정확도 ≥85% 목표. 실패 페이지는 `resolved_key = null` 로 남기고 사용자 검수.
- 좌상단 영역 좌표는 PDF 샘플 페이지 보고 튜닝 필요.

## 7. 검수 + 일괄 import (Phase 3)

1. Phase 2 CSV 를 사용자 검수 (Excel/Numbers/VS Code 등에서 직접 수정)
2. dry-run: `npm run import:lecture-note -- --dry-run` — 그룹핑 결과만 출력, 실제 DB/Storage 변경 없음
   - 연속된 같은 `resolved_key` 페이지는 묶음 (예: 67-72 → 1 PDF)
   - 표시: "→ lecture-notes/lidam-patent-v10/p0067-0072.pdf (6쪽) → article=특허법 제29조 제1항"
3. 사용자 승인 후 실행: `npm run import:lecture-note -- --apply`
   - `pdf-lib` 로 페이지 추출 → Storage upload
   - `lecture_resources` insert (한 묶음 = 1 row)
   - 진행 로그 stdout
4. 같은 강의노트 재실행 방지를 위해 `source_pdf_id` 로 기존 데이터 dedupe.

CLAUDE.md non-negotiable §8 준수: dry-run 검증 + 사용자 승인 + identification field 보존.

## 8. 마이그레이션 작전

- **이름**: `add_lecture_resources`
- **DDL**: enum 2 + table 1 + RLS 4 + index 3
- 적용: Supabase MCP `apply_migration`
- 후속: `npm run db:typegen` 로 `database.types.ts` 갱신

## 9. 결정 포인트 (사용자 확인 필요)

| # | 결정 | 제안 |
|---|------|------|
| 1 | 버킷 가시성 | **private + signed URL 5 분** (gs-papers 패턴) |
| 2 | PDF 뷰어 | **브라우저 내장**(window.open). PDF.js 임베드는 M2 |
| 3 | 페이지 묶음 정책 | 연속된 같은 조문·판례 페이지는 1 PDF 로 묶음 |
| 4 | 결제 게이팅 | M1: authenticated 만. paywall 은 area_subjects 영역 안 자연스럽게 |
| 5 | `source_pdf_id` 표현 | UUID 단독 (책 메타 테이블은 후속). title 에 "리담특허법 강의노트(제10판) p.67-72" 표기 |
| 6 | OCR 라이브러리 | tesseract.js (한국어 wasm, 외부 바이너리 X) |
| 7 | case-viewer 노출 | 같은 컴포넌트 재사용. case-references-panel(논문·기사)과 별도 섹션 |

## 10. 수용 기준 (DoD)

- [ ] `lecture_resources` 테이블 / RLS 4종 / 인덱스 3종 적용
- [ ] `lecture-notes` Storage 버킷 생성 + RLS
- [ ] `database.types.ts` 갱신
- [ ] article-viewer "관련자료" 탭 placeholder 제거 → 실 동작
- [ ] case-viewer 우측 패널에도 동일 패턴 동작
- [ ] staff 가 PDF 업로드 시 Storage 업로드 + DB insert 정상
- [ ] 학생 클릭 시 signed URL 발급 → 새 탭에서 PDF 열림
- [ ] OCR 스크립트 dry-run → 사용자 검수 → apply 정상 종료
- [ ] 리담특허법 강의노트(제10판) 매핑 ≥1 건 등록 (최종 단계 검증)
- [ ] `npm run typecheck` 통과
- [ ] `e2e/laws/lecture-resources.spec.ts` (학생 read + staff upload 2 케이스)

## 11. 단계 매핑 → 작업 트래커

- Phase 0 (이 문서) → Task #5
- Phase 1 (인프라) → Task #1, #2
- Phase 2 (OCR) → Task #3
- Phase 3 (검수·import) → Task #4
