declare module "@tasan/web" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
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
