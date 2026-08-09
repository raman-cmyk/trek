import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
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
] satisfies RouteConfig;
