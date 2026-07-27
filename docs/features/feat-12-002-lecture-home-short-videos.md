# feat-12-002 — 강의 홈 짧은 영상 섹션 (공부방법 · 맛보기)

> 상태: ✅ 구현·배포 완료(2026-07-27) · 소유 화면 `/lecture/home` · 상위 [[lecture-landing-feat12]]
> 관련: [[lms-commerce-m1-design]](콜러스 재생) · [[drm-vendor-kollus]] · feat-11-006(콘텐츠 라이브러리)

## 1. 목적
강의 플랫폼 홈(`/lecture/home`, 비로그인 공개)에 **짧은 소개 영상**을 노출한다. 두 종류:
- **공부방법(study_method)**: 변리사 공부법·과목별 팁 등 마케팅/안내 영상
- **맛보기(teaser)**: 유료 강의의 일부를 잘라 만든 미리보기 클립

## 2. Layer 1 판단
- 사용자 명시 요청(마케팅 전환 자산) — YAGNI 체크 생략.
- **더 단순한 대안 검토**: `lecture_news`(공지)·`landing_banners`(히어로/밴드 배너)에 끼워넣기 → 의미가 섞임(공지 ≠ 영상 갤러리, 배너 ≠ 주제별 브라우징). **거부**. 대신 `lecture_schedules`·`lecture_news`·`exam_notices`와 **동일 패턴을 복제**(전용 소형 테이블 + 공개읽기 RLS + 통합 액션) → 코드·운영 UX 재사용.
- **기존 메커니즘 통합**: 유튜브 = 이미 정착된 임베드 패턴(팝업공지·가이드). 콜러스 맛보기 = 이미 있는 `video_contents`(콘텐츠 라이브러리) + `buildKollusWebTokenUrl`(웹토큰 서명) 재사용 — 신규 재생 인프라 0.

## 3. 호스팅 = 두 공급자 모두 지원
| provider | 소스 필드 | 재생 |
|---|---|---|
| `youtube` | `youtube_url` (embed ID는 렌더 시 추출) | `youtube.com/embed/{id}` iframe |
| `kollus` | `content_id` → `video_contents`(콘텐츠 라이브러리) | 서버가 `buildKollusWebTokenUrl(mckey)` 로 **서명된 재생 URL** 생성 후 iframe |

### 콜러스 맛보기 재생 흐름 (공개/anon 안전)
- `buildKollusWebTokenUrl`은 **enrollment/수강권 무관** — `mckey`·`cuid`·`expireSeconds`만 받아 JWT 서명 URL을 만든다(수강권·배수·기기 게이트 없음). 맛보기에 그대로 적합.
- 랜딩 loader가 kollus 영상마다 서버에서 서명:
  - `mckey` = `video_contents.content_key` (content_id로 조회)
  - `cuid` = 로그인 시 user id, 비로그인은 `"preview-anon"`(Kollus 통계 매칭용, 접근제어 아님)
  - `expireSeconds` = 짧게(예: 2시간). 랜딩 loader는 캐시 없음(max-age=0)이라 요청마다 새 URL.
- **원본 `mckey`(=drm_video_id)는 클라이언트에 절대 노출하지 않는다** — loader가 서명 URL만 prop으로 내려보냄([[lms-commerce-m1-design]] "drm_video_id 학생 비노출" 규칙 준수).
- `video_contents` RLS가 staff 읽기 전용이면 anon 랜딩이 못 읽으므로 **loader는 adminClient로 content_key 조회**(mckey는 서버에만 머묾).

### ★ 운영 규칙 (Non-negotiable 8 연장 — 콘텐츠 오·노출 방지)
- **맛보기(kollus)는 반드시 "별도의 짧은 클립" 콘텐츠를 가리켜야 한다. 전체 유료 강의 영상을 그대로 지정 금지** — 공개 재생되므로 전체 강의가 무료로 새어나간다.
- 운영자는 콜러스에 맛보기용 클립을 별도 업로드 → `video_contents`에 편입 → 그 콘텐츠를 선택. 운영자 등록 화면에 경고 문구 상시 노출.
- 기술적 강제는 없음(길이만으로 판별 불가). 문서·UI 경고로 관리.

