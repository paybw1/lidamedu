# feat-000-016 — 단일 세션 강제 (중복 로그인 차단)

## 목적
한 계정(ID)으로 **동시에 여러 곳에서 접속**하는 것을 차단한다. 결제 학생 계정의 공유를
막는 것이 1차 목적. JWT는 무상태라 발급 후 만료까지 유효하므로, 토큰 유효성에 기대지 않고
**매 요청 서버 권위 비교**로 즉시 차단한다.

## 메커니즘 (last-login-wins)
계정당 "현재 유효 세션 ID" 1개만 유효하게 두고, **새 로그인이 이를 갈아치운다**. 이전 기기는
다음 요청에서 무효화된다.

1. **DB**: `profiles.active_session_id`(서버 생성 UUID) — 현재 유효 세션. 한 계정당 1개.
2. **쿠키**: `lidam_sid`(httpOnly, prod secure, sameSite=lax, 400일) — 이 브라우저의 세션 ID.
3. **비교**: `private.layout` loader가 매 요청에서 `쿠키 sid === DB active_session_id` 확인.
   불일치(=다른 곳에서 더 새 로그인) → 이 기기만 로그아웃(`signOut({scope:"local"})`) +
   `lidam_sid` 만료 → `/login?reason=other-device`.

```
기기 A 로그인 → claim sid=A (DB=A, 쿠키 A)
기기 B 로그인 → claim sid=B (DB=B, 쿠키 B)   // A 덮어씀
기기 A 다음 요청 → 쿠키(A) ≠ DB(B) → A 추방
```

- **같은 브라우저 다중 탭/창**: 쿠키 동일 → sid 동일 → 정상(재로그인 안 일어남).
- **다른 기기/브라우저**: 새 로그인이 sid 갱신 → 이전 기기 추방 = 중복접속 차단.
- 추방은 `scope:"local"`(이 기기 세션만 종료) — **새 기기 세션은 건드리지 않는다**.

## 정책 (결정 사항)
- **신규 로그인 우선(last-login-wins)** — 새 로그인이 이전 기기를 추방. (first-wins 잠금보다 문의↓)
- **강제 대상 = 학생(student)만** — instructor/manager/admin은 다기기 작업이 정상이라 면제.
  (claim 자체는 전원 수행하나, 검사는 학생만.)
- **동시 허용 = 1**. (추후 N기기 허용은 `active_session_id` 단일 컬럼 → N행 테이블 확장.)

## 데이터 / 코드
| 위치 | 내용 |
|---|---|
| `scripts/sql/20260627_single_session.sql` | `profiles`에 `active_session_id`·`active_session_at`·`active_session_device`(전부 nullable) + RPC `claim_session(p_sid,p_device)`·`release_session()` (SECURITY DEFINER, `auth.uid()` 스코프). 운영(mcgdoplo) 적용 완료. |
| `app/core/lib/single-session.server.ts` | 쿠키 정의 + `claimSession`/`releaseSession`/`enforceSingleSession`/`deviceLabelFrom`/`readSessionId`. |
| `app/features/auth/screens/social/complete.tsx` | 카카오 OAuth 성공 후 `claimSession`(유일 실로그인 경로). |
| `app/core/layouts/private.layout.tsx` | `enforceSingleSession`(consent 검사 전). |
| `app/features/auth/screens/logout.tsx` | `releaseSession`(signOut 전). |
| `app/features/auth/screens/login.tsx` | `?reason=other-device` 안내 배너. |

- `active_session_id`는 **클라이언트로 내려보내지 않는다**(서버에서만 비교). 추측 불가 UUID라
  미서명 쿠키여도 위조 불가. `SESSION_COOKIE_SECRET`(env) 설정 시 HMAC 서명 추가(선택).

## 무중단 롤아웃
새 컬럼 nullable → 기존 사용자 `active_session_id=NULL` = 검사 통과(추방 없음). 강제는
**각자 다음 로그인부터** 자연 적용. 마이그레이션은 코드가 RPC를 호출하기 전엔 inert → 먼저
적용해도 운영 무영향.

## 2단계 (적용 완료 — 0220898)
- **① 유휴 하트비트**: `SessionHeartbeat`(`app/core/components/session-heartbeat.tsx`, private.layout 마운트)가 60초 + 탭 복귀 시 `/api/session/heartbeat` 폴 → superseded면 `reload` → 레이아웃 `enforceSingleSession`이 추방. 유휴(내비 없는) 기기도 ~1분 내 추방.
- **② API action 차단**: `requireAuthentication(client, request?)` — request 전달 시 밀려난 세션이면 401. 민감 계정 API 5곳(change-email/password, delete-account, connect/disconnect-provider) 적용.
- **③ 이전 기기 토큰 폐기**: `complete.tsx`에서 `signOut({scope:"others"})`로 다른 기기 refresh 토큰 폐기. `others`는 로컬(현재) 세션을 제거하지 않음(auth-js 소스 확인) — 방어적 try/catch.
- 공유 판정은 `isSessionSuperseded`로 추출(enforce/heartbeat/guard 공유).

## 한계
- "결심한 공유"(추방마다 서로 재로그인 핑퐁)는 못 막으나, **실시간 동시 사용 불가** = 목적 달성.

## 검증
- **로컬/데스크톱**: 브라우저 2개(또는 시크릿)로 같은 계정 로그인 → 먼저 로그인한 쪽이 다음
  내비게이션에서 `/login?reason=other-device`로 추방되는지. 같은 브라우저 새 탭은 유지되는지.
  staff 계정은 추방 안 되는지. typecheck 통과(완료).
- **실기기(사용자)**: PC ↔ 모바일 같은 계정 로그인 → 이전 기기 추방·안내 표시 확인.

## 롤백
- 코드: 해당 커밋 revert(컬럼/RPC는 남아도 무해).
- 강제 일시 해제: `enforceSingleSession` 호출 1줄 제거(데이터 유지).
