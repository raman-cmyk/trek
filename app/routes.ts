import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  // Public site (SSR + SEO), sharing the header/footer shell.
  layout("routes/_public.tsx", [
    index("routes/home.tsx"),
    route("guides", "routes/guides.tsx"),
    route("guides/:slug", "routes/guides.$slug.tsx"),
    route("experiences", "routes/experiences.tsx"),
    route("experiences/:slug", "routes/experiences.$slug.tsx"),
    route("treks/:slug", "routes/treks.$slug.tsx"),
    route("routes/:slug", "routes/routes.$slug.tsx"),
    route("transparency", "routes/transparency.tsx"),
    route("safety", "routes/safety.tsx"),
  ]),

  // SEO resource routes.
  route("sitemap.xml", "routes/sitemap.xml.tsx"),
  route("robots.txt", "routes/robots.txt.tsx"),

  // Dev scratch page for the M0 motion/feel primitives.
  route("_dev/primitives", "routes/_dev.primitives.tsx"),

  // Ops admin (M2). Login sits OUTSIDE the role-gated layout to avoid a loop.
  route("ops/login", "routes/ops.login.tsx"),
  layout("routes/ops.tsx", [
    route("ops", "routes/ops._index.tsx"),
    route("ops/verifications", "routes/ops.verifications.tsx"),
    route("ops/verifications/:guideId", "routes/ops.verifications.$guideId.tsx"),
    route("ops/pipeline", "routes/ops.pipeline.tsx"),
    route("ops/permits", "routes/ops.permits.tsx"),
    route("ops/payouts", "routes/ops.payouts.tsx"),
    route("ops/incidents", "routes/ops.incidents.tsx"),
  ]),

  // Redirects (301) + 404.
  route("*", "routes/$.tsx"),
] satisfies RouteConfig;
