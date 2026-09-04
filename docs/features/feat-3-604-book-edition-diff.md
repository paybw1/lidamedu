# feat-3-604 — 판 대조: 인쇄본 PDF ↔ 개정중 원고 HWPX

인쇄되어 나간 책과 다음 판을 위해 고치고 있는 원고를 글자 단위로 맞춰 **추록·정오표 후보**를
쪽수와 함께 뽑고, 원장이 건별로 판정해 **기존 추록·정오표 시트**에 실는다.

- 대상 1호: `리담특허법[제25판].pdf` ↔ `리담특허법[제25판]_개정중.hwpx`
- 상태: S1·S2·S3 완료. 발행 버튼을 누르는 것은 원장의 몫이다(아래 §6).

## 1. 왜 만들었나

원장이 다음 판 원고를 고치는 동안, 이미 책을 산 수험생은 옛 판으로 공부한다. 무엇이 어떻게
바뀌었는지는 원고를 쓴 사람 머릿속에만 있었고, 손으로 추록을 만들려면 1,200쪽을 다시 읽어야 했다.

## 2. 단계

| 단계 | 내용 | 산출 |
|---|---|---|
| S1 | 글 대조 — 본문/각주/표 칸/도형을 갈라 맞춘다 | `changes.{csv,html,json}` |
| S2 | 오탐 걷어내기 + 도해 목록 대조 + 구판 쪽 렌더 | 확신 3등급 · 도해 diff · `pages/*.png` |
| S3 | 후보를 DB 에 올리고 원장이 판정 → 추록·정오표 시트로 발행 | `/admin/book-diff` |

## 3. 도구

```bash
node scripts/errata/compare-book-editions.mjs                # 대조 (기본: 리담특허법 25판)
node scripts/errata/compare-book-editions.mjs --fresh        # PDF 추출 캐시 무시
node scripts/errata/ingest-book-diff.mjs                     # 후보 적재 — 예행
node scripts/errata/ingest-book-diff.mjs --commit            # 후보 적재 — 반영
```

규칙은 두 모듈이 단일 소유한다 — `lib/book-diff.mjs`(글)·`lib/book-figures.mjs`(도해).
CLI 는 분류·짝짓기·출력만 한다.

### 대조가 서는 근거 (리담특허법 25판 실측)

| | 신판 조각 | 구판에서 같은 순서로 찾음 |
|---|---|---|
| 본문 | 8,479 | 99.8% |
| 각주 | 2,057 | 98.9% |
| 표 칸 | 2,574 | 97.9% |

→ 볼 것 130건 / 86쪽 (자리만 옮긴 76건은 접어 둠).

## 4. 밟은 함정 (규칙으로 굳혔다)

1. **각주를 본문에 섞으면 무너진다.** HWPX 각주(`hp:footNote`)는 본문 문장 한가운데 끼어 있다.
   섞은 채 재면 본문 일치율이 84% 로 떨어진다 → body/note/table/shape 버킷 분리.
2. **색인표시(`hp:indexmark`)는 화면에 없는 글**인데 `hp:t` 밖에 있다 → 글자는 `hp:t` 안에서만 읽는다.
3. **PDF 는 각주가 본문보다 앞 순서로 나오는 쪽이 있다** → 글자 크기로 두 흐름을 가른다(본문 9.8/각주 8.0).
4. **쪽을 넘는 각주는 PDF 에서 토막나 있다** → 앵커에서 토막 내어 이어 덮는다(삭제 오탐 156→87).
5. **각주와 표 칸은 한 흐름을 나눠 쓴다** → 덮개를 따로 재면 서로를 구멍으로 본다(49% 오탐).
6. **각주 서술을 본문으로 올린 곳이 있다**(p.92) → 짝짓기는 버킷을 가로질러.
7. **재확인은 짝짓기 뒤에.** 먼저 하면 6번이 "이동" 으로 깎여 짝을 만나지 못한다.
8. **인쇄본 덩이는 줄을 이어 붙인다.** 줄바꿈은 문장 경계가 아니다 — 끊으면 멀쩡한 글을 "없다" 고 한다.
9. **도해는 번호가 아니라 제목으로 맞춘다.** 원고 캡션 번호는 자동 생성이라 하나만 끼워도 뒤가 밀린다.

## 5. 못 잡는 것

