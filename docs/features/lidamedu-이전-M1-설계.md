# lidamedu 이전 M1 — 강의 LMS·커머스 데이터 모델 설계

> **산출물 성격**: ERD 수준 설계 + 우선순위 정렬 단계 계획. **코드 0 · DB 적용 0.**
> 요구사항 원문: `docs/features/lidamedu-이전-요구사항-원문.md`. SPEC 등록: §5.11 (feat-11).
> 표기: ★~★★★★★ = 요구사항 문서 우선순위. [벤더] = DRM 벤더(콜러스/스타플레이어) 확정 후에만 배선 가능한 부분.

> **✅ M1 승인 (2026-07-08, 원장)** — 핵심 결정 ①plans 확장 ②enrollments 신설 ③배수 events/ledger append-only·멱등·복구 가능한 근사 ④에디션/영상교체 이원화 ⑤모수 자동 재계산 금지 ⑥grants 불투명 토큰 전부 동의. **단서 3**:
> 1. M2 의 "판정 스킵 플래그"(배수·기기)는 **M4 결제 오픈 전 반드시 ON** — M4 오픈 체크리스트 1번 항목.
> 2. **watch_events 영구 보존(환불 기준·회계 근거)의 법적 근거를 개인정보처리방침에 반영** — 정식 판매 전 완료, 원장 법무 항목(코드 아님).
> 3. **에디션 발행 시 판매중 T-PASS 연결 제안**(§⑦ 리스크 4 방어)은 **M2 구현 범위에 포함**(feat-11-002).

---

## ① 현황 점검 — 기존 자산과 접합면

### 이미 있는 것 (재사용/확장)

| 영역 | 기존 자산 | 이번 설계에서의 취급 |
|---|---|---|
| 인증·프로필 | `profiles`(role: student/instructor/manager/admin), 카카오 단일 OAuth, `access_approved_at` 승인제, 셀프탈퇴 대장(`user_withdrawals`) | **그대로 토대.** 신규 테이블의 user FK 전부 `profiles.profile_id` |
| 단일 세션 | `profiles.active_session_id` + `lidam_sid` 쿠키, 60초 하트비트, last-login-wins(학생만) | **중복 로그인 제한(★★★★)의 기반.** 기기 등록 제한은 이 위에 별도 축으로 추가(§3.7) |
| 등급/멤버십 | `getMembershipAccess`(체험/무료/자기학습 subject_code/종합반) SSOT, `cohorts`+`cohort_members`(access_scope) | 학습 콘텐츠 접근은 기존대로. **영상 수강권은 별도 축**(§3.4 결정 근거) |
| 상품 | `subscription_plans`(code, price_krw, duration_days, subject_codes, product_kind: subject/bundle/membership, available_from) | **확장** — product_kind 에 course/tpass/book 추가하는 안 채택(§3.3) |
| 결제 | `payments`(토스 위젯→서버 승인 confirm, toss_payment_key, refund_*, discount_id), `payment_webhook_events`, `billing_keys`(정기결제 자리) | **orders/order_items 로 일반화**하고 payments 는 결제 트랜잭션 레코드로 유지(§3.8) |
| 수강권(플랜) | `user_subscriptions`(started/expires/status/granted_by 수동지급/admin_note), `subscription_admin_logs`(재량 조정 감사) | 플랫폼 구독은 유지. **영상 수강권은 신규 `enrollments`**(구조가 다름 — §3.4) |
| 할인 | `discounts`(정률/정액·기간·조건·쿠폰코드 수준) | 쿠폰 정의부로 확장 + **개인 발급/사용내역은 신규 `user_coupons`**(§3.10) |
| 강사 정산 | `instructor_share_rules`(정률/정액·세대교체), `instructor_settlements(+items)`(월 스냅샷·이중계상 방지·환불 차감) | 정산 단위를 plan → **order_item** 로 확장할 자리만(§3.11) |
| 관리자 권한 | `staff_duty_assignments`(notify형+**access형** — student_admin_access 선례 있음) | **관리자 권한 분리(★★★★★)를 access형 duty 로 확장**(§3.12) |
| CS·감사 | `/admin/users`(회원 검색·승인), `student_notes`(상담 코멘트), `audit_logs`, `user_access_logs`(접속이력), 알림 인프라(`user_notifications`+이메일/알림톡) | CS 화면은 기존 검색·상담에 **`cs_actions` 처리이력**만 추가(§3.13) |
| 학습현황 | `user_problem_attempts` 단일 신호 backbone, `study_sessions`, `user_gamification`, `systematic_nodes`(마스터리·약점 단원) | 시청 진도가 흐를 자리 = §3.14 |
| 이상행동 감지 | `lecture_note_views`(열람 로그+임계 알림, duty 라우팅) | 재생 로그·비정상 접속 감지에 같은 패턴 재사용 |

### 없는 것 (신규 도메인)

