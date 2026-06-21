declare module "@tasan/web" {
  export const {
    entry,
    routes,
    assets,
    basename,
    publicPath,
    assetsBuildDirectory,
    future,
    ssr,
    isSpaMode,
    prerender,
    routeDiscovery,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }: Record<string, any>;
}
