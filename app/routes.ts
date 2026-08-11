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
    route("match", "routes/match.tsx"),
    route("guides", "routes/guides.tsx"),
    route("guides/:slug", "routes/guides.$slug.tsx"),
    route("experiences", "routes/experiences.tsx"),
    route("experiences/:slug", "routes/experiences.$slug.tsx"),
    route("treks/:slug", "routes/treks.$slug.tsx"),
    // Trek Journals — one album per completed trek. The unit of proof.
    route("journals", "routes/journals._index.tsx"),
    route("journals/:slug", "routes/journals.$slug.tsx"),
    route("routes", "routes/routes._index.tsx"),
    route("routes/:slug", "routes/routes.$slug.tsx"),
    route("transparency", "routes/transparency.tsx"),
    route("fund", "routes/fund.tsx"),
    route("stories", "routes/stories.tsx"),
    route("hosts", "routes/hosts.tsx"),
    route("safety", "routes/safety.tsx"),
    route("trust", "routes/trust.tsx"),
    route("insurance", "routes/insurance.tsx"),
    route("apply", "routes/apply.tsx"),
    route("login", "routes/login.tsx"),
    // Booking flow + account pages share the public chrome (audit: these had
    // no header/footer — My Trips was an exit-less page).
    route("checkout/:bookingId", "routes/checkout.$bookingId.tsx"),
    route("trips", "routes/trips._index.tsx"),
    route("trips/:bookingId", "routes/trips.$bookingId.tsx"),
    route("messages", "routes/messages._index.tsx"),
    route("messages/:bookingId", "routes/messages.$bookingId.tsx"),
    route("messages/c/:conversationId", "routes/messages.c.$conversationId.tsx"),
    route("recap/:slug", "routes/recap.$slug.tsx"),
    // 404 catch-all gets the site chrome too.
    route("*", "routes/$.tsx"),
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
    route("g/journals", "routes/g.journals.tsx"),
    route("g/journals/:id", "routes/g.journals.$id.tsx"),
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
    route("ops/journals", "routes/ops.journals.tsx"),
    route("ops/journals/:id", "routes/ops.journals.$id.tsx"),
    route("ops/contracts", "routes/ops.contracts.tsx"),
  ]),

  // Booking flow (M6) + My Trips & documents (M7).
  route("enquiry", "routes/enquiry.tsx"),
  route("trips/:bookingId/doc/:docId", "routes/trips.$bookingId.doc.$docId.tsx"),
  route("conversations", "routes/conversations.tsx"),
  route("pdf/tims/:bookingId", "routes/pdf.tims.$bookingId.tsx"),
  route("pdf/contract/:bookingId", "routes/pdf.contract.$bookingId.tsx"),
  route("api/webhooks/stripe", "routes/api.webhooks.stripe.tsx"),
  route("api/cron/:job", "routes/api.cron.$job.tsx"),
  route("api/journal-photo", "routes/api.journal-photo.tsx"),

  // Recap OG image (binary resource route — outside the layout).
  route("recap/:slug/og", "routes/recap.$slug.og.tsx"),

] satisfies RouteConfig;
