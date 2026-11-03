import { readFileSync } from "node:fs";

import type { CfnManagedLoginBrandingProps } from "aws-cdk-lib/aws-cognito";

const asset = (name: string) =>
  readFileSync(new URL(`../assets/login/${name}`, import.meta.url));

// Cognito needs a separate asset for each mode.
const svg = (name: string, colorMode: string) => {
  let source = asset(name).toString("utf8");
  if (colorMode === "DARK") {
    source = source.replaceAll("#155b52", "#ffffff");
    if (name === "logo.svg") {
      // Recovery can select dark artwork while rendering a light form.
      // A green outline keeps the white wordmark visible on either surface.
      source = source.replace(
        "<svg ",
        '<svg stroke="#155b52" stroke-width="2" paint-order="stroke" ',
      );
    }
  }
  return Buffer.from(source).toString("base64");
};

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
