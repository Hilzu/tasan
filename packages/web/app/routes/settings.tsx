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

import { localeCookie } from "~/.server/locale";
import { AmountRender } from "~/components/amount";
import { Button } from "~/components/button";
import { SelectField } from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { useLanguage } from "~/context";
import { canonicalLocale, localeOptions } from "~/domain/locale";
import type { loader as rootLoader } from "~/root";

import type { Route } from "./+types/settings";

export function meta() {
  return [{ title: "Settings - Tasan.app" }];
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const value = form.get("locale");
  const locale = canonicalLocale(value);
  if (value !== "" && !locale) {
    return data({ error: "Choose a valid regional format." }, { status: 400 });
  }
  return redirect(`${href("/settings")}?saved`, {
    headers: {
      "Set-Cookie": await localeCookie.serialize(locale ?? "", {
        secure: new URL(request.url).protocol === "https:",
        ...(locale ? {} : { maxAge: 0 }),
      }),
    },
  });
}

export default function Settings({ actionData }: Route.ComponentProps) {
  const preference =
    useRouteLoaderData<typeof rootLoader>("root")?.preference ?? "";
  const locale = useLanguage();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const pending = navigation.state !== "idle";
  return (
    <div className="max-w-md space-y-4">
      <MainHeading>Settings</MainHeading>
      <Form method="post" className="space-y-4">
        <SelectField
          key={preference}
          label="Regional format"
          name="locale"
          defaultValue={preference}
          description="Choose how dates and amounts are displayed. This preference is saved in this browser. The app language stays English."
          errors={actionData?.error ? [actionData.error] : undefined}
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
        {searchParams.has("saved") && !actionData?.error && !pending && (
          <p role="status">Settings saved.</p>
        )}
      </Form>
    </div>
  );
}
