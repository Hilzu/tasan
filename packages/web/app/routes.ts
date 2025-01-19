import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/index.tsx"),
  route("welcome", "routes/welcome.tsx"),
  route("splits", "routes/split-index.tsx"),
] satisfies RouteConfig;
