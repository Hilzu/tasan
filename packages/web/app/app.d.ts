declare module "@tasan/web" {
  const serverBuild: import("react-router").ServerBuild;
  export const {
    entry,
    routes,
    assets,
    basename,
    publicPath,
    assetsBuildDirectory,
    future,
    ssr,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    isSpaMode,
    prerender,
  } = serverBuild;
}
