import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/index.tsx"),
    route("login", "routes/login.tsx"),
    route("auth-callback", "routes/auth-callback.tsx"),
    route("logout", "routes/logout.tsx"),
    route("accept-invite/:inviteID", "routes/accept-invite.tsx"),
    route("components", "routes/components.tsx"),

    route("splits", "routes/splits/splits-parent.tsx", [
      index("routes/splits/list-splits.tsx"),
      route("new", "routes/splits/new-split.tsx"),
      route(
        ":splitID",
        "routes/split/split-parent.tsx",
        { id: "split-parent" },
        [
          index("routes/split/show-split.tsx"),
          route("invite", "routes/split/invite.tsx"),
          route("new-expense", "routes/split/new-expense.tsx"),
        ],
      ),
    ]),
  ]),
] satisfies RouteConfig;
