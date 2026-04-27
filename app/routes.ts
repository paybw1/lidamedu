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

      ...prefix("/latest", [
        route("/laws", "features/latest/screens/laws.tsx"),
        route("/cases", "features/latest/screens/cases.tsx"),
        route("/mcq", "features/latest/screens/mcq.tsx"),
        route("/essay", "features/latest/screens/essay.tsx"),
        route("/papers", "features/latest/screens/papers.tsx"),
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
        ]),
      ]),

      route("/gs", "features/gs/screens/gs.tsx"),
      route("/community", "features/community/screens/community.tsx"),
      route("/admin", "features/admin/screens/admin.tsx"),

      route("/account/edit", "features/users/screens/account.tsx"),
    ]),
  ]),

  // Dashboard owns its own chrome (sidebar + topbar) — outside the global navigation layout
  layout("features/dashboard/layouts/dashboard.layout.tsx", [
    route("/dashboard", "features/dashboard/screens/dashboard.tsx"),
  ]),

  ...prefix("/legal", [route("/:slug", "features/legal/screens/policy.tsx")]),
] satisfies RouteConfig;
