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

  ...prefix("/debug", [
    route("/sentry", "debug/sentry.tsx"),
    route("/analytics", "debug/analytics.tsx"),
  ]),

  // API Routes (no UI)
  ...prefix("/api", [
    route("/search", "features/search/api/search.tsx"),
    route("/search/clear-history", "features/search/api/clear-history.tsx"),
    route("/bug-report", "features/bug-reports/api/bug-report.tsx"),
    route(
      "/api/notifications/mark-read",
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
      "/api/study/recommendation-prefs",
      "features/study/api/recommendation-prefs.tsx",
    ),
    route("/api/srs/queue", "features/srs/api/queue.tsx"),
    route("/api/srs/review", "features/srs/api/review.tsx"),
    route("/api/srs/stats", "features/srs/api/stats.tsx"),
    route("/api/srs/export", "features/srs/api/export.tsx"),
    route("/api/community/report", "features/community/api/report.tsx"),
    route(
      "/api/community/report-resolve",
      "features/community/api/report-resolve.tsx",
    ),
    route(
      "/api/community/study-join",
      "features/community/api/study-join.tsx",
    ),
    ...prefix("/annotations", [
      route("/bookmark", "features/annotations/api/bookmark.tsx"),
      route("/memo", "features/annotations/api/memo.tsx"),
      route("/highlight", "features/annotations/api/highlight.tsx"),
      route(
        "/highlight-alias",
        "features/annotations/api/highlight-alias.tsx",
      ),
    ]),
    ...prefix("/blanks", [
      route("/attempt", "features/blanks/api/attempt.tsx"),
      route("/auto-attempt", "features/blanks/api/auto-attempt.tsx"),
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
    ]),
    ...prefix("/recitation", [
      route("/attempt", "features/recitation/api/attempt.tsx"),
    ]),
    ...prefix("/qna", [route("/thread", "features/qna/api/thread.tsx")]),
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
    ...prefix("/laws", [
      route("/admin-edit-article", "features/laws/api/admin-edit-article.tsx"),
      route("/article-children", "features/laws/api/article-children.tsx"),
    ]),
    ...prefix("/admin", [
      route("/case", "features/admin/api/case.tsx"),
      route("/case-link", "features/admin/api/case-link.tsx"),
      route("/case-citations", "features/admin/api/case-citations.tsx"),
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
      route("/cohort", "features/admin/api/cohort.tsx"),
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
    ]),
    ...prefix("/study", [
      route("/session-complete", "features/study/api/session-complete.tsx"),
      route("/subjective-attempt", "features/study/api/subjective-attempt.tsx"),
      route("/subjective-review", "features/study/api/subjective-review.tsx"),
      route("/session-from-wrong", "features/study/api/session-from-wrong.tsx"),
      route(
        "/session-from-bookmarks",
        "features/study/api/session-from-bookmarks.tsx",
      ),
      route("/start-flow", "features/study/api/start-flow.tsx"),
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
    ]),
    ...prefix("/cron", [
      route("/gs-auto-assign", "features/gs/api/cron-auto-assign.tsx"),
    ]),
  ]),

  // Pages with top navigation + footer
  layout("core/layouts/navigation.layout.tsx", [
    index("features/home/screens/home.tsx"),
    route("/auth/confirm", "features/auth/screens/confirm.tsx"),
    route("/error", "core/screens/error.tsx"),

    // Only-when-logged-out
    layout("core/layouts/public.layout.tsx", [
      route("/login", "features/auth/screens/login.tsx"),
      route("/join", "features/auth/screens/join.tsx"),
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
        ],
      ),
      // feat-8-008 학습보조 영역 게이트 — area_study_aids 미보유 시 /pricing redirect.
      layout("features/study/layouts/study-aids.layout.tsx", [
        route("/study/blanks", "features/blanks/screens/blanks-stats.tsx"),
        route("/study/wrong-note", "features/study/screens/wrong-note.tsx"),
        route("/study/bookmarks", "features/study/screens/bookmarks.tsx"),
        route("/study/notes", "features/study/screens/notes.tsx"),
        route("/study/highlights", "features/study/screens/highlights.tsx"),
        route("/study/comments", "features/study/screens/comments.tsx"),
      ]),
      route("/inbox", "features/notifications/screens/student-inbox.tsx"),

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
          route("/mcq/exams", "features/latest/screens/mcq-exam-index.tsx"),
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
        ]),
      ]),
      ]),

      // feat-8-008 2차 모의(온라인 GS) 영역 게이트 — area_mock_exams.
      layout("features/gs/layouts/gs.layout.tsx", [
        route("/gs", "features/gs/screens/gs.tsx"),
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
      route("/admin", "features/admin/screens/admin.tsx"),
      route(
        "/admin/subjective-reviews",
        "features/admin/screens/admin-subjective-reviews.tsx",
      ),
      route("/admin/audit-logs", "features/admin/screens/admin-audit-logs.tsx"),
      route("/admin/inbox", "features/notifications/screens/staff-inbox.tsx"),
      route(
        "/admin/bug-reports",
        "features/bug-reports/screens/admin-bug-reports.tsx",
      ),
      route(
        "/admin/announcements",
        "features/admin/screens/admin-announcements.tsx",
      ),
      route(
        "/admin/announcements/audiences",
        "features/admin/screens/admin-announcement-audiences.tsx",
      ),
      route("/admin/cases", "features/admin/screens/admin-cases.tsx"),
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
      route("/admin/users", "features/admin/screens/admin-users.tsx"),
      route(
        "/admin/community/reports",
        "features/admin/screens/admin-community-reports.tsx",
      ),
      route("/admin/cohorts", "features/admin/screens/admin-cohorts.tsx"),
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
      route(
        "/admin/cohorts/:cohortId/progress",
        "features/admin/screens/admin-cohort-progress.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/stats",
        "features/admin/screens/admin-cohort-stats.tsx",
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
      route("/api/admin/assignment", "features/admin/api/assignment.tsx"),
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
      route(
        "/api/cron/pass-predict-snapshot",
        "features/cron/api/pass-predict-snapshot.tsx",
      ),
      route(
        "/api/cron/exam-result-reminder",
        "features/cron/api/exam-result-reminder.tsx",
      ),
      // feat-9-001 — RAG 임베딩 cron (Voyage). dry-run 모드는 VOYAGE_API_KEY 미설정 시 자동.
      route(
        "/api/cron/embed-chunks",
        "features/cron/api/embed-chunks.tsx",
      ),
      // feat-9-005 v1.2 — eval 자동 평가 cron. ANTHROPIC/VOYAGE 키 미설정 시 dry-run.
      route(
        "/api/cron/ai-eval-run",
        "features/cron/api/ai-eval-run.tsx",
      ),
      // feat-7-004 — 시행일 도래 개정 자동 현행 전환 cron.
      route(
        "/api/cron/promote-law-revisions",
        "features/cron/api/promote-law-revisions.tsx",
      ),
      route(
        "/api/student/lecture-progress",
        "features/lectures/api/progress.tsx",
      ),
      route(
        "/lectures/:itemId",
        "features/lectures/screens/lecture-viewer.tsx",
      ),
      route("/api/admin/student-note", "features/admin/api/student-note.tsx"),
      route("/api/admin/importance", "features/admin/api/importance.tsx"),
      // feat-8-008 학습관리 영역 게이트 (과제).
      layout(
        "features/study/layouts/study-management.layout.tsx",
        { id: "study-mgmt-assignments" },
        [
          route(
            "/assignments",
            "features/assignments/screens/student-assignments.tsx",
          ),
          route(
            "/assignments/:assignmentId",
            "features/assignments/screens/student-assignment-detail.tsx",
          ),
        ],
      ),
      route(
        "/me/exam-results",
        "features/exam-results/screens/my-exam-results.tsx",
      ),
      route("/me/ox-sessions", "features/latest/screens/my-ox-sessions.tsx"),
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
      route(
        "/api/payments/toss/confirm",
        "features/subscriptions/api/toss-confirm.tsx",
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
      route("/api/comments/comment", "features/comments/api/comment.tsx"),
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
      route(
        "/admin/laws",
        "features/admin/screens/admin-laws-hub.tsx",
      ),
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
      ...prefix("/admin/blanks", [
        index("features/blanks/screens/admin-blanks-list.tsx"),
        route("/stats", "features/blanks/screens/admin-blanks-stats.tsx"),
        route("/law/:lawCode", "features/blanks/screens/admin-blanks-all.tsx"),
        route("/:setId", "features/blanks/screens/admin-blanks-edit.tsx"),
      ]),
      ...prefix("/admin/gs", [
        index("features/gs/screens/admin-gs-list.tsx"),
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
        route("/points", "features/gs/screens/admin-gs-points.tsx"),
      ]),
      ...prefix("/admin/problems", [
        index("features/problems/screens/admin-problems-list.tsx"),
        route("/new", "features/admin/screens/admin-problem-new.tsx"),
        route("/ox", "features/problems/screens/admin-ox-review.tsx"),
        route("/stats", "features/admin/screens/admin-problem-stats.tsx"),
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

      ...prefix("/qna", [
        index("features/qna/screens/qna-list.tsx"),
        route("/new", "features/qna/screens/qna-new.tsx"),
        route("/:threadId", "features/qna/screens/qna-detail.tsx"),
      ]),

      route("/account/edit", "features/users/screens/account.tsx"),
    ]),
  ]),

  // Dashboard owns its own chrome (sidebar + topbar) — outside the global navigation layout
  layout("features/dashboard/layouts/dashboard.layout.tsx", [
    route("/dashboard", "features/dashboard/screens/dashboard.tsx"),
  ]),

  ...prefix("/legal", [route("/:slug", "features/legal/screens/policy.tsx")]),
] satisfies RouteConfig;