**영상/회차/에디션 · 강의(코스) · 도서/재고/배송 · 주문(복합 장바구니) · 무통장 · 영상 수강권(배수/일시정지) · 배수 회계 · 기기 등록 · 재생 판정/토큰 · 시청 기록 · 쿠폰 개인 발급 · 재생 오류 로그.**

> ⚠ 네이밍 충돌 주의: 기존 `lecture_*` 테이블군은 **강의노트(PPTX/PDF) 도메인**이다. 신규 영상 도메인은 `course_* / lesson_* / video_* / watch_*` 접두어를 쓴다.

---

## ② 설계 원칙 (전 모델 공통)

1. **서버 권위**: 재생 판정·배수 차감·수강권 지급/회수·주문 확정은 전부 서버 action. 클라이언트가 보내는 것은 "재생 구간 보고"뿐이며 그것도 검증 대상(§4).
2. **벤더 무관**: DRM 영상 ID(`drm_video_id`)는 불투명 text. 플레이어 호출·재생 토큰·기기 바인딩 API 는 [벤더] 플래그 — 모델은 벤더가 바뀌어도 불변.
3. **파생 vs 저장**: 저장은 이벤트(시청 구간, 차감/복구 원장, 지급/회수, 재고 이동)와 상태(수강권, 주문, 기기)만. 매출 통계·진도율·잔여 배수·재고 현황은 **파생 뷰/집계 쿼리** — 별도 저장 금지.
4. **원장(ledger)은 append-only**: 배수 차감·복구, 재고 이동, 지급/회수는 UPDATE 하지 않고 행 추가. 복구(★★★★)는 반대 부호 행. 감사와 오류 복구가 공짜로 따라온다.
5. **RLS 기존 패턴**: self-read(본인 행), staff 게이트(`private.is_staff`), 쓰기 중 위험한 것은 action 게이트 + adminClient. 원장/이벤트 테이블은 학생 INSERT 금지(서버만).
6. **안전 기본값**: 판매상태 기본 '예정', 미리보기 기본 false, 다운로드 기본 false, 일시정지 기본 불허 — 켜는 것을 명시적으로.

---

## ③ ERD 수준 모델

### 관계 요약 (텍스트 다이어그램)

```
course_series ─┬─< courses(에디션) ─< course_lessons(회차) ─┬─< lesson_videos(영상 슬롯+교체 이력)
               │                                            ├─< lesson_materials(회차 PDF)
               │                                            └─< lesson_node_links >─ systematic_nodes
               │
subscription_plans(product_kind+course/tpass/book) ─┬─< plan_courses >─ courses
                                                    ├── plan_policies(1:1 — 배수·일시정지·기기·다운로드)
                                                    └─< plan_book_links >─ books ─< book_stock_moves
orders ─< order_items(plan|book) ─┬─ payments(토스) / bank_transfers(무통장)
                                  ├─> enrollments(영상 수강권) ─< enrollment_pauses
                                  └─> shipments(도서 배송)
enrollments ─< watch_ledger(배수 원장)          user_devices ─< device_reset_logs
profiles ─< watch_events(구간 보고) ─< watch_positions(이어보기, upsert)
playback_grants(재생 판정 스냅+단기 토큰)        playback_issues(오류 로그) ─< cs_actions(처리 이력)
discounts(쿠폰 정의) ─< user_coupons(발급/사용)
```

---

### 3.1 영상·회차·에디션 (★★★★★)

**course_series** — 강의 시리즈(에디션 무관 정체성. 예: "임병웅 특허법 기본강의")
| 컬럼 | 타입 | 비고 |
|---|---|---|
| series_id | uuid PK | |
| title | text | |
| subject_code | text | 기존 과목 코드 enum 재사용 |
| instructor_id | uuid FK profiles | 대표 강사 |
| created_at/updated_at | timestamptz | |

**courses** — 시리즈의 에디션(연도판). ★플랫폼 고유: 연간 법 개정 전면 재촬영 대응
| 컬럼 | 타입 | 비고 |
|---|---|---|
| course_id | uuid PK | |
| series_id | uuid FK course_series | |
| edition_label | text | "2026판" |
| edition_year | int | 정렬·기본 노출 판정 |
| is_current | boolean | **시리즈당 1개만 true**(partial unique index). 신판 기본 노출 |
| status | enum: draft/published/archived | 구판은 archived 여도 기존 수강권으로 시청 가능 |
| description / thumbnail_path | | |
| created_at/updated_at, deleted_at | | soft delete |

- **에디션 vs 영상 교체 구분**: 회차 유지 소규모 수정본 = `lesson_videos` 교체(아래). 강 구성이 바뀌는 전면 개편 = 새 courses 행(에디션). 구판 enrollments·시청 기록은 구판 course 를 계속 가리켜 **보존**.

