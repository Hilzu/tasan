import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { App, aws_cognito as cognito, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { managedLoginBranding } from "./managed-login-branding.js";

type Mode = "lightMode" | "darkMode";
type State = "defaults" | "hover" | "active";
type Button = Record<
  Mode,
  Record<State, { textColor: string; backgroundColor: string }>
>;
interface BrandingSettings {
  categories: unknown;
  components: {
    form: Record<Mode, { backgroundColor: string }> & { logo: unknown };
    pageBackground: { image: { enabled: boolean } };
    primaryButton: Button;
    secondaryButton: Button;
  };
  componentClasses: {
    link: Record<Mode, Record<"defaults" | "hover", { textColor: string }>>;
  };
}
interface BrandingProperties {
  UseCognitoProvidedValues: boolean;
  Settings: BrandingSettings;
  Assets: {
    Category: string;
    ColorMode: string;
    Extension: string;
    Bytes: string;
  }[];
}

const properties = (): BrandingProperties => {
  const stack = new Stack(new App(), "BrandingTest");
  new cognito.CfnManagedLoginBranding(stack, "AppManagedLoginBranding", {
    userPoolId: "eu-central-1_test",
    clientId: "testclient",
    ...managedLoginBranding,
  });
  const template: unknown = Template.fromStack(stack).toJSON();
  return (
    template as {
      Resources: {
        AppManagedLoginBranding: { Properties: BrandingProperties };
      };
    }
  ).Resources.AppManagedLoginBranding.Properties;
};

await test("branding is explicit while retaining the exported login behavior", () => {
  const branding = properties();
  const baseline: unknown = JSON.parse(
    readFileSync(
      new URL("../assets/managed-login-branding.json", import.meta.url),
      "utf8",
    ),
  );
  const { Settings: original } = (
    baseline as { ManagedLoginBranding: { Settings: BrandingSettings } }
  ).ManagedLoginBranding;

  assert.equal(branding.UseCognitoProvidedValues, false);
  assert.deepEqual(branding.Settings.categories, original.categories);
  assert.deepEqual(
    branding.Settings.components.form.logo,
    original.components.form.logo,
  );
  assert.equal(
    branding.Settings.components.pageBackground.image.enabled,
    false,
  );
  // Only request fields belong in CloudFormation, never response metadata.
  assert.deepEqual(Object.keys(branding).sort(), [
    "Assets",
    "ClientId",
    "Settings",
    "UseCognitoProvidedValues",
    "UserPoolId",
  ]);
  assert.ok(Buffer.byteLength(JSON.stringify(branding)) < 2 * 1024 * 1024);
});

const luminance = (hex: string): number => {
  const rgb = [0, 2, 4].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

const assertContrast = (foreground: string, background: string) => {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  const contrast = (values[0] + 0.05) / (values[1] + 0.05);
  assert.ok(
    contrast >= 4.5,
    `${foreground} on ${background}: ${String(contrast)}`,
  );
};

await test("button and link text have readable contrast in both color modes", () => {
  const { Settings: settings } = properties();
  for (const mode of ["lightMode", "darkMode"] as const) {
    for (const state of ["defaults", "hover", "active"] as const) {
      for (const name of ["primaryButton", "secondaryButton"] as const) {
        const button = settings.components[name][mode][state];
        assertContrast(button.textColor, button.backgroundColor);
      }
    }
    for (const state of ["defaults", "hover"] as const) {
      assertContrast(
        settings.componentClasses.link[mode][state].textColor,
        settings.components.form[mode].backgroundColor,
      );
    }
  }
});

await test("both modes ship the new wordmark and SVG/ICO favicons", () => {
  const { Assets: assets } = properties();
  assert.equal(assets.length, 6);
  for (const mode of ["LIGHT", "DARK"]) {
    for (const category of ["FORM_LOGO", "FAVICON_SVG", "FAVICON_ICO"]) {
      const matching = assets.filter(
        (asset: { ColorMode: string; Category: string }) =>
          asset.ColorMode === mode && asset.Category === category,
      );
      assert.equal(matching.length, 1);
      const asset = matching[0];
      const bytes = Buffer.from(asset.Bytes, "base64");
      if (category === "FAVICON_ICO") {
        assert.equal(asset.Extension, "ICO");
        assert.deepEqual(bytes.subarray(0, 4), Buffer.from([0, 0, 1, 0]));
      } else {
        assert.equal(asset.Extension, "SVG");
        const svg = bytes.toString("utf8");
        assert.match(svg, /<svg /);
        assert.equal((svg.match(/<rect /g) ?? []).length, 4);
        assert.ok(svg.includes(mode === "DARK" ? "#ffffff" : "#155b52"));
        assert.doesNotMatch(svg, /<text|<script|https?:\/\/(?!www\.w3\.org)/);
        if (category === "FORM_LOGO") assert.match(svg, /<path /);
      }
    }
  }
});
