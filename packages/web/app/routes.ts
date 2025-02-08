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
    route("log-in", "routes/log-in.tsx"),
    route("logout", "routes/logout.tsx"),
    route("accept-invite/:inviteID", "routes/accept-invite.tsx"),

    route("splits", "routes/splits/parent.tsx", [
      index("routes/splits/index.tsx"),
      route("new", "routes/splits/new.tsx"),
      route(":splitID", "routes/split/parent.tsx", { id: "split-parent" }, [
        index("routes/split/show.tsx"),
        route("invite", "routes/split/invite.tsx"),
      ]),
    ]),
  ]),
] satisfies RouteConfig;