**course_lessons** — 회차(1강, 2강…)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| lesson_id | uuid PK | |
| course_id | uuid FK courses | |
| lesson_no | int | 회차 번호. unique(course_id, lesson_no) |
| title | text | |
| sort_order | int | 노출 순서 변경(회차 번호와 분리 — 보강·부록 삽입 대응) |
| instructor_id | uuid FK | 회차별 강사(공동 강의) — null 이면 시리즈 대표 강사 |
| is_preview | boolean | 미리보기(맛보기, ★★★★). **배수 차감 예외의 근거 필드** |
| is_published | boolean | 공개/비공개 |
| staff_memo | text | 영상별 운영 메모(★★) — 학생 비노출(RLS staff read) |
| created_at/updated_at, deleted_at | | |

**lesson_videos** — 회차의 영상 슬롯 + 교체 이력(★★★★). append-only, active 1개
| 컬럼 | 타입 | 비고 |
|---|---|---|
| video_id | uuid PK | |
| lesson_id | uuid FK course_lessons | |
| drm_provider | text | 'kollus' / 'starplayer' … 불투명 [벤더] |
| drm_video_id | text | 외부 콘텐츠 ID — **학생 노출 금지**(§3.6 재생 토큰으로 간접 전달) |
| duration_seconds | int | 재생시간 — **배수 모수**. 등록 시 필수 |
| is_active | boolean | 회차당 active 1개(partial unique). 교체 = 기존 false + 새 행 |
| replaced_reason | text | 교체 사유(오류 수정/화질 개선…) |
| created_by / created_at | | |

- **영상 교체 절차(서버 action 하나로 원자화)**: 새 행 insert + 구 행 `is_active=false`. duration 이 달라지면 배수 모수 변동 → §4.5 조정 이벤트 자동 발행.

**lesson_materials** — 회차별 강의 자료 PDF
| lesson_id FK, title, storage_path, sort_order, is_published, created_at |

- RLS: 자료 열람은 수강권 보유자만(서버 판정 후 signed URL — 강의노트 유출방지 패턴 재사용).

### 3.2 노드↔회차 매핑 (★플랫폼 고유)

**lesson_node_links**
| lesson_id FK course_lessons, node_id FK systematic_nodes, created_by, created_at. PK(lesson_id, node_id) |

- 업로드(회차 등록) 화면에서 입력. 다대다.
- 소비처: "약점 단원 → 그 단원 강의 재수강" 추천(성장 루프, M3+), 학습현황 단원별 시청 집계.
- 런칭 필수 아님 — 그러나 **테이블은 M2 에 같이 생성**(나중에 소급 매핑 비용 큼).

### 3.3 상품 (★★★★★) — 기존 `subscription_plans` 확장 (신규 테이블 아님)

**결정**: 상품은 기존 `subscription_plans` 를 확장한다.
근거: payments.plan_id / user_subscriptions / discounts / instructor_share_rules / 수동지급 로그가 전부 plan 기준으로 이미 배선. 별도 products 테이블을 만들면 결제·할인·정산 파이프가 이중화된다.

**subscription_plans 확장**
| 추가 컬럼 | 비고 |
|---|---|
| product_kind 값 추가 | 기존 subject/bundle/membership + **course**(단과) / **tpass**(기간제) / **book**(도서 단품 판매용 래퍼는 두지 않고 도서는 order_items 에서 직접 books 참조 — 아래 §3.9. 즉 book 값은 예약만) |
| sale_status | enum: scheduled/on_sale/paused/closed/hidden — 판매상태. 기존 is_active 는 hidden 과 중복되므로 sale_status 로 세대교체(is_active 는 파생 호환 유지) |

**plan_courses** — 상품↔강의 연결 (단과=1행, 패키지=N행, T-PASS=대상 집합)
| plan_id FK, course_id FK, PK(plan_id, course_id) |

- T-PASS: `product_kind='tpass'` + plan_courses 로 대상 강의 명시(전 강의 패스는 운영 시 전 course 연결 — "암묵적 전체" 규칙 대신 명시 연결로 정합성 단순화. 신 에디션 발행 시 T-PASS 에 연결하는 운영 절차 1개 추가로 충분).
- 회차↔상품 직접 연결은 두지 않는다 — 상품은 course 단위, 회차는 course 소속. (회차 단위 판매 요구가 생기면 그때 plan_lessons 추가 — YAGNI.)

**plan_policies** — 상품별 수강 정책 (1:1. jsonb 아닌 명시 컬럼 — 서버 판정 로직이 직접 읽는 값이라 스키마로 고정)
| 컬럼 | 비고 |
|---|---|
| plan_id PK FK | |
| duration_days / fixed_end_date | 수강기간: 결제일+N일 **or** 특정일까지(둘 중 하나, CHECK) |
| multiplier | numeric — 수강 배수(1.5/2/3). null=무제한(배수 미적용) |
| pause_allowed | boolean 기본 false |
| pause_total_days / pause_max_count / pause_min_days / pause_max_days | 일시정지 정책(★) |
| allow_pc / allow_mobile | boolean |
| allow_download | boolean 기본 false (★★★★) [벤더 — 다운로드 DRM] |
| max_devices_pc / max_devices_mobile | int 기본 1/1 (★★★★) |
| extension_allowed / extension_products | 수강 연장(★★★★) — 연장 상품(plan) 연결 배열 |

