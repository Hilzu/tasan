import { create } from "@tasan/common/decimal";
import { useId } from "react";
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
import { localeOptions, resolveLocaleOption } from "~/.server/locales";
import { saveUserSettings } from "~/.server/services/users";
import { AmountRender } from "~/components/amount";
import { Button } from "~/components/button";
import { InputField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { useLanguage } from "~/context";
import type { loader as layoutLoader } from "~/routes/layout";

import type { Route } from "./+types/settings";

export const middleware: Route.MiddlewareFunction[] = [requireAuthentication];

export function meta() {
  return [{ title: "Settings - Tasan.app" }];
}

export function loader() {
  return { locales: localeOptions };
}

export async function action({ request, context }: Route.ActionArgs) {
  const { userID } = context.get(authenticatedSessionContext);
  const form = await request.formData();
  const value = form.get("locale");
  const locale = resolveLocaleOption(value);
  if (locale === undefined) {
    return data(
      { errors: { locale: ["Choose a valid locale."] } },
      { status: 400 },
    );
  }
  await saveUserSettings(userID, { locale: locale || undefined });
  return redirect(`${href("/settings")}?saved`);
}

export default function Settings({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const preference =
    useRouteLoaderData<typeof layoutLoader>("routes/layout")?.user?.locale ??
    "";
  const locale = useLanguage();
  const listID = useId();
  const preferenceLabel =
    loaderData.locales.find(({ value }) => value === preference)?.label ??
    preference;
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const pending = navigation.state !== "idle";
  return (
    <div className="max-w-md space-y-4">
      <MainHeading>Settings</MainHeading>
      <p>Manage your account settings. Changes apply across your devices.</p>
      <Form method="post" className="space-y-4">
        <InputField
          key={preference}
          label="Locale"
          name="locale"
          list={listID}
          defaultValue={preferenceLabel}
          placeholder="Browser default"
          autoComplete="off"
          spellCheck={false}
          description="Search by language or country, then choose a format. The app language stays English. Clear the field to use your browser default."
          errors={actionData?.errors.locale}
        />
        <datalist id={listID}>
          <option value="Browser default" />
          {loaderData.locales.map(({ value, label }) => (
            <option key={value} value={label} />
          ))}
        </datalist>
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
