import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/index.tsx"),
    route("sign-up", "routes/sign-up.tsx"),
    route("login", "routes/login.tsx"),
    route("logout", "routes/logout.tsx"),
    route("welcome", "routes/welcome.tsx"),
    route("splits", "routes/splits-parent.tsx", [
      index("routes/splits-index.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