### 3.4 영상 수강권 — **enrollments** (★★★★★, 신규)

**결정**: 기존 `user_subscriptions` 를 확장하지 않고 신규 `enrollments` 를 둔다.
근거: user_subscriptions 는 "플랜 단위 기간제 멤버십"(기간만 있음). 영상 수강권은 **course 단위 + 배수 모수 스냅샷 + 일시정지 + 재생 차단** 등 구조가 다르고, 환불 회수·이관·CS 조정의 단위도 course 다. 하나의 주문에서 두 종류가 같이 지급될 수 있으므로 지급 소스(order_item)만 공유한다.

**enrollments**
| 컬럼 | 비고 |
|---|---|
| enrollment_id | uuid PK |
| user_id FK profiles | |
| course_id FK courses | **에디션 고정** — 구판 수강권 보존의 핵심 |
| plan_id FK subscription_plans | 정책 참조(배수·일시정지·기기) |
| source | enum: order/manual/migration/event — 수동 지급(★★★★★)·lidamedu 이관(M5) |
| order_item_id FK nullable | 결제 지급일 때 |
| granted_by / admin_note | 수동 지급 감사(기존 subscription_admin_logs 패턴 — enrollment_admin_logs 신설) |
| starts_at / expires_at | 지급 시 plan_policies 로 계산해 **저장**(연장·정지로 변하는 상태값) |
| multiplier_snapshot | numeric — 지급 시점 정책 스냅샷 |
| base_duration_snapshot_seconds | int — **지급 시점의 course 총 재생시간 합** 스냅샷. 허용 시청량 = base×multiplier. 영상 교체·회차 추가로 모수가 변하면 §4.5 조정 이벤트로만 갱신(자동 재계산 금지 — 회계 안정성) |
| status | enum: active/paused/expired/revoked |
| revoked_at / revoke_reason | 환불·취소 회수 |
| blocked_lesson_ids | uuid[] — 특정 강의(회차) 재생 차단(★★★★). 기본 [] |
| created_at/updated_at | |

**enrollment_pauses** — 일시정지 이력(★)
| pause_id PK, enrollment_id FK, requested_by(본인/관리자), starts_on, ends_on, days, resumed_at, is_admin_exception boolean, note, created_at |

- 적용 시 `enrollments.expires_at += days`, status=paused → 재개 시 active. 남은 일수/횟수 = 정책 − 이력 합(**파생**).
- 회원 신청은 정책 범위 검증(action), 관리자는 예외 허용(is_admin_exception).

**enrollment_admin_logs** — 기간 수정·연장(+7/15/30)·회수·차단·배수 조정의 감사 로그
| log_id PK, enrollment_id FK, actor_id, action, before jsonb, after jsonb, reason(필수), created_at |

### 3.5 재생 판정 (★★★★★ 서버 권위)

재생 클릭 → 서버 action 한 곳에서 판정 → 통과 시 **playback_grants** 발급 → [벤더] 플레이어 호출.

판정 순서(모두 서버):
1. 로그인 (`is_preview=true` 회차는 예외 — 비로그인 맛보기 허용)
2. 수강권: 해당 lesson 의 course 에 active enrollment 존재 (+ blocked_lesson_ids 미포함)
3. 기간: now < expires_at, status=active(paused 면 거부)
4. 배수: 잔여 시청량 > 0 (§4 파생 계산)
5. 기기: 요청 기기가 등록 기기인지(§3.7) (★★★★)
6. 중복 로그인: 기존 single-session 체계 그대로(★★★★)
7. (★★★) IP 제한: user_access_logs 기반 동시 IP 룰 — M3 플래그

**playback_grants** — 판정 스냅 + 단기 토큰
| grant_id PK, user_id, enrollment_id nullable(맛보기 null), lesson_id, video_id, device_id, granted_at, expires_at(수 분), client_ip, user_agent |

- 클라이언트에는 grant_id(불투명 토큰)만 전달 — **drm_video_id 를 학생에게 직접 노출하지 않는다**(★★). [벤더] 토큰 교환(콜러스 서명 URL 등)은 서버→벤더로 grant 검증 후 수행.
- 시청 구간 보고(§4)는 유효한 grant 를 요구 → 위조 보고 차단.
- 캡처/녹화 차단(★★★)은 DRM 플레이어 설정 — 모델 무관, [벤더] 체크리스트로만 관리.

### 3.6 시청 기록 (★★★★★) — §4 배수 회계와 한 몸

**watch_events** — 구간 보고 원본(append-only, 서버만 INSERT)
| 컬럼 | 비고 |
|---|---|
| event_id | bigint identity PK |
| grant_id FK playback_grants | 판정 스냅 연결(수강권·기기·IP 역추적) |
| user_id / enrollment_id(null=맛보기·무료) / lesson_id / video_id | 비정규화 조회 키 |
| from_seconds / to_seconds | 영상 내 구간 [from, to) |
| reported_at | |
| client_seq | int — 클라 보고 순번(멱등 키: grant_id+client_seq unique) |

