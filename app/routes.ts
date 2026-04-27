/**
 * Application Routes Configuration
 *
 * This file defines all routes for the application using React Router's
 * file-based routing system. Routes are organized by feature and access level.
 *
 * The structure uses layouts for shared UI elements and prefixes for route grouping.
 * This approach creates a hierarchical routing system that's both maintainable and scalable.
 */
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
  layout("core/layouts/private.layout.tsx", { id: "private-application" }, [
    ...prefix("/applications/provisional-application", [
      route(
        "/start",
        "features/applications/screens/provisional-application/start.tsx",
      ),
      route(
        "/payment",
        "features/applications/screens/provisional-application/payment.tsx",
      ),
      route(
        "/:patent_id/:process_id/confirm",
        "features/applications/screens/provisional-application/confirm.tsx",
      ),
      route(
        "/api/create-checkout-session",
        "features/applications/api/create-checkout-session.tsx",
      ),
      route(
        "/:patent_id/:process_id/success",
        "features/applications/screens/provisional-application/success.tsx",
      ),
    ]),
    ...prefix("/applications/national-phase", [
      route("/start", "features/applications/screens/national-phase/start.tsx"),
      route("/epo", "features/applications/screens/national-phase/epo.tsx"),
      route(
        "/payment",
        "features/applications/screens/national-phase/payment.tsx",
      ),
      route(
        "/:patent_id/:process_id/confirm",
        "features/applications/screens/national-phase/confirm.tsx",
      ),
      route(
        "/:patent_id/:process_id/success",
        "features/applications/screens/national-phase/success.tsx",
      ),
    ]),
  ]),
  ...prefix("/debug", [
    // You should delete this in production.
    route("/sentry", "debug/sentry.tsx"),
    route("/analytics", "debug/analytics.tsx"),
  ]),
  // API Routes. Routes that export actions and loaders but no UI.
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
    ...prefix("/cron", [route("/mailer", "features/cron/api/mailer.tsx")]),
    ...prefix("/blog", [route("/og", "features/blog/api/og.tsx")]),
    route("/send-poa-email", "features/applications/api/send-poa-email.tsx"),
  ]),

  layout("core/layouts/navigation.layout.tsx", [
    route("/auth/confirm", "features/auth/screens/confirm.tsx"),
    index("features/home/screens/home.tsx"),
    route("/error", "core/screens/error.tsx"),
    ...prefix("/applications", [
      layout(
        "features/applications/screens/provisional-application/layout.tsx",
        [
          route(
            "/provisional-application",
            "features/applications/screens/provisional-application/overview.tsx",
          ),
          route(
            "/provisional-application/price",
            "features/applications/screens/provisional-application/price.tsx",
          ),
          route(
            "/provisional-application/faq",
            "features/applications/screens/provisional-application/faq.tsx",
          ),
          route(
            "/provisional-application/guide",
            "features/applications/screens/provisional-application/guide.tsx",
          ),
        ],
      ),
      layout("features/applications/screens/national-phase/layout.tsx", [
        route(
          "/national-phase",
          "features/applications/screens/national-phase/overview.tsx",
        ),
        route(
          "/national-phase/price",
          "features/applications/screens/national-phase/price.tsx",
        ),
        route(
          "/national-phase/faq",
          "features/applications/screens/national-phase/faq.tsx",
        ),
        route(
          "/national-phase/guide",
          "features/applications/screens/national-phase/guide.tsx",
        ),
      ]),
      route(
        "/trademark-application",
        "features/applications/screens/trademark-application.tsx",
      ),
      route(
        "/design-application",
        "features/applications/screens/design-application.tsx",
      ),
      route("/payment", "features/applications/screens/payment.tsx"),
    ]),
    layout("core/layouts/public.layout.tsx", [
      // Routes that should only be visible to unauthenticated users.
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
    layout("core/layouts/private.layout.tsx", { id: "private-auth" }, [
      ...prefix("/auth", [
        route(
          "/forgot-password/create",
          "features/auth/screens/new-password.tsx",
        ),
        route("/email-verified", "features/auth/screens/email-verified.tsx"),
      ]),
      // Routes that should only be visible to authenticated users.
      route("/logout", "features/auth/screens/logout.tsx"),
    ]),
    route("/contact", "features/contact/screens/contact-us.tsx"),
    ...prefix("/payments", [
      route("/checkout", "features/payments/screens/checkout.tsx"),
      layout("core/layouts/private.layout.tsx", { id: "private-payments" }, [
        route("/success", "features/payments/screens/success.tsx"),
        route("/failure", "features/payments/screens/failure.tsx"),
      ]),
    ]),
  ]),

  layout("core/layouts/private.layout.tsx", { id: "private-dashboard" }, [
    layout("features/users/layouts/dashboard.layout.tsx", [
      ...prefix("/dashboard", [
        index("features/users/screens/dashboard.tsx"),
        route("/payments", "features/payments/screens/payments.tsx"),
        route(
          "/provisional-applications",
          "features/applications/screens/provisional.tsx",
        ),
      ]),
      route("/account/edit", "features/users/screens/account.tsx"),
    ]),
  ]),

  ...prefix("/legal", [route("/:slug", "features/legal/screens/policy.tsx")]),
  layout("features/blog/layouts/blog.layout.tsx", [
    ...prefix("/blog", [
      index("features/blog/screens/posts.tsx"),
      route("/:slug", "features/blog/screens/post.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
