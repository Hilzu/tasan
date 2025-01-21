import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/index.tsx"),
  route("sign-up", "routes/sign-up.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("welcome", "routes/welcome.tsx"),
  route("splits", "routes/split-index.tsx"),
] satisfies RouteConfig;