**watch_positions** — 이어보기(★★★★★, upsert 상태)
| PK(user_id, lesson_id), video_id, position_seconds, updated_at |

**파생(저장 금지)**:
- 회차 진도율 = 시청 구간 병합 길이 / duration (구간 union — 반복 시청 중복 제외)
- 강의(course) 진도율 = 회차 진도율 평균 또는 시청시간 가중
- 완강(★★★★) = 전 회차 진도율 ≥ 임계(기본 90%, 정책 상수)
- 최초/마지막 재생일(★★★★, 환불 기준) = watch_events min/max(reported_at) — **환불 판정 근거라 이벤트 원본 영구 보존**

### 3.7 기기 관리 (★★★★)

**user_devices**
| device_id PK, user_id FK, kind enum(pc/mobile/tablet), device_fingerprint text [벤더 — DRM 플레이어 기기 ID 활용 가능], device_name, registered_at, last_seen_at, revoked_at, revoked_by(본인/관리자/자동) |

**device_reset_logs** — 초기화 이력(★★★★★ CS 최다)
| log_id PK, user_id, device_id, actor_id(본인 셀프/관리자), reason, created_at |

- 정책: plan_policies.max_devices_pc/mobile. 변경 횟수 제한(월 1회 등 ★★★)= reset_logs 카운트로 파생 판정, 관리자 강제 초기화는 제한 무시.
- 비정상 접속(★★): user_access_logs + watch_events 의 IP·기기 산포 감지 — lecture_note_views 임계 알림 패턴 재사용, duty 라우팅(`lecture_abuse_alert` 유사 duty 추가).
- 기존 단일 세션(중복 로그인 차단)과의 관계: **세션 축(동시 1로그인)과 기기 축(등록 기기 화이트리스트)은 독립** — 세션은 기존 그대로, 기기는 재생 판정 5번에서만 검사.

### 3.8 주문·결제 (★★★★★) — payments 를 orders 로 일반화

**결정**: 복합 주문(강의+교재 함께 구매, 부분 환불)을 위해 `orders/order_items` 를 신설하고, 기존 `payments` 는 "결제 트랜잭션"으로 유지·연결한다(토스 승인 파이프 재사용). 기존 플랜 단건 결제는 1-item 주문으로 수렴(마이그레이션은 M4).

**orders**
| order_id PK, user_id, status enum(draft/pending_payment/pending_deposit/paid/partially_refunded/refunded/cancelled), total_krw, discount_id / user_coupon_id nullable, payment_method enum(toss/bank_transfer/free/manual), created_at/updated_at |

**order_items**
| order_item_id PK, order_id FK, item_type enum(plan/book), plan_id nullable / book_id nullable (CHECK 택1), quantity(도서만 >1), unit_price_krw, refunded_at / refund_amount_krw / refund_reason — **부분 환불(★★★★)은 항목 단위** |

- **지급/회수 자동화(서버 권위)**: 주문 paid 전이 → item_type=plan 이면 enrollments(또는 user_subscriptions) 지급, book 이면 shipments 생성+재고 차감. 환불 전이 → 해당 item 의 enrollment revoke / 재고 복원. 전이는 전부 한 서버 action(또는 webhook 핸들러) — 주문별 지급/회수 내역은 enrollment_admin_logs + book_stock_moves 로 추적.
- **토스**: 기존 위젯→서버 confirm 흐름 그대로, payments.order_id 추가.
- **★무통장**: **bank_transfers** | transfer_id PK, order_id FK, depositor_name, expected_amount, deposited_at nullable, confirmed_by nullable, expires_at(입금 기한), memo | — 흐름: 주문 pending_deposit → 관리자 입금 확인(confirmed_by) → paid 전이 → 자동 지급. 기한 초과 자동 취소는 cron.
- 환불 판정 참고 데이터: watch_events 최초 재생일·누적 시청(§3.6) — 화면에서 제시(정책 자동화는 하지 않음, 운영 판단).

### 3.9 도서몰 (★★★★★, 본격)

**books**
| book_id PK, title, author, publisher, price_krw, sale_status enum(scheduled/on_sale/paused/closed/hidden), cover_path, description, isbn nullable, created_at/updated_at, deleted_at |

**book_stock_moves** — 재고 원장(append-only. 재고 현황 = SUM 파생)
| move_id PK, book_id FK, delta int(+입고/−판매/−파손/+환불복원), reason enum(inbound/sale/refund/adjust), order_item_id nullable, actor_id, created_at |

**plan_book_links** — 강의 상품↔교재 연결(결제 화면 함께 구매 유도)
| plan_id FK, book_id FK, requirement enum(required/optional), PK(plan_id, book_id) |

**shipments** — 배송(★★★★★)
| shipment_id PK, order_item_id FK(book 항목), status enum(preparing/shipped/delivered/returned), courier text(택배사), tracking_no text(송장), shipped_at/delivered_at, address jsonb(주문 시점 스냅샷), created_at/updated_at |

