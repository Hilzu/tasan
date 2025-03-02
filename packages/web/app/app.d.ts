declare module "@tasan/web" {
  const serverBuild: import("react-router").ServerBuild;
  export const { ...serverBuild };
}
