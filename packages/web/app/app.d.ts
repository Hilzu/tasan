declare module "@tasan/web" {
  const serverBuild: import("react-router").ServerBuild;
  export const {
    assets,
    assetsBuildDirectory,
    basename,
    entry,
    future,
    isSpaMode,
    publicPath,
    routes,
  } = serverBuild;
}