- 마이페이지 즉시 반영: shipments 를 본인 RLS self-read — 관리자 갱신이 곧 사용자 화면.
- 도서 주문 분리 조회 = order_items.item_type='book' 필터(파생). 도서 매출 통계 = §3.11 파생 뷰.

### 3.10 쿠폰 (★★★★~★★★★★)

- **정의부 = 기존 `discounts` 확장**: 정액/정률·기간 제한은 이미 있음. 추가: 대상 제한(특정 plan/과목), 발급 방식(code_shared: 코드 공유형 / issued: 개인 발급형), 1인 1회 제한.
- **user_coupons** (신규 — 개인 발급/사용 내역)
| user_coupon_id PK, user_id, discount_id FK, issued_at, issued_reason enum(signup/first_purchase/admin/event ★★★★ 자동 발급), expires_at, used_at nullable, order_id nullable |
- 자동 발급 = 가입/첫 구매 트리거 지점에 서버 훅(이벤트 발생 지점은 M4 확정).

### 3.11 통계·정산 (★★★★~★★★★★) — 전부 파생

- 매출 일/월/과정/도서: `orders/order_items` 집계 뷰(`v_sales_daily`, `v_sales_by_plan`, `v_sales_books`). **저장 아님**.
- 환불·주문항목 통계(★★★★): order_items refund 필드 집계.
- 강사 정산(★★★★): 기존 instructor_share_rules/settlements 유지하되 정산 원천을 payments 단건 → **order_item 단위**로 확장(기존 "월 스냅샷·이중계상 방지·환불 차감" 로직 재사용). course 상품의 귀속 강사 = course_series.instructor_id(회차별 강사 배분은 2차).
- 진도율·완강·배수 잔여: §3.6/§4 파생.

### 3.12 보안·관리자 권한 (★★~★★★★★)

- **관리자 권한 분리(★★★★★)**: 역할 4종(최고/운영/CS/강사)을 새 role enum 으로 만들지 않는다 — 기존 role(admin/manager/instructor) + **staff_duty_assignments access형 duty 확장**으로 메뉴 접근 제한. 신규 duty(예): `lms_video_admin`(영상/상품 등록), `lms_cs`(수강권·기기·배수 CS), `lms_orders_admin`(주문·환불·배송), `lms_stats_view`(통계 열람). 강사용 관리자(본인 강의 한정 뷰, ★★ 축소)는 instructor role + course_series.instructor_id 필터로 자리만.
- 영상 ID 노출 최소화·재생 임시 토큰(★★): §3.5 playback_grants. URL 복사 방지는 grant 만료(수 분)+1회성.
- 접속 로그·비정상 차단(★★★★): user_access_logs(기존) + watch_events 산포 감지(§3.7).

### 3.13 장애 대응·CS (★★~★★★★★)

**playback_issues** — 재생 오류 로그(★★~★★★)
| issue_id PK, user_id nullable, grant_id nullable, lesson_id/video_id, error_code text(DRM 오류코드 [벤더]), client_env jsonb(UA·OS·네트워크), message, created_at |

**cs_actions** — 처리 이력(★★★★, 모든 CS 조치의 공통 원장)
| action_id PK, user_id(대상 회원), actor_id(처리 스태프), kind enum(device_reset/multiplier_credit/period_extend/enrollment_block/enrollment_grant/refund_assist/memo), ref_table/ref_id(연결: enrollment/device/ledger 행), note, created_at |

- 보상 처리(배수 복구·기간 연장 ★★★★)는 각 도메인 원장에 행을 만들고 cs_actions 가 그 행을 참조 — 이력 한 화면 조회.
- 상담 메모는 기존 `student_notes` 연계(kind=memo 는 student_notes 로 위임하고 cs_actions 에는 참조만 — 이중 저장 금지).
- CS 회원 검색 = 기존 /admin/users(이름/전화/이메일) + 주문번호 검색 추가.

### 3.14 학습현황 연계 (★플랫폼 고유, M3+)

- 시청 진도 신호의 자리: `watch_events` → (파생) 회차 진도 → **lesson_node_links 로 단원(노드)별 시청 집계** → 학습현황(/study/stats) "강의 시청" 카드, 종합반 관리자 개별 학생 뷰의 시청 열.
- 원칙: user_problem_attempts 가 문제 신호의 backbone 이듯, watch_events 가 시청 신호의 단일 원천. 별도 요약 테이블 저장 없이 뷰로 시작(성능 이슈 확인 후에만 materialized 검토).
- 약점 루프: 약점 단원(마스터리) → lesson_node_links 역방향 → "이 단원 강의 다시 보기" CTA.

### 3.15 2차 — 자리만 (★★★)

- **정기구독**: billing_keys(기존) + orders.payment_method 확장 + plan.product_kind='membership' 재사용 — 신규 테이블 불요, 해지/재개는 user_subscriptions.auto_renew(기존 컬럼 있음).
- **후기**: reviews | review_id PK, user_id, course_id, rating int 1~5, body, created_at/updated_at, deleted_at | — 작성 자격 = enrollment 보유(파생 검증). 테이블 정의만 예약, M2~M4 범위 외.

