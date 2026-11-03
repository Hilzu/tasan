import { readFileSync } from "node:fs";

import type { CfnManagedLoginBrandingProps } from "aws-cdk-lib/aws-cognito";

const asset = (name: string) =>
  readFileSync(new URL(`../assets/login/${name}`, import.meta.url));

// Cognito needs a separate asset for each mode; SVGs use the app's wordmark
// and four-square icon, with white artwork on dark backgrounds.
const svg = (name: string, colorMode: string) =>
  Buffer.from(
    asset(name)
      .toString("utf8")
      .replaceAll("#155b52", colorMode === "DARK" ? "#ffffff" : "#155b52"),
  ).toString("base64");

const settings: unknown = JSON.parse(asset("settings.json").toString("utf8"));

export const managedLoginBranding: Pick<
  CfnManagedLoginBrandingProps,
  "assets" | "settings" | "useCognitoProvidedValues"
> = {
  useCognitoProvidedValues: false,
  // Based on the AWS CLI export in assets/managed-login-branding.json.
  settings,
  assets: ["LIGHT", "DARK"].flatMap((colorMode) => [
    {
      category: "FORM_LOGO",
      colorMode,
      extension: "SVG",
      bytes: svg("logo.svg", colorMode),
    },
    {
      category: "FAVICON_SVG",
      colorMode,
      extension: "SVG",
      bytes: svg("favicon.svg", colorMode),
    },
    {
      category: "FAVICON_ICO",
      colorMode,
      extension: "ICO",
      bytes: asset("favicon.ico").toString("base64"),
    },
  ]),
};