## 4. 데이터 모델 — 신규 `lecture_videos`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `title` | text NOT NULL | |
| `description` | text | 한 줄 소개(선택) |
| `category` | text NOT NULL check in (`study_method`,`teaser`,`etc`) | 섹션 그룹 |
| `provider` | text NOT NULL check in (`youtube`,`kollus`) default `youtube` | |
| `youtube_url` | text | provider=youtube 시 사용 |
| `content_id` | uuid FK `video_contents(id)` | provider=kollus 시 사용 |
| `thumbnail_url` | text | 비우면: youtube 자동 썸네일 / kollus는 기본 포스터 |
| `linked_plan_id` | uuid FK `subscription_plans(id)` | 맛보기 → "이 강의 신청하기" CTA(선택) |
| `duration_label` | text | 표시용 "3분 12초"(선택) |
| `published` | bool NOT NULL default true | |
| `display_order` | int NOT NULL default 0 | |
| `deleted_at` | timestamptz | soft delete |
| `created_at`/`updated_at` | timestamptz default now() | `set_updated_at` 트리거 |

- **RLS**: 공개 읽기 `using (published AND deleted_at IS NULL)` / staff 쓰기(`is_staff` 헬퍼, 기존 lecture_* 테이블과 동일).
- 인덱스: `(category, display_order)`, `(deleted_at)`.
- 무결성 체크(선택): `provider='youtube'`면 `youtube_url` NOT NULL, `provider='kollus'`면 `content_id` NOT NULL — DDL CHECK 로.
- 적용: 운영 DB(mcgdoplo) `scripts/run-prod-sql.mjs` → `npm run db:typegen`.

## 5. 화면
### 강의 홈 (`/lecture/home`, landing.tsx)
- 새 섹션 **"공부방법 & 맛보기"** — 카테고리별 소제목 + 가로 레일(기존 `rail.tsx`/`instructor-rail` 스타일 재사용).
- 카드 = 썸네일(16:9) + 재생 아이콘 오버레이 + 제목 + duration_label + (맛보기면) 강의 배지.
- 카드 클릭 → **라이트박스(Dialog) iframe 재생**. youtube=embed URL, kollus=loader 서명 URL. 맛보기 라이트박스 하단에 `linked_plan_id` 있으면 "이 강의 신청하기" CTA(`/lecture/catalog` 또는 상품 상세).
- 영상 0건이면 섹션 숨김(기존 featuredReviews 패턴).
- 스타일 = scoped `.llx`(landing-style.tsx).

### 운영자 (`/admin/lecture-videos`)
- 목록 + `/new` + `/:id/edit` — `admin-schedules`·`admin-news`와 동일 UX(추가·삭제로 개수 조절, ↑↓ 정렬, 노출 토글).
- 폼: provider 토글 → youtube면 URL 입력(zod `extractYoutubeId` 검증), kollus면 콘텐츠 라이브러리 select(`listPickableContents`, course-detail `set_video`와 동일) + **맛보기 경고 문구**. category·linked_plan·thumbnail·duration_label·published.
- 저장 = 통합 액션 `/api/admin/landing`에 `entity=video`(intent save|delete|reorder) 분기 추가. staff 게이트 + 요청 클라이언트(RLS 강제).
- AdminShell 클러스터 = 기존 강의 플랫폼 콘텐츠(id `landing`).

## 6. 공용 헬퍼 정리
- `extractYoutubeId`가 현재 4곳 중복(popup-notice-modal·admin/api/guide·admin/api/popup-notice·guide-help-button·guide-detail). **신규 코드는 `app/core/lib/youtube.ts`로 통합한 단일 헬퍼 사용**. 기존 중복은 이번 범위에서 건드리지 않음(리팩토링 분리 — 필요 시 후속 태스크).

## 7. 구현 단계 (하드스톱)
1. **DDL + typegen** — `lecture_videos` 생성(운영 반영), 타입 재생성. **← 여기서 확인**
2. **queries.server + 유튜브 헬퍼** — `listLectureVideos`(공개, 카테고리 그룹)·`getLectureVideo`·`listPickableContents` 재사용, `core/lib/youtube.ts`.
3. **랜딩 섹션 + 라이트박스 플레이어** — loader에 kollus 서명·adminClient 조회 배선, 섹션 컴포넌트.
4. **운영자 3화면 + 통합액션 분기** — admin-lecture-videos(목록/new/edit), `/api/admin/landing` entity=video.
5. **SPEC/문서 갱신 + 커밋·푸시**.

## 8. 제외(YAGNI)
- 조회수·좋아요 통계, 재생 진도 추적(맛보기는 마케팅용 — 시청 기록 불필요).
- 자막·챕터.
- 콜러스 맛보기 자동 클립 생성(운영자가 별도 업로드).