---

## ④ ★배수 회계 — 이벤트 모델 상세 (설계 난도 최고)

### 4.1 원칙

- **시청 시간은 클라 자기신고를 그대로 믿지 않는다.** 클라는 "구간 보고"만 하고, 서버가 검증·정규화해 원장에 기록한다.
- **원장(watch_ledger)은 append-only.** 차감도 복구도 조정도 전부 행 추가. 잔여 = 허용량 − SUM(원장). UPDATE/DELETE 없음 → 어떤 오차감도 사후 복구 가능.
- 이벤트 원본(watch_events)과 회계 원장(watch_ledger)을 분리 — 원본은 재계산·감사용, 원장은 판정용.

### 4.2 watch_ledger (append-only, 서버만 INSERT)

| 컬럼 | 비고 |
|---|---|
| ledger_id | bigint identity PK |
| enrollment_id FK | 배수는 수강권 단위 회계 |
| lesson_id / video_id | 회차별 조정(★★) 근거 |
| kind | enum: **debit**(차감) / **credit**(복구·보상) / **adjust**(모수 변경 보정) / **reset**(관리자 초기화 — 잔여를 허용량으로 되돌리는 상쇄 행) |
| seconds | int — debit 양수, credit/reset 음수 관례(SUM 하나로 잔여 계산) |
| source_event_id FK watch_events nullable | debit 의 근거 구간 |
| reason / actor_id | credit/adjust/reset 은 사유·처리자 필수 |
| created_at | |

**잔여 시청량(파생)** = `enrollments.base_duration_snapshot_seconds × multiplier_snapshot − SUM(ledger.seconds)`
회원별 사용/잔여 조회·관리자 화면 전부 이 식 하나(뷰 `v_enrollment_watch_balance`).

### 4.3 차감 파이프라인 (하트비트/구간 보고)

1. 재생 시작 = playback_grant 발급(§3.5). 클라 플레이어는 **15~30초 주기 하트비트**로 `(grant_id, client_seq, from, to)` 구간 보고.
2. 서버 검증: grant 유효(만료·본인·기기) → 구간 정합(`0 ≤ from < to ≤ duration`, 길이 ≤ 하트비트 주기×배속 상한(예: 2배속이면 60초 보고 상한 120초)) → 멱등(grant_id+client_seq unique — 재전송 중복 차감 방지).
3. watch_events insert + **watch_ledger debit insert** (같은 트랜잭션). 차감량 = 보고 구간 길이(배속 시청도 실시청 시간 기준 — 콜러스 등 플레이어 실재생 시간 콜백 [벤더] 확정 시 그 값으로 대체 가능하도록 seconds 의미를 "실재생 초"로 정의).
4. **차감 예외(★★★★)**: `is_preview=true` 회차 / enrollment_id null(무료·맛보기) → watch_events 는 기록(진도·이어보기용), ledger 는 기록하지 않음.
5. 잔여 ≤ 0 이면 다음 grant 거부(재생 중 세션은 자연 종료 — 초단위 강제 킥은 하지 않음: 오차 수십 초 허용이 CS 비용보다 싸다).

### 4.4 복구·초기화 (★★★★)

- **버퍼링/플레이어 오류 오차감**: CS 가 watch_events 로 해당 구간 확인 → `credit` 행(음수) + cs_actions 참조. 원본 이벤트가 남아 있어 근거 제시 가능.
- **관리자 초기화**: `reset` 행 1개(현재 SUM 을 0 으로 만드는 상쇄값) — 이력 보존한 채 잔여 원복.
- 회차별 조정(★★): lesson_id 를 지정한 credit/adjust.

### 4.5 모수 변경 (영상 교체·회차 추가·에디션)

- 영상 교체로 duration 변경 / 회차 추가·삭제 → course 총 시간이 변한다. enrollments 의 `base_duration_snapshot_seconds` 는 **자동 재계산하지 않는다**(소급 회계 붕괴).
- 대신 교체 action 이 **adjust 이벤트를 발행할지 관리자에게 제안**(diff 초 × 배수): 승인 시 각 active enrollment 에 adjust 행 + snapshot 갱신을 한 트랜잭션으로. 이 절차 자체가 enrollment_admin_logs 에 남는다.
- 에디션(전면 개편)은 새 course = 새 수강권이므로 모수 문제가 아예 없다 — 에디션 설계가 배수 회계를 단순하게 만드는 이유.

### 4.6 왜 이 모델인가 (검토한 대안)

- ~~enrollments.used_seconds 컬럼 UPDATE 누적~~ → 오차감 복구·감사 불가, 동시 하트비트 race. 기각.
- ~~시청 세션 종료 시 일괄 정산~~ → 탭 강제 종료·모바일 백그라운드에서 유실. 주기 보고가 유실 최소.
- ~~클라 누적치 신고~~ → 위변조. 구간 보고+서버 검증+grant 바인딩. 기각.

---

## ⑤ RLS 개요

