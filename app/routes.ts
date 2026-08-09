import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // Scratch page demonstrating the M0 motion/feel primitives. Dev-facing;
  // real screens (M3+) will consume these components.
  route("_dev/primitives", "routes/_dev.primitives.tsx"),
] satisfies RouteConfig;
