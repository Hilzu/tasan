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
import { resolveLocaleOption, searchLocales } from "~/.server/locales";
import { saveUserSettings } from "~/.server/services/users";
import { AmountRender } from "~/components/amount";
import { Button } from "~/components/button";
import { InputField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { LocalePicker } from "~/components/locale-picker";
import { useLanguage } from "~/context";
import type { loader as layoutLoader } from "~/routes/layout";

import type { Route } from "./+types/settings";

export const middleware: Route.MiddlewareFunction[] = [requireAuthentication];

export function meta() {
  return [{ title: "Settings - Tasan.app" }];
}

export function loader({ url }: Route.LoaderArgs) {
  const query = url.searchParams.get("q") ?? "";
  return { query, ...searchLocales(query) };
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
  const layoutData = useRouteLoaderData<typeof layoutLoader>("routes/layout");
  const preference = layoutData?.user?.locale ?? "";
  const locale = useLanguage();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const pending = navigation.state !== "idle";
  return (
    <div className="max-w-md space-y-4">
      <MainHeading>Settings</MainHeading>
      <p>Manage your account settings. Changes apply across your devices.</p>
      <noscript>
        <Form method="get" className="space-y-2">
          <InputField
            label="Search locales"
            name="q"
            defaultValue={loaderData.query}
            description="Search for a language or country, then choose a suggestion in the Locale field below."
          />
          <Button type="submit" variant="secondary">
            Search locales
          </Button>
        </Form>
      </noscript>
      <Form method="post" className="space-y-4">
        <LocalePicker
          key={preference}
          selected={layoutData?.localeOption}
          options={loaderData.options}
          errors={actionData?.errors.locale}
        />
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