| 테이블군 | SELECT | INSERT/UPDATE |
|---|---|---|
| course_series/courses/lessons(published) | 공개(목록·미리보기 노출) — staff_memo 컬럼은 staff 전용 뷰 분리 | staff(access duty) |
| lesson_videos(drm_video_id) | **학생 불가** — 서버(playback grant)만 | staff |
| enrollments/pauses/watch_positions | 본인 + staff | 서버 action(RLS 아닌 action 게이트, 지급·정지는 adminClient) |
| watch_events/watch_ledger/playback_grants | 본인 read + staff | **서버만**(service_role) — 학생 직접 INSERT 금지 |
| orders/order_items/shipments/bank_transfers/user_coupons | 본인 + staff | 생성은 본인(draft), 상태 전이는 서버 |
| books(판매중) | 공개 | staff |
| book_stock_moves/cs_actions/playback_issues/각종 admin_logs | staff | 서버/staff |

---

## ⑥ 단계 계획 (★우선순위 정렬)

### M2 — 시청 골격 (★★★★★ 코어만)
- 모델: course_series/courses/course_lessons/lesson_videos/lesson_materials + **lesson_node_links**(빈 채로라도) + subscription_plans 확장(product_kind course/tpass, sale_status)+plan_courses+plan_policies + enrollments(+admin_logs).
- 기능: staff 등록 화면(시리즈→에디션→회차→영상 ID·재생시간·순서·미리보기·공개), 수강권 **수동 지급**, 재생 판정(로그인→수강권→기간) + playback_grants, 미리보기 재생. [벤더] DRM 임베드는 벤더 확정 후 배선(판정 API 는 벤더 무관으로 먼저).
- 이 시점 배수·기기 판정은 "정책 저장만, 판정 스킵" 플래그.

### M3 — 기록·배수·기기 (★★★★★ 난점)
- watch_events/watch_positions/watch_ledger + 하트비트 파이프 + 진도율·완강·이어보기 + **배수 회계 전체(§4 — 차감·예외·credit/reset·조정)** + user_devices/device_reset_logs(등록·본인 초기화·관리자 강제) + enrollment_pauses(신청·승인·정책 검증).
- 학습현황 연계 1차: /study/stats 시청 카드 + 종합반 관리자 뷰 시청 열(파생 뷰).
- [벤더] 기기 fingerprint·실재생 콜백·다운로드 DRM.

### M4 — 결제·커머스 (★★★★★)
- orders/order_items + payments.order_id(기존 토스 confirm 재사용) + **자동 지급/회수·부분 환불** + bank_transfers(무통장 수동 승인) + books/book_stock_moves/plan_book_links/shipments(도서몰 전체) + discounts 확장+user_coupons(자동 발급 포함) + CS 화면(cs_actions·playback_issues·주문번호 검색) + 통계 파생 뷰(매출 일/월/과정/도서·환불) + 정산 order_item 확장 + access duty 4종.

### M5 — 이관·전환
- lidamedu 구매자 수강권 이관 = enrollments source='migration' 벌크(수동 지급 파이프 재사용, dry-run→승인) · 병행 운영 · 탈퇴/정리.

### 범위 표식
- ★★★(정기구독·후기): §3.15 자리만 — 이번 마일스톤 구현 없음.
- ★★(강사용 관리자 본인 뷰·오류 로그 상세·비정상 접속 고도화): 축소 — 모델 자리만.
- [벤더] 의존 목록: DRM 임베드/재생 토큰 교환·실재생 시간 콜백·다운로드·기기 fingerprint·캡처 차단 설정. **모델은 전부 벤더 무관.**

---

## ⑦ 설계 난점·리스크 요약

1. **배수 회계(§4)** — 최대 난점. append-only 원장 + 구간 보고 검증 + 멱등 키가 핵심. "정확한 실시간 차단"보다 "복구 가능한 근사"를 선택(오차 수십 초 허용).
2. **주문 일반화(§3.8)** — 기존 payments 단건 파이프와의 공존 기간(M4) 동안 이중 경로 금지: plan 단건 결제도 M4 부터 1-item 주문으로만 생성(뮤테이션 경로 동결 원칙).
3. **에디션 vs 영상 교체** — 운영 혼동 위험. 등록 화면에서 "수정본 교체(회차 유지)"와 "새 연도판 발행"을 별개 버튼·별개 절차로.
4. **T-PASS 신 에디션 연결 누락** — 명시 연결 방식의 대가. 에디션 발행 체크리스트에 "판매중 T-PASS 연결" 포함(발행 action 이 대상 T-PASS 를 제안).
5. **모수 스냅샷과 조정(§4.5)** — 자동 재계산 금지 + 관리자 승인 조정. 놓치면 배수 불공정 CS — 교체 action 이 강제로 제안 다이얼로그를 띄우는 UX 로 방어.
6. **기존 user_subscriptions 와 enrollments 이원화** — 마이페이지·admin 화면에서 "내 수강" 통합 뷰 필요(파생 union). 모델 통합은 하지 않는다(구조가 다름).
