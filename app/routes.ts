import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  route("/robots.txt", "core/screens/robots.ts"),
  route("/sitemap.xml", "core/screens/sitemap.ts"),
  // feat-13 수강증명서 인쇄 — 독립 페이지(레이아웃 크롬 없음, 깨끗한 인쇄).
  route(
    "/lecture/certificates/:enrollmentId/print",
    "features/lms/screens/lecture-certificate-print.tsx",
  ),
  // feat-11-008 P2 — 페이지관리 공개 풀페이지(/page/:code).
  // ★2026-09-01 요청서 ① — private.layout 안에 있어 **비로그인 접근이 /login 으로 튕겼다**.
  //   이벤트·T-PASS 페이지는 링크를 받은 사람이 로그인 없이 열어 보는 것이 존재 이유다.
  //   또 "풀페이지" 이므로 상단바·본문 폭 제한 없이 최상위(레이아웃 없음)에 둔다.
  //   접근통제는 그대로 RLS — 비 staff 에게는 status='use' 만 보인다(fail-closed).
  route("/page/:code", "features/pages/screens/page-view.tsx"),

  ...prefix("/debug", [
    route("/sentry", "debug/sentry.tsx"),
    route("/analytics", "debug/analytics.tsx"),
  ]),

  // API Routes (no UI)
  ...prefix("/api", [
    // feat-000-016 2단계 — 단일 세션 하트비트(유휴 기기 즉시 추방용 폴).
    route("/session/heartbeat", "features/auth/api/session-heartbeat.tsx"),
    route("/search", "features/search/api/search.tsx"),
    route("/search/clear-history", "features/search/api/clear-history.tsx"),
    route("/bug-report", "features/bug-reports/api/bug-report.tsx"),
    route(
      "/notifications/mark-read",
      "features/notifications/api/mark-read.tsx",
    ),
    ...prefix("/settings", [
      route("/theme", "features/settings/api/set-theme.tsx"),
      route("/locale", "features/settings/api/set-locale.tsx"),
    ]),
    ...prefix("/users", [
      index("features/users/api/delete-account.tsx"),
      route("/password", "features/users/api/change-password.tsx"),
      route("/email", "features/users/api/change-email.tsx"),
      route("/profile", "features/users/api/edit-profile.tsx"),
      route("/providers", "features/users/api/connect-provider.tsx"),
      route(
        "/providers/:provider",
        "features/users/api/disconnect-provider.tsx",
      ),
    ]),
    route(
      "/study/recommendation-prefs",
      "features/study/api/recommendation-prefs.tsx",
    ),
    route(
      "/study/reschedule-backlog",
      "features/study/api/reschedule-backlog.tsx",
    ),
    route(
      "/study/subjective-ai-grade",
      "features/study/api/subjective-ai-grade.tsx",
    ),
    route("/srs/queue", "features/srs/api/queue.tsx"),
    route("/srs/review", "features/srs/api/review.tsx"),
    route("/srs/stats", "features/srs/api/stats.tsx"),
    route("/srs/export", "features/srs/api/export.tsx"),
    route("/community/report", "features/community/api/report.tsx"),
    route(
      "/community/report-resolve",
      "features/community/api/report-resolve.tsx",
    ),
    route("/community/study-join", "features/community/api/study-join.tsx"),
    ...prefix("/annotations", [
      route("/bookmark", "features/annotations/api/bookmark.tsx"),
      route("/memo", "features/annotations/api/memo.tsx"),
      route("/highlight", "features/annotations/api/highlight.tsx"),
      route("/highlight-alias", "features/annotations/api/highlight-alias.tsx"),
    ]),
    ...prefix("/blanks", [
      route("/attempt", "features/blanks/api/attempt.tsx"),
      route("/auto-attempt", "features/blanks/api/auto-attempt.tsx"),
      // feat-2-030 — 빈칸 난이도 단계 통과 기록(서버 재검증).
      route("/tier-complete", "features/blanks/api/tier-complete.tsx"),
      route("/admin-answer", "features/blanks/api/admin-answer.tsx"),
      route("/admin-add-blank", "features/blanks/api/admin-add-blank.tsx"),
      route(
        "/admin-remove-blank",
        "features/blanks/api/admin-remove-blank.tsx",
      ),
      route(
        "/admin-remove-blanks",
        "features/blanks/api/admin-remove-blanks.tsx",
      ),
      route("/admin-create-set", "features/blanks/api/admin-create-set.tsx"),
      route("/fork", "features/blanks/api/fork.tsx"),
      // feat-2-029 S5 — 판례 빈칸 후보 승인/거절/되돌리기.
      route(
        "/case-candidate-review",
        "features/blanks/api/case-candidate-review.tsx",
      ),
      // feat-2-029 — 판례 뷰어 빈칸 인라인 편집(드래그 추가 / × 제거).
      route(
        "/case-admin-add-blank",
        "features/blanks/api/case-admin-add-blank.tsx",
      ),
      route(
        "/case-admin-remove-blank",
        "features/blanks/api/case-admin-remove-blank.tsx",
      ),
      // 조문 빈칸 후보(OX 유래) 승인/거절/되돌리기.
      route(
        "/article-candidate-review",
        "features/blanks/api/article-candidate-review.tsx",
      ),
    ]),
    ...prefix("/recitation", [
      route("/attempt", "features/recitation/api/attempt.tsx"),
    ]),
    ...prefix("/qna", [
      route("/thread", "features/qna/api/thread.tsx"),
      route("/target-resolve", "features/qna/api/target-resolve.tsx"),
      route("/nodes", "features/qna/api/nodes.tsx"),
      route("/upload-image", "features/qna/api/upload-image.tsx"),
    ]),
    // feat-3-504 — 논문 PDF signed URL (인증 사용자 누구나).
    ...prefix("/papers", [
      route("/signed-url", "features/papers/api/paper-signed-url.tsx"),
    ]),
    // feat-9-002/003/004 — AI Q&A endpoints.
    //   ask: 실사용자 SSE (인증만)
    //   search-debug / answer-debug: 운영자 점검용 dev endpoint (staff only)
    ...prefix("/ai-qna", [
      route("/ask", "features/ai-qna/api/ask.tsx"),
      route("/search-debug", "features/ai-qna/api/search-debug.tsx"),
      route("/answer-debug", "features/ai-qna/api/answer-debug.tsx"),
    ]),
    ...prefix("/community", [
      route("/post", "features/community/api/post.tsx"),
      route("/comment", "features/community/api/comment.tsx"),
      // feat-6 v2.2 — 첨부 upload/delete (multipart).
      route("/attachment", "features/community/api/attachment.tsx"),
    ]),
    // feat-6-010 — 반별 게시판 글/댓글/첨부 액션 + 첨부 signed URL.
    ...prefix("/cohort-board", [
      route("/post", "features/cohort-boards/api/post.tsx"),
      route("/comment", "features/cohort-boards/api/comment.tsx"),
      route("/attachment", "features/cohort-boards/api/attachment.tsx"),
      route(
        "/attachment/signed-url",
        "features/cohort-boards/api/attachment-signed-url.tsx",
      ),
    ]),
    // 종합반 등업 신청 (학생, pricing 카드) — 운영자 승인은 /api/admin/cohort-request.
    route(
      "/cohorts/upgrade-request",
      "features/cohorts/api/upgrade-request.tsx",
    ),
    // 화면 안 "?" 도움 버튼 — ?key=<screenKey> 발행 가이드 조회.
    route("/guide-help", "features/guide/api/help.tsx"),
    // "?" 버튼 노출 판정 — staff 상시 / 학생은 구독 시작 3개월까지.
    route("/guide-help-visibility", "features/guide/api/help-visibility.tsx"),
    // errata Phase 3 — 추록·정오표 발행 모달 데이터 + 발행 액션.
    route("/errata/publish", "features/errata/api/publish.tsx"),
    ...prefix("/laws", [
      route("/admin-edit-article", "features/laws/api/admin-edit-article.tsx"),
      route("/article-children", "features/laws/api/article-children.tsx"),
      // 허브 트리 필터(중요도/즐겨찾기) 매칭 조문 본문 정독 페이지 로드.
      route(
        "/filtered-articles",
        "features/subjects/api/filtered-articles.tsx",
      ),
    ]),
    ...prefix("/admin", [
      route("/case", "features/admin/api/case.tsx"),
      route("/case-link", "features/admin/api/case-link.tsx"),
      // feat-7-037 — 전문 PDF 수동 업로드 → 텍스트 추출·적재.
      route("/case-official-pdf", "features/admin/api/case-official-pdf.tsx"),
      route("/case-citations", "features/admin/api/case-citations.tsx"),
      // feat-2-035 — 하급심 판결문 파일 업로드(행별 버튼). 화면 모듈에 mupdf 를 끌어들이지 않으려 분리.
      route("/lower-court-upload", "features/cases/api/lower-court-upload.tsx"),
      // feat-2-035 — 업로드 원본 파일 다운로드(서명 URL 리다이렉트).
      route(
        "/cases/lower-court/:caseId/file",
        "features/cases/api/lower-court-file.tsx",
      ),
      route("/problem-create", "features/admin/api/problem-create.tsx"),
      route("/case-reference", "features/admin/api/case-reference.tsx"),
      route("/paper", "features/admin/api/paper.tsx"),
      route("/paper-link", "features/admin/api/paper-link.tsx"),
      // feat-3-504 — 논문 PDF Supabase Storage 첨부.
      route("/paper-pdf", "features/papers/api/paper-pdf.tsx"),
      route("/book-update", "features/admin/api/book-update.tsx"),
      route("/mcq-pack", "features/admin/api/mcq-pack.tsx"),
      route("/mcq-exam", "features/admin/api/mcq-exam.tsx"),
      route("/user-role", "features/admin/api/user-role.tsx"),
      route("/user-access", "features/admin/api/user-access.tsx"),
      route("/popup-notice", "features/admin/api/popup-notice.tsx"),
      route("/guide", "features/admin/api/guide.tsx"),
      route("/cohort", "features/admin/api/cohort.tsx"),
      route("/cohort-board", "features/admin/api/cohort-board.tsx"),
      route(
        "/cohort-weak-problems",
        "features/admin/api/cohort-weak-problems.tsx",
      ),
      route("/law-revision", "features/admin/api/law-revision.tsx"),
      route("/announcement", "features/admin/api/announcement.tsx"),
      route(
        "/article-relation-search",
        "features/admin/api/article-relation-search.tsx",
      ),
    ]),
    ...prefix("/announcements", [
      route("/read", "features/announcements/api/read.tsx"),
    ]),
    ...prefix("/problems", [
      route(
        "/upload-explanation-image",
        "features/problems/api/upload-explanation-image.tsx",
      ),
      route("/attempt", "features/problems/api/attempt.tsx"),
      route("/ox-review-update", "features/problems/api/ox-review-update.tsx"),
      route("/ox-user-hide", "features/problems/api/ox-user-hide.tsx"),
      route("/rubric-review", "features/problems/api/rubric-review.tsx"),
      // 주관식 관련판례 메인 지정 (staff)
      route("/main-case", "features/problems/api/main-case.tsx"),
      route("/ref-preview", "features/problems/api/ref-preview.tsx"),
    ]),
    ...prefix("/study", [
      route("/session-complete", "features/study/api/session-complete.tsx"),
      route("/subjective-attempt", "features/study/api/subjective-attempt.tsx"),
      route("/session-from-wrong", "features/study/api/session-from-wrong.tsx"),
      route(
        "/session-from-weakness",
        "features/study/api/session-from-weakness.tsx",
      ),
      // 약점 → 개인 과제 직접 추가(종합반 학생 셀프).
      route("/weak-to-assignment", "features/study/api/weak-to-assignment.tsx"),
      route(
        "/session-from-bookmarks",
        "features/study/api/session-from-bookmarks.tsx",
      ),
      route("/start-flow", "features/study/api/start-flow.tsx"),
      route("/quiz-flag", "features/study/api/quiz-flag.tsx"),
      route(
        "/session-from-attempts",
        "features/study/api/session-from-attempts.tsx",
      ),
      route("/session-from-srs", "features/study/api/session-from-srs.tsx"),
      route(
        "/session-from-ox-ineligible",
        "features/study/api/session-from-ox-ineligible.tsx",
      ),
    ]),
    ...prefix("/mcq-pack", [
      route("/start", "features/mcq-packs/api/start.tsx"),
    ]),
    ...prefix("/mcq-exam", [
      route("/start", "features/mcq-exams/api/start.tsx"),
    ]),
    ...prefix("/gs", [
      route("/take", "features/gs/api/take.tsx"),
      route("/ai-draft", "features/gs/api/ai-draft.tsx"),
      route("/peer", "features/gs/api/peer.tsx"),
      route("/issue-draft", "features/gs/api/issue-draft.tsx"),
      route("/issue-review", "features/gs/api/issue-review.tsx"),
      route("/issue-attempt", "features/gs/api/issue-attempt.tsx"),
      route("/issue-analyze", "features/gs/api/issue-analyze.tsx"),
    ]),
    // 판례 기반 쟁점추출 훈련 — 강사 출제 + 학생 응시.
    ...prefix("/case-training", [
      route("/draft-ai", "features/cases/api/case-training-draft-ai.tsx"),
      route("/item", "features/cases/api/case-training-item.tsx"),
      route("/issue", "features/cases/api/case-training-issue.tsx"),
      route("/attempt", "features/cases/api/case-training-attempt.tsx"),
      route("/analyze", "features/cases/api/case-training-analyze.tsx"),
      // ③④ 결론·강약 학생 endpoints.
      route(
        "/conclusion-attempt",
        "features/cases/api/case-training-conclusion-attempt.tsx",
      ),
      route(
        "/conclusion-analyze",
        "features/cases/api/case-training-conclusion-analyze.tsx",
      ),
    ]),
    ...prefix("/cron", [
      route("/gs-auto-assign", "features/gs/api/cron-auto-assign.tsx"),
    ]),
  ]),

  // 강의 플랫폼(feat-11) — 학습 플랫폼(navigation.layout)과 별개 화면.
  //   자체 상단 바(브랜드 + 플랫폼 스위처 + 강의 네비). 학습 nav 미재사용.
  layout("core/layouts/lecture.layout.tsx", [
    // 내 강의실(수강현황) — 구 /me/courses 를 여기로 이관(아래 redirect 유지).
    route("/lecture", "features/lms/screens/my-courses.tsx"),
    // 강의실(회차 선택) — 수강권 단위 입장 → 회차 고르기.
    route(
      "/lecture/room/:enrollmentId",
      "features/lms/screens/lecture-room.tsx",
    ),
    // 강의 재생(Kollus 웹플레이어) — 회차 단위.
    route("/lecture/watch/:lessonId", "features/lms/screens/lecture-watch.tsx"),
    route("/lecture/catalog", "features/lms/screens/lecture-catalog.tsx"),
    route(
      "/lecture/catalog/:productCode",
      "features/lms/screens/lecture-product-detail.tsx",
    ),
    route("/lecture/cart", "features/lms/screens/lecture-cart.tsx"),
    // 도서몰(B1) — 썸네일 카탈로그 + 상세.
    route("/lecture/books", "features/bookstore/screens/bookstore-catalog.tsx"),
    route(
      "/lecture/books/:bookId",
      "features/bookstore/screens/book-detail.tsx",
    ),
    // B2-1 찜 목록.
    route("/lecture/wishlist", "features/bookstore/screens/wishlist.tsx"),
    // 주문·배송 — 구 /me/orders 이관(아래 redirect 유지).
    route("/lecture/orders", "features/orders/screens/my-orders.tsx"),
    // feat-8-029 P3 — 학생 환불요청 접수.
    route("/api/refund-request", "features/orders/api/refund-request.tsx"),
    // feat-12 마이페이지 하위 — 증명서·결제내역·쿠폰·포인트(오픈 예정).
    route(
      "/lecture/certificates",
      "features/lms/screens/lecture-certificates.tsx",
    ),
    route("/lecture/payments", "features/lms/screens/lecture-payments.tsx"),
    route("/lecture/coupons", "features/lms/screens/lecture-coupons.tsx"),
    route("/lecture/points", "features/lms/screens/lecture-points.tsx"),
    // feat-6-011 — 고객센터 문의(강의 플랫폼 소속). 접근통제는 RLS 가 DB 에서 강제.
    route("/lecture/support", "features/cs-inquiries/screens/support-list.tsx"),
    route(
      "/lecture/support/new",
      "features/cs-inquiries/screens/support-new.tsx",
    ),
    route(
      "/lecture/support/:inquiryId",
      "features/cs-inquiries/screens/support-detail.tsx",
    ),
    route("/api/cs/inquiry", "features/cs-inquiries/api/cs-inquiry.tsx"),
    // feat-12 강의 플랫폼 랜딩 + 현장강의 일정 + 리담소식(공개).
    route("/lecture/home", "features/landing/screens/landing.tsx"),
    route("/lecture/schedule", "features/landing/screens/schedule.tsx"),
    route(
      "/lecture/schedule/:scheduleId",
      "features/landing/screens/schedule-detail.tsx",
    ),
    // 공지사항(강의 플랫폼 면) — 학습 플랫폼 /announcements 와 같은 데이터, 노출 범위만
    //   다르다(platform_scope). 리담안내 드롭다운에서 진입.
    route(
      "/lecture/announcements",
      "features/announcements/screens/lecture-announcements.tsx",
    ),
    route("/lecture/news", "features/landing/screens/news.tsx"),
    route("/lecture/news/:newsId", "features/landing/screens/news-detail.tsx"),
    // 시험정보 — 리담안내 하위 공개 정적 페이지(변리사 시험 일정·과목·기준).
    route("/lecture/exam-info", "features/landing/screens/exam-info.tsx"),
    // 학원시설 — 리담안내 하위 공개 페이지(강의실·자습·편의시설 사진).
    route("/lecture/facilities", "features/landing/screens/facilities.tsx"),
    // 리담안내(인사말·강사진·찾아오시는 길) — 강의 플랫폼 소속. 강의 nav 의 "리담안내"
    // 클릭 시 학습 플랫폼으로 튕기지 않도록 lecture.layout 아래에 둔다(공개 접근 가능).
    route("/about", "features/home/screens/about.tsx"),
    route(
      "/about/instructors",
      "features/instructors/screens/instructors-index.tsx",
    ),
    // 강사 모집 안내 — 강사소개 하단 "신규강사 채용" 버튼 대상. :slug 보다 먼저(정적 우선).
    route(
      "/about/instructors/recruit",
      "features/instructors/screens/instructor-recruit.tsx",
    ),
    route(
      "/about/instructors/:slug",
      "features/instructors/screens/instructor-detail.tsx",
    ),
    route("/location", "features/home/screens/location.tsx"),
  ]),

  // Pages with top navigation + footer
  layout("core/layouts/navigation.layout.tsx", [
    index("features/home/screens/home.tsx"),
    // 리담안내(/about·/about/instructors·/location)는 강의 플랫폼(lecture.layout)으로 이관.
    route("/auth/confirm", "features/auth/screens/confirm.tsx"),
    route("/new-password", "features/auth/screens/new-password.tsx"),
    route("/error", "core/screens/error.tsx"),

    // Only-when-logged-out
    layout("core/layouts/public.layout.tsx", [
      route("/login", "features/auth/screens/login.tsx"),
      route("/join", "features/auth/screens/join.tsx"),
      route("/forgot-password", "features/auth/screens/forgot-password.tsx"),
      ...prefix("/auth", [
        ...prefix("/social", [
          route("/start/:provider", "features/auth/screens/social/start.tsx"),
          route(
            "/complete/:provider",
            "features/auth/screens/social/complete.tsx",
          ),
        ]),
      ]),
    ]),

    // Authenticated app pages
    layout("core/layouts/private.layout.tsx", { id: "private-app" }, [
      route("/logout", "features/auth/screens/logout.tsx"),

      // SRS v2 — Anki 스타일 명시적 카드 SRS (학생 효과 테스트). 영역 게이트 없음(MVP).
      // /srs (v2 SRS — 카드 암기) 는 학습관리 게이트 밖. 무료 사용자 접근 유지.
      // 학습관리 탭은 srs-review.tsx / srs-stats.tsx 본문 상단에서 직접 import.
      route("/srs", "features/srs/screens/srs-review.tsx"),
      route("/srs/stats", "features/srs/screens/srs-stats.tsx"),

      // feat-8-008 학습관리 영역 게이트 — area_study_mgmt 미보유 시 /pricing redirect.
      layout(
        "features/study/layouts/study-management.layout.tsx",
        { id: "study-mgmt-core" },
        [
          route("/goals", "features/goals/screens/goals.tsx"),
          route("/study/stats", "features/study/screens/stats.tsx"),
          route("/study/today", "features/study/screens/today.tsx"),
          route("/study/srs", "features/study/screens/srs.tsx"),
          // feat-2-022 ⑨ OX SRS 복습 러너 (due ref 를 실제 O/X 로 재채점).
          route("/study/srs/ox", "features/study/screens/srs-ox-review.tsx"),
          // feat-2-022 OX 약점 진단 (단원×지식종류 교차).
          route(
            "/study/ox-diagnosis",
            "features/study/screens/ox-diagnosis.tsx",
          ),
        ],
      ),
      // feat-8-008 학습보조 영역 게이트 — area_study_aids 미보유 시 /pricing redirect.
      layout("features/study/layouts/study-aids.layout.tsx", [
        route("/study/blanks", "features/blanks/screens/blanks-stats.tsx"),
        route("/study/wrong-note", "features/study/screens/wrong-note.tsx"),
        route(
          "/study/wrong-note/print",
          "features/study/screens/wrong-note-print.tsx",
        ),
        route("/study/bookmarks", "features/study/screens/bookmarks.tsx"),
        route(
          "/study/bookmarks/print",
          "features/study/screens/bookmarks-print.tsx",
        ),
        route("/study/notes", "features/study/screens/notes.tsx"),
        route("/study/notes/print", "features/study/screens/notes-print.tsx"),
        route("/study/highlights", "features/study/screens/highlights.tsx"),
        route(
          "/study/highlights/print",
          "features/study/screens/highlights-print.tsx",
        ),
        route("/study/comments", "features/study/screens/comments.tsx"),
      ]),
      route("/inbox", "features/notifications/screens/student-inbox.tsx"),
      // feat-7-028 — 학생용 상담 코멘트(강사 공유) 열람. 알림 student_note_shared 의 목적지.
      // 학습관리 토글을 얹되 게이트는 없는 bare 레이아웃으로 감쌈(알림 목적지라 비구독자 접근 유지).
      layout(
        "features/study/layouts/cohort-tabs.layout.tsx",
        { id: "cohort-consult" },
        [
          route(
            "/me/consult",
            "features/student-notes/screens/student-consult.tsx",
          ),
        ],
      ),

      ...prefix("/latest", [
        route("/laws", "features/latest/screens/laws.tsx"),
        route("/cases", "features/latest/screens/cases.tsx"),
        // feat-3-205 학습정보 판례 뷰어 — :caseId 는 /cases 색인과 별개 경로.
        route(
          "/cases/:caseId",
          "features/latest/screens/latest-case-viewer.tsx",
        ),
        route("/mcq", "features/latest/screens/mcq.tsx"),
        // feat-8-008 모의고사(통합) 영역 게이트 — area_mock_exams 미보유 시 redirect.
        // feat-10-005 통합 모의고사 — :packId 보다 먼저 선언 (정적 세그먼트 우선).
        layout("features/latest/layouts/mcq-exam.layout.tsx", [
          // 통합 모의 색인 — 모의고사 sticky 토글(mock.layout) 부착.
          // 러너·결과는 응시 집중 화면이라 토글 제외(색인만 감싼다).
          layout(
            "features/gs/layouts/mock.layout.tsx",
            { id: "mock-area-mcq-exams" },
            [route("/mcq/exams", "features/latest/screens/mcq-exam-index.tsx")],
          ),
          route(
            "/mcq/exam/:examId",
            "features/latest/screens/mcq-exam-runner.tsx",
          ),
          route(
            "/mcq/exam/:examId/result/:attemptId",
            "features/latest/screens/mcq-exam-result.tsx",
          ),
        ]),
        route("/mcq/:packId", "features/latest/screens/mcq-pack-detail.tsx"),
        route(
          "/mcq/:packId/sheet/:sessionId",
          "features/latest/screens/mcq-pack-sheet.tsx",
        ),
        route(
          "/mcq/:packId/result/:sessionId",
          "features/latest/screens/mcq-pack-result.tsx",
        ),
        route(
          "/mcq/:packId/ox-exam",
          "features/latest/screens/mcq-pack-ox-exam.tsx",
        ),
        route("/essay", "features/latest/screens/essay.tsx"),
        // feat-3-205 학습정보 2차문제 뷰어.
        route(
          "/essay/:problemId",
          "features/latest/screens/latest-essay-viewer.tsx",
        ),
        route("/papers", "features/latest/screens/papers.tsx"),
        route("/book-updates", "features/latest/screens/book-updates.tsx"),
      ]),

      // errata Phase 4a — 추록·정오표 PDF 목록 (nav 학습정보. 舊 /latest/book-updates 대체).
      route("/study/errata", "features/errata/screens/errata-list.tsx"),
      // errata Phase 4a §8-5 — 어드민 시트 관리 (수동 재렌더).
      route(
        "/admin/errata-sheets",
        "features/errata/screens/admin-errata-sheets.tsx",
      ),
      // errata — 발행분 수정(문구 정정·회수). 발행 후 고칠 화면이 없어 스크립트로만 가능했다.
      route(
        "/admin/errata-items",
        "features/errata/screens/admin-errata-items.tsx",
      ),

      // 주관식 강의자료 인쇄본 (staff 전용) — 과목 게이트 밖, loader 에서 staff 검사.
      route(
        "/subjects/:subject/problems/:problemId/handout",
        "features/subjects/screens/problem-handout-print.tsx",
      ),
      // feat-8-008 학습과목 영역 게이트 — area_subjects 미보유 시 /pricing redirect.
      layout("features/subjects/layouts/subjects.layout.tsx", [
        ...prefix("/subjects", [
          route("/civil", "features/subjects/screens/civil.tsx"),
          route("/patent", "features/subjects/screens/patent.tsx"),
          route("/trademark", "features/subjects/screens/trademark.tsx"),
          route("/design", "features/subjects/screens/design.tsx"),
          route(
            "/civil-procedure",
            "features/subjects/screens/civil-procedure.tsx",
          ),
          route(
            "/:subject/articles/:articlePath",
            "features/subjects/screens/article-viewer.tsx",
          ),
          route(
            "/:subject/chapters/:chapterId",
            "features/subjects/screens/chapter-viewer.tsx",
          ),
          route(
            "/:subject/systematic/:nodeId",
            "features/subjects/screens/systematic-node-viewer.tsx",
          ),
          route(
            "/:subject/cases/:caseId",
            "features/subjects/screens/case-viewer.tsx",
          ),
          route(
            "/:subject/problems/:problemId",
            "features/subjects/screens/problem-viewer.tsx",
          ),
          route(
            "/:subject/quiz/setup",
            "features/subjects/screens/quiz-setup.tsx",
          ),
          route("/:subject/ox", "features/subjects/screens/subject-ox.tsx"),
          route(
            "/:subject/quiz/result/:sessionId",
            "features/subjects/screens/quiz-result.tsx",
          ),
          ...prefix("/science", [
            index("features/subjects/screens/science/science-index.tsx"),
            route("/physics", "features/subjects/screens/science/physics.tsx"),
            route(
              "/chemistry",
              "features/subjects/screens/science/chemistry.tsx",
            ),
            route("/biology", "features/subjects/screens/science/biology.tsx"),
            route(
              "/earth-science",
              "features/subjects/screens/science/earth-science.tsx",
            ),
            route(
              "/:scienceSubject/quiz/setup",
              "features/subjects/screens/science/quiz-setup.tsx",
            ),
            route(
              "/:scienceSubject/problems/:problemId",
              "features/subjects/screens/science/problem-viewer.tsx",
            ),
            route(
              "/:scienceSubject/quiz/result/:sessionId",
              "features/subjects/screens/science/quiz-result.tsx",
            ),
          ]),
        ]),
      ]),

      // feat-8-008 2차 모의(온라인 GS) 영역 게이트 — area_mock_exams.
      layout("features/gs/layouts/mock.layout.tsx", { id: "mock-area-gs" }, [
        layout("features/gs/layouts/gs.layout.tsx", [
          route("/gs", "features/gs/screens/gs.tsx"),
          // 논점 추출 훈련 — 별도 색인 + 응시. :roundId 보다 먼저 선언 (정적 세그먼트 우선).
          route("/gs/issues", "features/gs/screens/gs-issues.tsx"),
          route(
            "/gs/issues/:questionId",
            "features/gs/screens/gs-issue-take.tsx",
          ),
          route("/gs/:roundId/take", "features/gs/screens/gs-take.tsx"),
          route("/gs/:roundId/result", "features/gs/screens/gs-result.tsx"),
          route(
            "/gs/peer-review/:assignmentId",
            "features/gs/screens/gs-peer-review.tsx",
          ),
          route(
            "/gs/peer-review/round/:roundId",
            "features/gs/screens/gs-peer-review-round.tsx",
          ),
          route("/gs/series/:seriesId", "features/gs/screens/gs-my-series.tsx"),
          route(
            "/gs/:roundId/distinguished",
            "features/gs/screens/gs-distinguished.tsx",
          ),
          route("/gs/points", "features/gs/screens/gs-points.tsx"),
        ]),
      ]),
      // ★커뮤니티 영역(자유게시판·스터디·합격수기 + 공지·가이드)은 강의 플랫폼 상단바
      //   컨텍스트에서 렌더하도록 lecture.layout 아래로 이관(같은 /community/* URL·기능 공유,
      //   private.layout 중첩으로 게이트 유지). 아래 lecture.layout 블록 참조.
      // ★커뮤니티 영역(자유게시판·스터디 모집·합격 수기 + 공지·이용가이드) — **학습 플랫폼**
      //   소속. 2026-07-27 에 강의 상단바 유지를 위해 lecture.layout 아래로 옮겼다가
      //   되돌린 것(2026-08-23): 2026-08-04 의 "개발 중 강의 플랫폼 비-staff 전면 차단"
      //   게이트가 이 영역까지 함께 막아 학생이 게시판·공지·가이드에서 lidamedu.com 으로
      //   튕겨 나갔다. 강의 상단바 커뮤니티 드롭다운(LECTURE_COMMUNITY_LINKS)은 여기로
      //   링크되며, 진입하면 학습 플랫폼 컨텍스트로 넘어간다(게시판은 두 플랫폼 공유 공간).
      layout(
        "features/community/layouts/community.layout.tsx",
        { id: "community-area" },
        [
          route("/community", "features/community/screens/community.tsx"),
          route(
            "/community/:board",
            "features/community/screens/community-board.tsx",
          ),
          route(
            "/community/:board/new",
            "features/community/screens/community-post-new.tsx",
          ),
          route(
            "/community/:board/:postId",
            "features/community/screens/community-post-detail.tsx",
          ),
          route(
            "/community/:board/:postId/edit",
            "features/community/screens/community-post-new.tsx",
            { id: "community-post-edit" },
          ),
          // feat-6 v2.2 — 첨부 signed URL (인증 사용자).
          route(
            "/community/attachment/signed-url",
            "features/community/api/attachment-signed-url.tsx",
          ),
          route(
            "/announcements",
            "features/announcements/screens/announcements-inbox.tsx",
          ),
          // 이용 가이드 허브 — 기능 사용법(글+영상). 운영자 작성(/admin/guides).
          route("/guide", "features/guide/screens/guide-index.tsx"),
          route("/guide/:guideId", "features/guide/screens/guide-detail.tsx"),
        ],
      ),
      // feat-6-010 / feat-2-031 — 반별 게시판(종합반 통합). 접근 통제는 RLS 가 DB 에서 강제.
      //   커뮤니티 → 종합반으로 이관 → 종합반 탭(CohortTabs) strip 부착. 게이트 없음(RLS 권위).
      layout(
        "features/study/layouts/cohort-tabs.layout.tsx",
        { id: "cohort-boards" },
        [
          route(
            "/cohort-boards",
            "features/cohort-boards/screens/cohort-board-list.tsx",
          ),
          route(
            "/cohort-boards/:boardId",
            "features/cohort-boards/screens/cohort-board-detail.tsx",
          ),
          route(
            "/cohort-boards/:boardId/new",
            "features/cohort-boards/screens/cohort-board-post-new.tsx",
          ),
          route(
            "/cohort-boards/:boardId/:postId",
            "features/cohort-boards/screens/cohort-board-post-detail.tsx",
          ),
          route(
            "/cohort-boards/:boardId/:postId/edit",
            "features/cohort-boards/screens/cohort-board-post-new.tsx",
            { id: "cohort-board-post-edit" },
          ),
        ],
      ),
      route("/admin", "features/admin/screens/admin.tsx"),
      route("/admin/audit-logs", "features/admin/screens/admin-audit-logs.tsx"),
      route("/admin/inbox", "features/notifications/screens/staff-inbox.tsx"),
      route(
        "/admin/bug-reports",
        "features/bug-reports/screens/admin-bug-reports.tsx",
      ),
      route(
        "/admin/cs-inquiries",
        "features/cs-inquiries/screens/admin-cs-inquiries.tsx",
      ),
      // 고객센터 FAQ 관리(/lecture/support 상단 노출).
      route(
        "/admin/support-faqs",
        "features/cs-inquiries/screens/admin-faqs.tsx",
      ),
      route(
        "/admin/support-faqs/new",
        "features/cs-inquiries/screens/admin-faq-edit.tsx",
        { id: "admin-faq-new" },
      ),
      route(
        "/admin/support-faqs/:faqId/edit",
        "features/cs-inquiries/screens/admin-faq-edit.tsx",
      ),
      route(
        "/api/admin/support-faq",
        "features/cs-inquiries/api/admin-faq.tsx",
      ),
      // feat-6-012 — 강사소개 관리(프로필: 경력·저서·철학·사진, /about/instructors 노출).
      // 경로는 feat-7-041 강사 담당·배분(/admin/instructors)과 충돌 방지 위해 분리.
      route(
        "/admin/instructor-profiles",
        "features/instructors/screens/admin-instructors.tsx",
      ),
      route(
        "/admin/instructor-profiles/new",
        "features/instructors/screens/admin-instructor-edit.tsx",
        { id: "admin-instructor-new" },
      ),
      route(
        "/admin/instructor-profiles/:instructorId/edit",
        "features/instructors/screens/admin-instructor-edit.tsx",
      ),
      route(
        "/api/admin/instructor",
        "features/instructors/api/admin-instructor.tsx",
      ),
      // feat-12 강의 플랫폼 랜딩 관리 — 현장강의 일정 · 리담소식 · 히어로 배너.
      route(
        "/admin/lecture-schedules",
        "features/landing/screens/admin-schedules.tsx",
      ),
      route(
        "/admin/lecture-schedules/new",
        "features/landing/screens/admin-schedule-edit.tsx",
        { id: "admin-schedule-new" },
      ),
      route(
        "/admin/lecture-schedules/:scheduleId/edit",
        "features/landing/screens/admin-schedule-edit.tsx",
      ),
      route("/admin/lecture-news", "features/landing/screens/admin-news.tsx"),
      route(
        "/admin/lecture-news/new",
        "features/landing/screens/admin-news-edit.tsx",
        { id: "admin-news-new" },
      ),
      route(
        "/admin/lecture-news/:newsId/edit",
        "features/landing/screens/admin-news-edit.tsx",
      ),
      route(
        "/admin/lecture-videos",
        "features/landing/screens/admin-lecture-videos.tsx",
      ),
      route(
        "/admin/lecture-videos/new",
        "features/landing/screens/admin-lecture-video-edit.tsx",
        { id: "admin-lecture-video-new" },
      ),
      route(
        "/admin/lecture-videos/:videoId/edit",
        "features/landing/screens/admin-lecture-video-edit.tsx",
      ),
      route(
        "/admin/landing-banners",
        "features/landing/screens/admin-banners.tsx",
      ),
      route(
        "/admin/landing-banners/new",
        "features/landing/screens/admin-banner-edit.tsx",
        { id: "admin-banner-new" },
      ),
      route(
        "/admin/landing-banners/:bannerId/edit",
        "features/landing/screens/admin-banner-edit.tsx",
      ),
      route("/admin/exam-info", "features/landing/screens/admin-exam-info.tsx"),
      route(
        "/admin/exam-notices",
        "features/landing/screens/admin-exam-notices.tsx",
      ),
      route(
        "/admin/exam-notices/new",
        "features/landing/screens/admin-exam-notice-edit.tsx",
        { id: "admin-exam-notice-new" },
      ),
      route(
        "/admin/exam-notices/:noticeId/edit",
        "features/landing/screens/admin-exam-notice-edit.tsx",
      ),
      route(
        "/api/admin/exam-notice",
        "features/landing/api/admin-exam-notice.tsx",
      ),
      route("/api/admin/landing", "features/landing/api/admin-landing.tsx"),
      // feat-13 쿠폰 관리(매출·정산).
      route("/admin/coupons", "features/coupons/screens/admin-coupons.tsx"),
      // feat-11-011 — 포인트 정책·쿠폰 전환·이용내역.
      route("/admin/points", "features/points/screens/admin-points.tsx"),
      // feat-11-011 P5 — 강의·판매 운영 대시보드(요청서 §1.2 "0. 대시보드").
      route("/admin/dashboard", "features/admin/screens/admin-ops-dashboard.tsx"),
      route(
        "/admin/coupons/new",
        "features/coupons/screens/admin-coupon-edit.tsx",
        { id: "admin-coupon-new" },
      ),
      route(
        "/admin/coupons/:couponId/edit",
        "features/coupons/screens/admin-coupon-edit.tsx",
      ),
      route("/api/admin/coupon", "features/coupons/api/admin-coupon.tsx"),
      route(
        "/admin/announcements",
        "features/admin/screens/admin-announcements.tsx",
      ),
      // 세그먼트 대량 안내 발송(인앱+이메일).
      route("/admin/broadcasts", "features/admin/screens/admin-broadcasts.tsx"),
      route(
        "/admin/announcements/audiences",
        "features/admin/screens/admin-announcement-audiences.tsx",
      ),
      route("/admin/cases", "features/admin/screens/admin-cases.tsx"),
      route(
        "/admin/cases/pdf-missing",
        "features/admin/screens/admin-case-pdf-missing.tsx",
      ),
      // feat-2-035 — 하급심 판결문 적재 현황 + 수기 확보 대상 목록.
      route(
        "/admin/cases/lower-court",
        "features/cases/screens/admin-lower-court-list.tsx",
      ),
      route(
        "/admin/cases/lower-court/:caseId/print",
        "features/cases/screens/lower-court-print.tsx",
      ),
      route("/admin/cases/edit", "features/admin/screens/admin-case-edit.tsx", {
        id: "admin-case-new",
      }),
      route(
        "/admin/cases/edit/:caseId",
        "features/admin/screens/admin-case-edit.tsx",
      ),
      route(
        "/admin/cases/violations",
        "features/admin/screens/admin-case-violations.tsx",
      ),
      route(
        "/admin/cases/orphan-highlights",
        "features/admin/screens/admin-orphan-highlights.tsx",
      ),
      // feat-7-049 — 본문 찾아 고치기(여러 콘텐츠에 흩어진 오기 일괄 정정).
      route(
        "/admin/tools/find-replace",
        "features/admin/screens/admin-find-replace.tsx",
      ),
      // feat-14-N1-b — 통합 검수 큐(문제·도식·2차 훈련을 한 화면에서 판정).
      route("/admin/review", "features/admin/screens/admin-review-queue.tsx"),
      route("/admin/users", "features/admin/screens/admin-users.tsx"),
      // feat-11-002 — 강의 영상 LMS (시리즈·에디션·회차·영상·수강권 + 재생 판정).
      route("/admin/lms/courses", "features/lms/screens/admin-lms-courses.tsx"),
      route(
        "/admin/lms/courses/:courseId",
        "features/lms/screens/admin-lms-course-detail.tsx",
      ),
      // feat-11-006 — 콜러스 콘텐츠 라이브러리·강의그룹.
      route(
        "/admin/lms/contents",
        "features/lms/screens/admin-lms-contents.tsx",
      ),
      route("/admin/lms/reviews", "features/lms/screens/admin-lms-reviews.tsx"),
      route(
        "/admin/lms/enrollments",
        "features/lms/screens/admin-lms-enrollments.tsx",
      ),
      // feat-11-010 — 수강기간 연장 이력(결제·환불·수동 처리 대기).
      route(
        "/admin/lms/extensions",
        "features/lms/screens/admin-lms-extensions.tsx",
      ),
      route("/admin/lms/devices", "features/lms/screens/admin-lms-devices.tsx"),
      // feat-11-004 4a — 주문 관리(항목 부분 환불) + 4b 무통장.
      route("/admin/orders", "features/orders/screens/admin-orders.tsx"),
      route(
        "/api/orders/bank-transfer",
        "features/orders/api/bank-transfer.tsx",
      ),
      // feat-11-004 4c — 도서몰·배송 + 학생 마이페이지.
      route("/admin/books", "features/bookstore/screens/admin-books.tsx"),
      route(
        "/admin/books/new",
        "features/bookstore/screens/admin-book-new.tsx",
      ),
      route(
        "/admin/books/:bookId/edit",
        "features/bookstore/screens/admin-book-edit.tsx",
      ),
      route(
        "/admin/book-bundles",
        "features/bookstore/screens/admin-book-bundles.tsx",
      ),
      route(
        "/api/admin/book-preview",
        "features/bookstore/api/book-preview.tsx",
      ),
      route(
        "/admin/shipments",
        "features/bookstore/screens/admin-shipments.tsx",
      ),
      route("/me/courses", "features/lms/screens/my-courses-redirect.tsx"),
      route("/me/orders", "features/orders/screens/my-orders-redirect.tsx"),
      route(
        "/api/cron/bank-transfer-expire",
        "features/cron/api/bank-transfer-expire.tsx",
      ),
      route("/api/lms/playback-grant", "features/lms/api/playback-grant.tsx"),
      route("/api/lms/watch-heartbeat", "features/lms/api/watch-heartbeat.tsx"),
      route(
        "/api/lms/material/:materialId",
        "features/lms/api/material-download.tsx",
      ),
      // feat-11-006 Phase 3 — HTML 에디터 이미지 업로드(staff 전용).
      route("/api/lms/editor-image", "features/lms/api/editor-image.tsx"),
      // feat-11-010 — [수강연장] → 연장 주문 + pending 결제(서버에서 정책 재검증).
      route(
        "/api/lms/extension-order",
        "features/lms/api/extension-order.tsx",
      ),
      // feat-11-006 Phase 4 — 수강평/교재평 학생 뮤테이션.
      route("/api/lms/review", "features/lms/api/review.tsx"),
      // 관리자 관리 — 운영 업무별 알림 담당자 지정 (admin 전용).
      route(
        "/admin/staff-duties",
        "features/admin/screens/admin-staff-duties.tsx",
      ),
      // 접속이력·탈퇴 관리 (admin 전용).
      route(
        "/admin/access-logs",
        "features/admin/screens/admin-access-logs.tsx",
      ),
      route(
        "/admin/withdrawals",
        "features/admin/screens/admin-withdrawals.tsx",
      ),
      route("/api/admin/withdrawal", "features/admin/api/withdrawal.tsx"),
      // 체험→유료 전환 추적 (P1) — 만료 임박 워크리스트·전환율.
      route(
        "/admin/trial-conversion",
        "features/admin/screens/admin-trial-conversion.tsx",
      ),
      // feat-7-041 — 강사 관리 (admin): 담당 과목 지정 + 배분 규칙 연결.
      route(
        "/admin/instructors",
        "features/admin/screens/admin-instructors.tsx",
      ),
      // 시험일 관리 (manager+) — 학생 목표 폼 "응시 시험" 시험일 자동 파생 SSOT.
      route(
        "/admin/exam-schedules",
        "features/admin/screens/admin-exam-schedules.tsx",
      ),
      route(
        "/admin/popup-notices",
        "features/admin/screens/admin-popup-notices.tsx",
      ),
      route("/admin/guides", "features/admin/screens/admin-guides.tsx"),
      // feat-11-008 P2 — 페이지관리(풀페이지 CMS) + 공개 라우트.
      // feat-11-008 P5 — 콘텐츠관리 분리: 강의그룹(저작) / 라이브러리(원본 보관).
      route("/admin/lms/groups", "features/lms/screens/admin-lms-groups.tsx"),
      route(
        "/admin/lms/groups/:groupId",
        "features/lms/screens/admin-lms-group-detail.tsx",
      ),
      // feat-11-008 P4 — 강의개설 통합 목록(판매 상품 기준 검색·관리).
      route("/admin/lectures", "features/lms/screens/admin-lectures.tsx"),
      // feat-11-008 P3 — 강의 카테고리 관리(course_categories SSOT).
      route(
        "/admin/lecture-categories",
        "features/lms/screens/admin-lecture-categories.tsx",
      ),
      // feat-11-009 — 메인화면 모듈형 CMS(요청서_0901 §2).
      route("/admin/main-page", "features/landing/screens/admin-main-page.tsx"),
      route(
        "/admin/main-page/:moduleId",
        "features/landing/screens/admin-main-page-edit.tsx",
      ),
      route("/admin/pages", "features/pages/screens/admin-pages.tsx"),
      route("/admin/pages/new", "features/pages/screens/admin-page-edit.tsx", {
        id: "admin-page-new",
      }),
      route(
        "/admin/pages/:pageId/edit",
        "features/pages/screens/admin-page-edit.tsx",
        { id: "admin-page-edit" },
      ),
      route(
        "/admin/membership-test",
        "features/admin/screens/admin-membership-test.tsx",
      ),
      route(
        "/admin/community/reports",
        "features/admin/screens/admin-community-reports.tsx",
      ),
      route("/admin/cohorts", "features/admin/screens/admin-cohorts.tsx"),
      // 종합반 등업 신청 — pricing 신청 → 운영자 승인(반 배정).
      route(
        "/admin/cohort-requests",
        "features/admin/screens/admin-cohort-requests.tsx",
      ),
      route(
        "/api/admin/cohort-request",
        "features/admin/api/cohort-request.tsx",
      ),
      route(
        "/admin/cohort-boards",
        "features/admin/screens/admin-cohort-boards.tsx",
      ),
      route(
        "/admin/cohorts/at-risk",
        "features/admin/screens/admin-at-risk.tsx",
      ),
      route(
        "/api/admin/at-risk-notify",
        "features/admin/api/at-risk-notify.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId",
        "features/admin/screens/admin-cohort-detail.tsx",
      ),
      // feat-7-043 — 출결 대장.
      route(
        "/admin/cohorts/:cohortId/attendance",
        "features/admin/screens/admin-cohort-attendance.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/attendance/:classSessionId",
        "features/admin/screens/admin-attendance-check.tsx",
      ),
      route("/api/admin/attendance", "features/admin/api/attendance.tsx"),
      // Phase 3 — 월간 계획 현황·상담(진단+계획 검토+승인).
      route(
        "/admin/cohorts/:cohortId/plans",
        "features/admin/screens/admin-cohort-plans.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/plans/:profileId",
        "features/admin/screens/admin-student-plan-review.tsx",
      ),
      route("/api/admin/study-plan", "features/admin/api/study-plan.tsx"),
      // feat-7-044 — 테스트 시리즈 성적 추이.
      route(
        "/admin/cohorts/:cohortId/test-series",
        "features/admin/screens/admin-cohort-test-series.tsx",
      ),
      // 월간 개인 성적표 — 학생당 1페이지 인쇄(PDF 저장).
      route(
        "/admin/cohorts/:cohortId/monthly-report",
        "features/admin/screens/admin-cohort-monthly-report.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/progress",
        "features/admin/screens/admin-cohort-progress.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/stats",
        "features/admin/screens/admin-cohort-stats.tsx",
      ),
      // 내 활동 — 내가 한 상담 코멘트·부여 과제 + 상대 반응 통합 뷰.
      route(
        "/admin/my-activity",
        "features/admin/screens/admin-my-activity.tsx",
      ),
      route("/admin/curricula", "features/admin/screens/admin-curricula.tsx"),
      route(
        "/admin/curricula/:curriculumId",
        "features/admin/screens/admin-curriculum-edit.tsx",
      ),
      route("/api/admin/curriculum", "features/admin/api/curriculum.tsx"),
      route(
        "/admin/cohorts/:cohortId/assignments",
        "features/admin/screens/admin-cohort-assignments.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/assignments/:assignmentId",
        "features/admin/screens/admin-assignment-edit.tsx",
      ),
      // feat-7-042 — 오프라인 테스트 (시험지 빌더·인쇄).
      route(
        "/admin/cohorts/:cohortId/assignments/:assignmentId/tests/:testId",
        "features/admin/screens/admin-offline-test-edit.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/assignments/:assignmentId/tests/:testId/print",
        "features/admin/screens/admin-offline-test-print.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/assignments/:assignmentId/tests/:testId/results",
        "features/admin/screens/admin-offline-test-results.tsx",
      ),
      route("/api/admin/assignment", "features/admin/api/assignment.tsx"),
      route("/api/admin/offline-test", "features/admin/api/offline-test.tsx"),
      route(
        "/api/offline-test/online-start",
        "features/assignments/api/offline-test-online.tsx",
      ),
      route(
        "/api/admin/search-content",
        "features/admin/api/search-content.tsx",
      ),
      route(
        "/api/cron/curriculum-weekly",
        "features/cron/api/curriculum-weekly.tsx",
      ),
      route("/api/cron/weekly-reports", "features/cron/api/weekly-reports.tsx"),
      route("/api/cron/inactive-alert", "features/cron/api/inactive-alert.tsx"),
      // feat-7-045 — 약점 개인 보충 과제 주간 자동 생성 (opt-in 반만).
      route(
        "/api/cron/weak-assignments",
        "features/cron/api/weak-assignments.tsx",
      ),
      route(
        "/api/cron/pass-predict-snapshot",
        "features/cron/api/pass-predict-snapshot.tsx",
      ),
      route(
        "/api/cron/exam-result-reminder",
        "features/cron/api/exam-result-reminder.tsx",
      ),
      // feat-9-001 — RAG 임베딩 cron (Voyage). dry-run 모드는 VOYAGE_API_KEY 미설정 시 자동.
      route("/api/cron/embed-chunks", "features/cron/api/embed-chunks.tsx"),
      // feat-9-005 v1.2 — eval 자동 평가 cron. ANTHROPIC/VOYAGE 키 미설정 시 dry-run.
      route("/api/cron/ai-eval-run", "features/cron/api/ai-eval-run.tsx"),
      // feat-7-004 — 시행일 도래 개정 자동 현행 전환 cron.
      route(
        "/api/cron/promote-law-revisions",
        "features/cron/api/promote-law-revisions.tsx",
      ),
      // feat-7-037 — 판례 전문 자동 재확인·적재 cron.
      route(
        "/api/cron/recheck-precedents",
        "features/cron/api/recheck-precedents.tsx",
      ),
      // feat-8-028 — 구독 유지보수 cron: 만료 강등 + 미결제 pending 정리.
      route(
        "/api/cron/subscription-maintenance",
        "features/cron/api/subscription-maintenance.tsx",
      ),
      // feat-8-028 Stage 5 — 자동결제 갱신 청구 cron.
      route("/api/cron/billing-charge", "features/cron/api/billing-charge.tsx"),
      // feat-11-006 — 콜러스 콘텐츠 라이브러리 자동 동기화 cron.
      route(
        "/api/cron/kollus-content-sync",
        "features/cron/api/kollus-content-sync.tsx",
      ),
      route(
        "/api/student/lecture-progress",
        "features/lectures/api/progress.tsx",
      ),
      // feat-8-026b — 학습 데이터 분석 동의(A/B) 토글 전용 action(대시보드 등 공용).
      route("/api/consent", "features/exam-results/api/consent.tsx"),
      route(
        "/lectures/:itemId",
        "features/lectures/screens/lecture-viewer.tsx",
      ),
      // 인앱 강의노트(교재 PDF) 뷰어 — 위치 링크(?page=N)가 통합본의 해당 페이지를 연다.
      // :sourcePdfId 는 통합본 source_pdf_id 또는 (통합본 미매핑 조각의) resource_id.
      // 경로는 /note/* (구 /lecture-note/* — "lecture" 는 신규 강의 플랫폼이 사용).
      route(
        "/note/:sourcePdfId",
        "features/lectures/screens/lecture-note-viewer.tsx",
      ),
      // 구 경로 북마크 보존 redirect.
      route(
        "/lecture-note/:sourcePdfId",
        "features/lectures/screens/lecture-note-redirect.tsx",
      ),
      // 페이지 이미지 signed URL 창 발급(유출방지 ① — 원본 PDF 비전달).
      route("/api/note-pages", "features/lectures/api/lecture-note-pages.tsx"),
      route("/api/admin/student-note", "features/admin/api/student-note.tsx"),
      route("/api/admin/cs-memo", "features/admin/api/cs-memo.tsx"),
      route(
        "/api/admin/member-profile",
        "features/admin/api/member-profile.tsx",
      ),
      route(
        "/api/admin/lesson-completion",
        "features/admin/api/lesson-completion.tsx",
      ),
      route("/api/admin/member-points", "features/admin/api/member-points.tsx"),
      // feat-11-011 P0 — 사이드바가 접근 못 하는 메뉴를 숨기기 위한 내 담당 조회.
      route("/api/admin/my-duties", "features/admin/api/my-duties.tsx"),
      route(
        "/api/admin/problem-review",
        "features/admin/api/problem-review.tsx",
      ),
      route(
        "/api/admin/explanation-review",
        "features/admin/api/explanation-review.tsx",
      ),
      route("/api/admin/text-review", "features/admin/api/text-review.tsx"),
      route(
        "/api/admin/ai-problem-gen",
        "features/admin/api/ai-problem-gen.tsx",
      ),
      route("/api/admin/importance", "features/admin/api/importance.tsx"),
      route("/api/admin/case-listing", "features/admin/api/case-listing.tsx"),
      // feat-2-023 암기 카드 생성(조문·판례 → srs_items, dry-run·멱등·소프트삭제).
      route("/api/admin/srs-cards", "features/admin/api/srs-cards.tsx"),
      // feat-8-008 학습관리 영역 게이트 (과제) — 종합반 통합(feat-2-031): 종합반 탭 노출.
      layout(
        "features/study/layouts/cohort-management.layout.tsx",
        { id: "cohort-assignments" },
        [
          route(
            "/assignments",
            "features/assignments/screens/student-assignments.tsx",
          ),
          route(
            "/assignments/:assignmentId",
            "features/assignments/screens/student-assignment-detail.tsx",
          ),
          // Phase 3 — 학생 월간 계획 작성·제출 + 일일 기록.
          route("/study/plan", "features/study-plans/screens/study-plan.tsx"),
          route(
            "/study/plan/log",
            "features/study-plans/screens/study-plan-log.tsx",
          ),
        ],
      ),
      // 도해특허법 팝업 콘텐츠 — 본문은 학생 공개(2026-08-23), 편집·빈칸 낱말은 RLS 로 staff.
      route("/api/dohae/unit", "features/dohae/api/unit.tsx"),
      // feat-2-037 — 빈칸 낱말 빼기/되돌리기(staff). 지우지 않고 excluded_at 만 켠다.
      route("/api/dohae/blank-term", "features/dohae/api/blank-term.tsx"),
      // Phase 3 — 계획 학생 액션 + 노드 선택기 데이터.
      route("/api/study-plan", "features/study-plans/api/study-plan.tsx"),
      route("/api/study-plan/nodes", "features/study-plans/api/plan-nodes.tsx"),
      // 응시 결과·정오문제 이력은 모의고사 그룹에서 편입 제외(허브·약점 탭) → 모의고사
      // area 토글(mock.layout) 미부착. 평범한 leaf 라우트(화면이 자체 "뒤로" 제공).
      route(
        "/me/exam-results",
        "features/exam-results/screens/my-exam-results.tsx",
      ),
      route("/me/ox-sessions", "features/latest/screens/my-ox-sessions.tsx"),
      route(
        "/me/ox-sessions/:sessionId",
        "features/latest/screens/my-ox-session-result.tsx",
      ),
      route(
        "/me/ox-wrong-note",
        "features/latest/screens/my-ox-wrong-note.tsx",
      ),
      // feat-9-004 — AI Q&A 채팅 화면.
      route("/ai", "features/ai-qna/screens/ai-chat.tsx"),
      // feat-9-005 — 운영자 피드백 큐 + 지표 + eval 셋.
      route(
        "/admin/ai-qna/feedback",
        "features/ai-qna/screens/admin-ai-qna-feedback.tsx",
      ),
      route(
        "/admin/ai-qna/metrics",
        "features/ai-qna/screens/admin-ai-qna-metrics.tsx",
      ),
      route(
        "/admin/ai-qna/usage",
        "features/ai-qna/screens/admin-ai-qna-usage.tsx",
      ),
      route(
        "/admin/ai-qna/embed-status",
        "features/ai-qna/screens/admin-ai-qna-embed-status.tsx",
      ),
      route(
        "/admin/ai-qna/eval",
        "features/ai-qna/screens/admin-ai-qna-eval.tsx",
      ),
      route(
        "/admin/ai-qna/eval/new",
        "features/ai-qna/screens/admin-ai-qna-eval-edit.tsx",
        { id: "admin-ai-qna-eval-new" },
      ),
      route(
        "/admin/ai-qna/eval/:evalItemId/runs",
        "features/ai-qna/screens/admin-ai-qna-eval-runs.tsx",
      ),
      route(
        "/admin/ai-qna/eval/:evalItemId",
        "features/ai-qna/screens/admin-ai-qna-eval-edit.tsx",
      ),
      // feat-9-006 — 운영자 한도 설정.
      route(
        "/admin/ai-qna/settings",
        "features/ai-qna/screens/admin-ai-qna-settings.tsx",
      ),
      // feat-000-017 — 운영자 로그인 방식 설정(id/pw 토글).
      route("/admin/auth", "features/auth/screens/admin-auth-settings.tsx"),
      // Q&A 과목별 답변자 지정 — 새 질문 담당자 라우팅.
      route(
        "/admin/qna/answerers",
        "features/qna/screens/admin-qna-answerers.tsx",
      ),
      // Q&A 답변 현황(SLA) — 대기 큐 + 응답 시간 지표. manager+.
      route("/admin/qna/sla", "features/qna/screens/admin-qna-sla.tsx"),
      route("/onboarding/welcome", "features/onboarding/screens/welcome.tsx"),
      route("/pricing", "features/subscriptions/screens/pricing.tsx"),
      route(
        "/me/subscription",
        "features/subscriptions/screens/my-subscription.tsx",
      ),
      route(
        "/api/payments/create-order",
        "features/subscriptions/api/create-order.tsx",
      ),
      // 결제창 취소 시 pending 결제 정리(재시도 허용).
      route(
        "/api/payments/cancel-pending",
        "features/subscriptions/api/cancel-pending.tsx",
      ),
      // feat-11 장바구니 — 다건(강의·도서) 주문 결제 준비.
      route(
        "/api/payments/create-cart-order",
        "features/orders/api/create-cart-order.tsx",
      ),
      // feat-13 장바구니 쿠폰 미리보기.
      route(
        "/api/coupons/preview-cart",
        "features/coupons/api/preview-cart-coupon.tsx",
      ),
      // feat-11 B2-1 — 도서 찜 토글.
      route(
        "/api/lecture/wishlist",
        "features/bookstore/api/wishlist-toggle.tsx",
      ),
      // feat-11 B2-4 — 도서 재입고 알림 신청.
      route(
        "/api/lecture/restock-alert",
        "features/bookstore/api/restock-alert.tsx",
      ),
      // feat-11 S2 — PDF 도서 다운로드(소유·횟수 검증 + signed URL).
      route(
        "/api/lecture/book-download",
        "features/bookstore/api/book-download.tsx",
      ),
      route(
        "/api/payments/toss/confirm",
        "features/subscriptions/api/toss-confirm.tsx",
      ),
      // 토스 웹훅(비인증 리소스 라우트) — 가상계좌 입금·취소·환불 동기화.
      route(
        "/api/payments/toss/webhook",
        "features/subscriptions/api/toss-webhook.tsx",
      ),
      // feat-8-028 Stage 5 — 자동결제 카드 등록 콜백(빌링키 발급 + 첫 달 청구).
      route(
        "/api/payments/toss/billing-confirm",
        "features/subscriptions/api/billing-confirm.tsx",
      ),
      // feat-8-028 — 구독 해지/환불(본인). 3일 이내 전액환불+종료 / 이후 정기해지.
      route(
        "/api/subscriptions/cancel",
        "features/subscriptions/api/cancel-subscription.tsx",
      ),
      // feat-7-014 — 운영자 수강권 관리 (manager+).
      route(
        "/admin/subscriptions",
        "features/subscriptions/screens/admin-subscriptions.tsx",
      ),
      route(
        "/api/admin/subscription",
        "features/subscriptions/api/admin-subscription.tsx",
      ),
      // feat-8-029 — 주문·결제 관리 (manager+): 기간별 결제·환불 내역·통계.
      route(
        "/admin/payments",
        "features/subscriptions/screens/admin-payments.tsx",
      ),
      // feat-8-029 P2 — 매출 통계 (manager+): 항목(강의/교재)별 매출·상품 랭킹.
      route(
        "/admin/sales/stats",
        "features/subscriptions/screens/admin-sales-stats.tsx",
      ),
      // feat-8-029 P5 — 정기구독 통계 (manager+): 활성·유지율·해지·순증.
      route(
        "/admin/subscriptions/stats",
        "features/subscriptions/screens/admin-subscription-stats.tsx",
      ),
      // feat-8-029 Stage 2 — 강사 배분 기준 (manager+).
      route(
        "/admin/settlements/rules",
        "features/subscriptions/screens/admin-share-rules.tsx",
      ),
      route(
        "/api/admin/share-rule",
        "features/subscriptions/api/admin-share-rule.tsx",
      ),
      // feat-8-029 P6 — 도서 배분 기준 (manager+).
      route(
        "/admin/settlements/books",
        "features/subscriptions/screens/admin-book-settlements.tsx",
      ),
      route(
        "/api/admin/book-settlement-rule",
        "features/subscriptions/api/admin-book-settlement-rule.tsx",
      ),
      // feat-8-029 P6 — 도서 정산 계산·지급 (manager+).
      route(
        "/admin/settlements/book-runs",
        "features/subscriptions/screens/admin-book-settlement-runs.tsx",
      ),
      route(
        "/admin/settlements/book-runs/:settlementId",
        "features/subscriptions/screens/admin-book-settlement-detail.tsx",
      ),
      route(
        "/api/admin/book-settlement",
        "features/subscriptions/api/admin-book-settlement.tsx",
      ),
      // feat-7-042 — Q&A 답변 적립·지급 (manager+).
      route(
        "/admin/settlements/qna-rewards",
        "features/admin/screens/admin-qna-rewards.tsx",
      ),
      // feat-8-029 Stage 3 — 강사 정산 (manager+).
      route(
        "/admin/settlements",
        "features/subscriptions/screens/admin-settlements.tsx",
      ),
      route(
        "/admin/settlements/:settlementId",
        "features/subscriptions/screens/admin-settlement-detail.tsx",
      ),
      route(
        "/api/admin/settlement",
        "features/subscriptions/api/admin-settlement.tsx",
      ),
      // feat-8-028 — 상품·요금 관리 (manager+).
      route("/admin/pricing", "features/subscriptions/screens/admin-plans.tsx"),
      route("/api/admin/plan", "features/subscriptions/api/admin-plan.tsx"),
      // feat-8-028 — 할인 관리 (manager+).
      route(
        "/admin/discounts",
        "features/subscriptions/screens/admin-discounts.tsx",
      ),
      route(
        "/api/admin/discount",
        "features/subscriptions/api/admin-discount.tsx",
      ),
      route("/api/comments/comment", "features/comments/api/comment.tsx"),
      // 판례 공식 전문 PDF — 매 클릭마다 fresh signed URL 발급 + 302 redirect.
      // 클라엔 정적 URL 만 노출(만료 무관). 학생 인증 필수.
      route(
        "/api/cases/:caseId/official-text-pdf",
        "features/cases/api/official-text-pdf.tsx",
      ),
      route(
        "/api/lecture-resources",
        "features/lectures/api/lecture-resource.tsx",
      ),
      route(
        "/api/admin/case-study-review",
        "features/lectures/api/case-study-review.tsx",
      ),
      route(
        "/admin/case-study-review",
        "features/lectures/screens/admin-case-study-review.tsx",
      ),
      route(
        "/admin/systematic-tree",
        "features/lectures/screens/admin-systematic-tree.tsx",
      ),
      route(
        "/admin/lecture-locations",
        "features/lectures/screens/admin-lecture-locations.tsx",
      ),
      // 도해특허법 전체 열람·검수 — ★staff 전용(수험생 비노출).
      route("/admin/dohae", "features/dohae/screens/admin-dohae.tsx"),
      // 도해 유닛 텍스트 편집 — ★staff 전용. 구조는 못 바꾼다(원본 재파싱의 몫).
      route(
        "/admin/dohae/:unitKey",
        "features/dohae/screens/admin-dohae-edit.tsx",
      ),
      // feat-7-041 — 전체 학습현황(학원 전체 집계·익명, manager+).
      route(
        "/admin/analytics/students",
        "features/admin/screens/admin-students-analytics.tsx",
      ),
      // ⑥ 전체 공통 약점 단원 — 지연 로드 리소스 라우트(JSON).
      route(
        "/admin/analytics/students/weak-nodes",
        "features/admin/screens/admin-students-weak-nodes.tsx",
      ),
      // ⑥-드릴다운: 한 약점 단원 → 약한 반·학생(지연 로드 리소스 라우트).
      route(
        "/admin/analytics/students/weak-nodes/:lawCode/:nodeId",
        "features/admin/screens/admin-weak-node-detail.tsx",
      ),
      route(
        "/admin/exam-results",
        "features/exam-results/screens/admin-exam-results.tsx",
      ),
      route(
        "/admin/analytics/passers",
        "features/exam-results/screens/admin-passer-cases.tsx",
      ),
      route(
        "/admin/analytics/failure-patterns",
        "features/exam-results/screens/admin-failure-patterns.tsx",
      ),
      route(
        "/study/passer-summaries",
        "features/exam-results/screens/passer-summaries.tsx",
      ),
      route(
        "/study/passer-trend",
        "features/exam-results/screens/passer-trend.tsx",
      ),
      route(
        "/study/electives-guide",
        "features/exam-results/screens/electives-guide.tsx",
      ),
      route(
        "/admin/students/:profileId",
        "features/admin/screens/admin-student-detail.tsx",
      ),
      route(
        "/admin/relations/gaps",
        "features/admin/screens/admin-relation-gaps.tsx",
      ),
      route(
        "/admin/relations/bulk",
        "features/admin/screens/admin-relations-bulk.tsx",
      ),
      route(
        "/admin/relations/exam-cases",
        "features/admin/screens/admin-exam-case-links.tsx",
      ),
      route(
        "/admin/relations/article/:lawCode/:articleNumber",
        "features/admin/screens/admin-article-relations.tsx",
      ),
      route("/admin/laws", "features/admin/screens/admin-laws-hub.tsx"),
      route(
        "/admin/laws/health",
        "features/admin/screens/admin-law-health.tsx",
      ),
      route(
        "/admin/seeds/preview",
        "features/admin/screens/admin-seeds-preview.tsx",
      ),
      route(
        "/admin/laws/:lawCode/revisions",
        "features/admin/screens/admin-law-revisions.tsx",
      ),
      route(
        "/admin/laws/:lawCode/revisions/:revisionId",
        "features/admin/screens/admin-law-revision-workspace.tsx",
      ),
      route(
        "/admin/laws/:lawCode/completeness",
        "features/admin/screens/admin-law-completeness.tsx",
      ),
      // 판례 기반 쟁점추출 훈련 — 학생 응시.
      layout("features/gs/layouts/mock.layout.tsx", { id: "mock-area-case" }, [
        route(
          "/case-training",
          "features/cases/screens/case-training-index.tsx",
        ),
        route(
          "/case-training/:itemId",
          "features/cases/screens/case-training-take.tsx",
        ),
        // ③④ 결론·강약 학생 응시.
        route(
          "/case-training/:itemId/conclusion",
          "features/cases/screens/case-training-conclusion.tsx",
        ),
      ]),
      // 판례 기반 쟁점추출 훈련 — 강사 출제.
      ...prefix("/admin/case-training", [
        index("features/cases/screens/admin-case-training-list.tsx"),
        route("/new", "features/cases/screens/admin-case-training-new.tsx"),
        route(
          "/:itemId",
          "features/cases/screens/admin-case-training-edit.tsx",
        ),
      ]),
      // feat-2-035 — 판례 도식(사실관계→쟁점→법조문→법리→포섭→결론). 판례당 1건이라
      // 목록·편집 키가 itemId 가 아니라 caseId 다.
      ...prefix("/admin/case-diagrams", [
        index("features/cases/screens/admin-case-diagram-list.tsx"),
        route("/:caseId", "features/cases/screens/admin-case-diagram-edit.tsx"),
      ]),
      ...prefix("/admin/blanks", [
        index("features/blanks/screens/admin-blanks-list.tsx"),
        route("/stats", "features/blanks/screens/admin-blanks-stats.tsx"),
        // feat-2-029 S5 — 판례 빈칸 후보(OX 기출 유래) 승인 큐.
        route("/cases", "features/blanks/screens/admin-case-blanks.tsx"),
        // 조문 빈칸 후보(OX 기출 유래) 승인 큐.
        route(
          "/article-candidates",
          "features/blanks/screens/admin-article-blank-candidates.tsx",
        ),
        route("/law/:lawCode", "features/blanks/screens/admin-blanks-all.tsx"),
        route("/:setId", "features/blanks/screens/admin-blanks-edit.tsx"),
      ]),
      // feat-2-023 암기 카드(SRS v2) 생성 — 빈칸 클러스터(암기 자료군) 인접 배치.
      route("/admin/srs-cards", "features/admin/screens/admin-srs-cards.tsx"),
      ...prefix("/admin/gs", [
        index("features/gs/screens/admin-gs-list.tsx"),
        // §3 GS 비용 가드 — AI/OCR 사용량 + cap 잔여 + 회차 top.
        route("/usage", "features/gs/screens/admin-gs-usage.tsx"),
        route("/series", "features/gs/screens/admin-gs-series-list.tsx", {
          id: "admin-gs-series-list",
        }),
        route("/series/new", "features/gs/screens/admin-gs-series-edit.tsx", {
          id: "admin-gs-series-new",
        }),
        route(
          "/series/:seriesId",
          "features/gs/screens/admin-gs-series-edit.tsx",
        ),
        route(
          "/series/:seriesId/stats",
          "features/gs/screens/admin-gs-series-stats.tsx",
        ),
        route("/new", "features/gs/screens/admin-gs-edit.tsx", {
          id: "admin-gs-new",
        }),
        route("/:roundId", "features/gs/screens/admin-gs-edit.tsx"),
        route(
          "/:roundId/stats",
          "features/gs/screens/admin-gs-round-stats.tsx",
        ),
        route("/:roundId/grade", "features/gs/screens/admin-gs-grade-list.tsx"),
        route(
          "/:roundId/grade/:submissionId",
          "features/gs/screens/admin-gs-grade.tsx",
        ),
        route(
          "/:roundId/peer-review",
          "features/gs/screens/admin-gs-peer-review.tsx",
        ),
        route(
          "/:roundId/disputes",
          "features/gs/screens/admin-gs-disputes.tsx",
        ),
        route(
          "/:roundId/distinctions",
          "features/gs/screens/admin-gs-distinctions.tsx",
        ),
        route("/:roundId/issues", "features/gs/screens/admin-gs-issues.tsx"),
        route("/points", "features/gs/screens/admin-gs-points.tsx"),
      ]),
      ...prefix("/admin/problems", [
        index("features/problems/screens/admin-problems-list.tsx"),
        route("/new", "features/admin/screens/admin-problem-new.tsx"),
        route("/review", "features/admin/screens/admin-problem-review.tsx"),
        route(
          "/explanations",
          "features/admin/screens/admin-explanation-review.tsx",
        ),
        route(
          "/text-conversion",
          "features/admin/screens/admin-text-review.tsx",
        ),
        route("/ai-gen", "features/admin/screens/admin-ai-problem-gen.tsx"),
        route("/ox", "features/problems/screens/admin-ox-review.tsx"),
        route("/stats", "features/admin/screens/admin-problem-stats.tsx"),
        // 기출 시험번호(exam_number) 매칭 — /:problemId 보다 먼저(정적 우선).
        route(
          "/exam-number",
          "features/problems/screens/admin-exam-number.tsx",
        ),
        route(
          "/system/:nodeId",
          "features/problems/screens/admin-problems-system-edit.tsx",
        ),
        route(
          "/:problemId",
          "features/problems/screens/admin-problem-edit.tsx",
        ),
      ]),

      // feat-10-005 통합 모의고사 출제 — 목록 + 시험별 편집(교시 구성).
      route("/admin/mcq-exams", "features/admin/screens/admin-mcq-exams.tsx"),
      route(
        "/admin/mcq-exams/:examId",
        "features/admin/screens/admin-mcq-exam-edit.tsx",
      ),

      layout(
        "features/community/layouts/community.layout.tsx",
        { id: "community-area-qna" },
        [
          ...prefix("/qna", [
            index("features/qna/screens/qna-list.tsx"),
            route("/new", "features/qna/screens/qna-new.tsx"),
            // 질문자 프로필(강사·관리자 전용) — 회원정보·질문 이력(수준·평균)·쪽지.
            route("/asker/:profileId", "features/qna/screens/qna-asker.tsx"),
            route("/:threadId", "features/qna/screens/qna-detail.tsx"),
          ]),
        ],
      ),

      route("/account/edit", "features/users/screens/account.tsx"),
    ]),
    // Dashboard — 자체 인증 가드 layout 을 navigation.layout 안에 nest.
    layout("features/dashboard/layouts/dashboard.layout.tsx", [
      route("/dashboard", "features/dashboard/screens/dashboard.tsx"),
    ]),
    // feat-8-026 — 학습 데이터 활용 필수 동의 게이트(자체 인증, private.layout 밖 = 루프 회피).
    route("/consent", "features/onboarding/screens/consent.tsx"),
    // feat-8-030 — 가입 후 필수정보 입력 게이트(자체 인증, private.layout 밖 = 루프 회피).
    route("/onboarding/profile", "features/onboarding/screens/profile.tsx"),
    // 서비스 접근 승인 대기(자체 인증, private.layout 밖 = 루프 회피).
    route(
      "/pending-approval",
      "features/onboarding/screens/pending-approval.tsx",
    ),
  ]),

  ...prefix("/legal", [route("/:slug", "features/legal/screens/policy.tsx")]),
] satisfies RouteConfig;