- 그림·도해 **이미지 교체** — 도해는 도형+글자라 글자는 읽히지만 순서가 뒤바뀌어 판정이 안 선다.
  그래서 표·도해 후보가 걸린 **구판 쪽을 PNG 로 떠서** 옆에 건다(mupdf).
- **서식만 바뀐 것**(밑줄·굵게), 표의 행·열 재배치.
- ★「나란히」는 **구판 그림 ↔ 신판 글자**다. 원고(HWPX)는 한글 없이 렌더할 수 없다.
- ★쪽 그림은 **로컬 `changes.html` 에만** 있다(운영 화면은 `tmp/` 를 못 본다). 표·도해 판정은
  로컬 화면을 옆에 띄워 놓고 한다.

## 6. S3 — 검수와 발행

### 6.1 어디에 실리나

기존 추록·정오표 시스템에 그대로 합류한다. **새 발행 경로를 만들지 않는다.**

```
book_diff_candidates ──판정──▶ fn_publish_book_errata
                                   │
                                   ├─ publication_content_map (theory, page_no)
                                   └─ content_revisions (메타 행) ──▶ fn_publish_errata
                                                                          │
                                                              v_errata_sheet ──▶ 시트 PDF
                                                                          └──▶ /study/errata
```

- `content_type='theory'` — CHECK 에 이미 있으나 쓰인 적 없다(Phase 0 이 "교재 서술은 플랫폼에
  마스터가 없다" 며 미뤄 둔 자리). 판 대조 항목이 그 첫 사용처다.
- **메타 행 패턴은 기존 선례를 따른다** — 교재 오기 정오표 1·2호가 같은 방식이었다.
  `op` 는 변경 종류대로, 스냅샷은 null, `apply_status='skipped'`(플랫폼 콘텐츠는 안 바뀐다),
  `merge_status='pending'`(차기 판 정정 대상), `app_name='book_diff'`.
- 쪽수는 `publication_content_map.page_no` 로 넣는다. 시트 뷰가 여기서 쪽을 읽는다.

### 6.2 판정

| 판정 | 뜻 | 발행 |
|---|---|---|
| `pending` | 아직 안 봄 | — |
| `errata` | 정오표 — 옛 판이 틀렸다 | `errata_kind='typo'` |
| `addendum` | 추록 — 법·판례가 바뀌어 보탤 것 | `errata_kind='addendum'` |
| `next_edition` | 다음 판에서만 반영할 다듬기 | 안 함 |
| `not_a_change` | 대조 오탐 | 안 함 |

발행할 때 `errata_kind`·심각도는 원장이 바꿀 수 있다(법령개정·판례변경 등).

### 6.3 다시 적재해도 판정이 살아남는다

원고는 **움직이는 표적**이다. 고칠 때마다 다시 돌리게 되므로:

- 후보는 `(edition_id, fingerprint)` 로 멱등 upsert 한다. fingerprint = 쪽·구분·변경 전후 글의 해시.
- 이번 판에 안 나온 옛 후보는 **지우지 않고** `status='superseded'` 로 내린다.
  ★지우면 원장이 찍어 둔 판정이 원고 한 번 고칠 때마다 증발한다(feat-2-037 의 `excluded_at` 과 같은 이유).
- 이미 발행된 후보(`published_revision_id`)는 판정·발행 기록을 그대로 둔다.

### 6.4 권한

- `book_diff_candidates` RLS = staff SELECT/UPDATE. **INSERT/DELETE 정책 없음** — 적재는
  service_role 스크립트만(`dohae_blank_terms` 선례).
- 발행 = `fn_publish_book_errata`(SECURITY DEFINER) 안에서 `private.is_publisher(auth.uid())`.
  강사는 판정까지, 발행은 원장·관리자.
  ★`content_revisions` 에는 staff INSERT 정책이 없다(트리거만 넣던 테이블이다). 그래서 화면
  액션이 직접 insert 하면 42501 이다 — RPC 를 거치는 이유.

### 6.5 화면

`/admin/book-diff` — 판본 선택 · 확신/구분/판정 필터 · 건별 판정 · 고른 건 묶어 발행.
쪽 그림은 로컬 `changes.html` 을 쓴다(§5).

## 7. 남은 것

- 쪽 그림을 Storage 에 올려 검수 화면에서 바로 보기.
- 상표법·디자인보호법 등 다른 책으로 확장(도구는 책 이름만 바꾸면 된다).
