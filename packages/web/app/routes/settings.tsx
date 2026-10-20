import { create } from "@tasan/common/decimal";
import {
  data,
  Form,
  href,
  redirect,
  useNavigation,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";

import {
  authenticatedSessionContext,
  requireAuthentication,
} from "~/.server/auth";
import { saveUserSettings } from "~/.server/services/users";
import { AmountRender } from "~/components/amount";
import { Button } from "~/components/button";
import { SelectField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { useLanguage } from "~/context";
import { canonicalLocale, localeOptions } from "~/domain/locale";
import type { loader as layoutLoader } from "~/routes/layout";

import type { Route } from "./+types/settings";

export const middleware: Route.MiddlewareFunction[] = [requireAuthentication];

export function meta() {
  return [{ title: "Settings - Tasan.app" }];
}

export async function action({ request, context }: Route.ActionArgs) {
  const { userID } = context.get(authenticatedSessionContext);
  const form = await request.formData();
  const value = form.get("locale");
  const locale = canonicalLocale(value);
  if (value !== "" && !locale) {
    return data(
      { errors: { locale: ["Choose a valid locale."] } },
      { status: 400 },
    );
  }
  await saveUserSettings(userID, { locale });
  return redirect(`${href("/settings")}?saved`);
}

export default function Settings({ actionData }: Route.ComponentProps) {
  const preference =
    useRouteLoaderData<typeof layoutLoader>("routes/layout")?.user?.locale ??
    "";
  const locale = useLanguage();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const pending = navigation.state !== "idle";
  return (
    <div className="max-w-md space-y-4">
      <MainHeading>Settings</MainHeading>
      <p>Manage your account settings. Changes apply across your devices.</p>
      <Form method="post" className="space-y-4">
        <SelectField
          key={preference}
          label="Locale"
          name="locale"
          defaultValue={preference}
          description="Used to format dates and amounts. The app language stays English."
          errors={actionData?.errors.locale}
        >
          <option value="">Browser default</option>
          {preference &&
            !localeOptions.some(([value]) => value === preference) && (
              <option value={preference}>{preference}</option>
            )}
          {localeOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <div className="rounded border border-gray-300 p-3 dark:border-gray-700">
          <p className="font-semibold">Current format ({locale})</p>
          <p>
            Amount: <AmountRender amount={create(1234.56, 2)} currency="EUR" />
          </p>
          <p>
            Date:{" "}
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "long",
              timeZone: "UTC",
            }).format(new Date("2026-10-20T00:00:00Z"))}
          </p>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {searchParams.has("saved") && !actionData?.errors && !pending && (
          <p role="status">Settings saved.</p>
        )}
      </Form>
    </div>
  );
}
