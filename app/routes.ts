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
    ...prefix("/annotations", [
      route("/bookmark", "features/annotations/api/bookmark.tsx"),
      route("/memo", "features/annotations/api/memo.tsx"),
      route("/highlight", "features/annotations/api/highlight.tsx"),
    ]),
    ...prefix("/blanks", [
      route("/attempt", "features/blanks/api/attempt.tsx"),
      route("/auto-attempt", "features/blanks/api/auto-attempt.tsx"),
      route("/admin-answer", "features/blanks/api/admin-answer.tsx"),
      route("/admin-add-blank", "features/blanks/api/admin-add-blank.tsx"),
      route("/admin-remove-blank", "features/blanks/api/admin-remove-blank.tsx"),
      route("/admin-remove-blanks", "features/blanks/api/admin-remove-blanks.tsx"),
      route("/admin-create-set", "features/blanks/api/admin-create-set.tsx"),
      route("/fork", "features/blanks/api/fork.tsx"),
    ]),
    ...prefix("/recitation", [
      route("/attempt", "features/recitation/api/attempt.tsx"),
    ]),
    ...prefix("/qna", [
      route("/thread", "features/qna/api/thread.tsx"),
    ]),
    ...prefix("/laws", [
      route(
        "/admin-edit-article",
        "features/laws/api/admin-edit-article.tsx",
      ),
      route("/article-comment", "features/laws/api/article-comment.tsx"),
      route("/article-children", "features/laws/api/article-children.tsx"),
    ]),
    ...prefix("/admin", [
      route("/case", "features/admin/api/case.tsx"),
      route("/case-link", "features/admin/api/case-link.tsx"),
      route("/problem-create", "features/admin/api/problem-create.tsx"),
      route("/case-reference", "features/admin/api/case-reference.tsx"),
      route("/paper", "features/admin/api/paper.tsx"),
      route("/paper-link", "features/admin/api/paper-link.tsx"),
      route("/book-update", "features/admin/api/book-update.tsx"),
      route("/mcq-pack", "features/admin/api/mcq-pack.tsx"),
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
      route(
        "/ox-review-update",
        "features/problems/api/ox-review-update.tsx",
      ),
    ]),
    ...prefix("/study", [
      route("/session-complete", "features/study/api/session-complete.tsx"),
      route(
        "/subjective-attempt",
        "features/study/api/subjective-attempt.tsx",
      ),
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
        route("/api/resend", "features/auth/api/resend.tsx"),
        route(
          "/forgot-password/reset",
          "features/auth/screens/forgot-password.tsx",
        ),
        route("/magic-link", "features/auth/screens/magic-link.tsx"),
        ...prefix("/otp", [
          route("/start", "features/auth/screens/otp/start.tsx"),
          route("/complete", "features/auth/screens/otp/complete.tsx"),
        ]),
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
      route("/auth/forgot-password/create", "features/auth/screens/new-password.tsx"),
      route("/auth/email-verified", "features/auth/screens/email-verified.tsx"),
      route("/logout", "features/auth/screens/logout.tsx"),

      route("/goals", "features/goals/screens/goals.tsx"),
      route("/study/blanks", "features/blanks/screens/blanks-stats.tsx"),
      route("/study/wrong-note", "features/study/screens/wrong-note.tsx"),
      route("/study/bookmarks", "features/study/screens/bookmarks.tsx"),
      route("/study/notes", "features/study/screens/notes.tsx"),
      route("/study/highlights", "features/study/screens/highlights.tsx"),

      ...prefix("/latest", [
        route("/laws", "features/latest/screens/laws.tsx"),
        route("/cases", "features/latest/screens/cases.tsx"),
        route("/mcq", "features/latest/screens/mcq.tsx"),
        route("/mcq/:packId", "features/latest/screens/mcq-pack-detail.tsx"),
        route(
          "/mcq/:packId/sheet/:sessionId",
          "features/latest/screens/mcq-pack-sheet.tsx",
        ),
        route(
          "/mcq/:packId/result/:sessionId",
          "features/latest/screens/mcq-pack-result.tsx",
        ),
        route("/essay", "features/latest/screens/essay.tsx"),
        route("/papers", "features/latest/screens/papers.tsx"),
        route("/book-updates", "features/latest/screens/book-updates.tsx"),
      ]),

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
          "/:subject/problems/system",
          "features/subjects/screens/problems-system-index.tsx",
        ),
        route(
          "/:subject/problems/:problemId",
          "features/subjects/screens/problem-viewer.tsx",
        ),
        route(
          "/:subject/quiz/setup",
          "features/subjects/screens/quiz-setup.tsx",
        ),
        route(
          "/:subject/ox",
          "features/subjects/screens/subject-ox.tsx",
        ),
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
      route(
        "/gs/series/:seriesId",
        "features/gs/screens/gs-my-series.tsx",
      ),
      route(
        "/gs/:roundId/distinguished",
        "features/gs/screens/gs-distinguished.tsx",
      ),
      route("/gs/points", "features/gs/screens/gs-points.tsx"),
      route("/community", "features/community/screens/community.tsx"),
      route(
        "/announcements",
        "features/announcements/screens/announcements-inbox.tsx",
      ),
      route("/admin", "features/admin/screens/admin.tsx"),
      route(
        "/admin/announcements",
        "features/admin/screens/admin-announcements.tsx",
      ),
      route(
        "/admin/announcements/audiences",
        "features/admin/screens/admin-announcement-audiences.tsx",
      ),
      route("/admin/cases", "features/admin/screens/admin-cases.tsx"),
      route(
        "/admin/cases/edit",
        "features/admin/screens/admin-case-edit.tsx",
        { id: "admin-case-new" },
      ),
      route(
        "/admin/cases/edit/:caseId",
        "features/admin/screens/admin-case-edit.tsx",
      ),
      route("/admin/users", "features/admin/screens/admin-users.tsx"),
      route("/admin/cohorts", "features/admin/screens/admin-cohorts.tsx"),
      route(
        "/admin/cohorts/:cohortId",
        "features/admin/screens/admin-cohort-detail.tsx",
      ),
      route(
        "/admin/cohorts/:cohortId/progress",
        "features/admin/screens/admin-cohort-progress.tsx",
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
        "/admin/relations/article/:lawCode/:articleNumber",
        "features/admin/screens/admin-article-relations.tsx",
      ),
      route(
        "/admin/laws/:lawCode/revisions",
        "features/admin/screens/admin-law-revisions.tsx",
      ),
      route(
        "/admin/laws/:lawCode/revisions/:revisionId",
        "features/admin/screens/admin-law-revision-workspace.tsx",
      ),
      ...prefix("/admin/blanks", [
        index("features/blanks/screens/admin-blanks-list.tsx"),
        route("/stats", "features/blanks/screens/admin-blanks-stats.tsx"),
        route(
          "/law/:lawCode",
          "features/blanks/screens/admin-blanks-all.tsx",
        ),
        route("/:setId", "features/blanks/screens/admin-blanks-edit.tsx"),
      ]),
      ...prefix("/admin/gs", [
        index("features/gs/screens/admin-gs-list.tsx"),
        route(
          "/series",
          "features/gs/screens/admin-gs-series-list.tsx",
          { id: "admin-gs-series-list" },
        ),
        route(
          "/series/new",
          "features/gs/screens/admin-gs-series-edit.tsx",
          { id: "admin-gs-series-new" },
        ),
        route(
          "/series/:seriesId",
          "features/gs/screens/admin-gs-series-edit.tsx",
        ),
        route(
          "/series/:seriesId/stats",
          "features/gs/screens/admin-gs-series-stats.tsx",
        ),
        route("/new", "features/gs/screens/admin-gs-edit.tsx", { id: "admin-gs-new" }),
        route("/:roundId", "features/gs/screens/admin-gs-edit.tsx"),
        route(
          "/:roundId/stats",
          "features/gs/screens/admin-gs-round-stats.tsx",
        ),
        route(
          "/:roundId/grade",
          "features/gs/screens/admin-gs-grade-list.tsx",
        ),
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
        route(
          "/points",
          "features/gs/screens/admin-gs-points.tsx",
        ),
      ]),
      ...prefix("/admin/problems", [
        index("features/problems/screens/admin-problems-list.tsx"),
        route("/new", "features/admin/screens/admin-problem-new.tsx"),
        route("/by-system", "features/problems/screens/admin-problems-by-system.tsx"),
        route("/ox", "features/problems/screens/admin-ox-review.tsx"),
        route("/stats", "features/admin/screens/admin-problem-stats.tsx"),
        route(
          "/system/:nodeId",
          "features/problems/screens/admin-problems-system-edit.tsx",
        ),
        route("/:problemId", "features/problems/screens/admin-problem-edit.tsx"),
      ]),

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
