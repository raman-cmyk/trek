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
    route("trust", "routes/trust.tsx"),
    route("apply", "routes/apply.tsx"),
    route("login", "routes/login.tsx"),
  ]),

  // Guide area (M4 status page; M5 dashboard). Login sits outside the gate.
  route("g/login", "routes/g.login.tsx"),
  layout("routes/g.tsx", [
    route("g", "routes/g._index.tsx"),
    route("g/enquiries", "routes/g.enquiries.tsx"),
    route("g/bookings", "routes/g.bookings.tsx"),
    route("g/calendar", "routes/g.calendar.tsx"),
    route("g/earnings", "routes/g.earnings.tsx"),
    route("g/profile", "routes/g.profile.tsx"),
  ]),

  // Immersive full-screen trekker onboarding (no header/footer chrome).
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),

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
    route("ops/bookings/:id", "routes/ops.bookings.$id.tsx"),
    route("ops/permits", "routes/ops.permits.tsx"),
    route("ops/payouts", "routes/ops.payouts.tsx"),
    route("ops/incidents", "routes/ops.incidents.tsx"),
    route("ops/moderation", "routes/ops.moderation.tsx"),
    route("ops/contracts", "routes/ops.contracts.tsx"),
  ]),

  // Booking flow (M6) + My Trips & documents (M7).
  route("enquiry", "routes/enquiry.tsx"),
  route("checkout/:bookingId", "routes/checkout.$bookingId.tsx"),
  route("trips", "routes/trips._index.tsx"),
  route("trips/:bookingId", "routes/trips.$bookingId.tsx"),
  route("trips/:bookingId/doc/:docId", "routes/trips.$bookingId.doc.$docId.tsx"),
  route("messages/:bookingId", "routes/messages.$bookingId.tsx"),
  route("api/webhooks/stripe", "routes/api.webhooks.stripe.tsx"),
  route("api/cron/:job", "routes/api.cron.$job.tsx"),

  // Public trek recaps (M8) — shareable SEO pages + OG image.
  route("recap/:slug", "routes/recap.$slug.tsx"),
  route("recap/:slug/og", "routes/recap.$slug.og.tsx"),

  // Redirects (301) + 404.
  route("*", "routes/$.tsx"),
] satisfies RouteConfig;
