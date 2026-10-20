import { useEffect, useId, useState } from "react";
import { href, useFetcher } from "react-router";

import { InputField } from "~/components/formField";
import type { loader } from "~/routes/locale-options";

interface LocaleOption {
  value: string;
  label: string;
}

export function LocalePicker({
  selected,
  options,
  errors,
}: {
  selected?: LocaleOption;
  options: LocaleOption[];
  errors?: string[];
}) {
  const listID = useId();
  const [query, setQuery] = useState("");
  const fetcher = useFetcher<typeof loader>();
  const { load } = fetcher;
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => {
      void load(`${href("/locale-options")}?q=${encodeURIComponent(query)}`);
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [query, load]);
  const choices = new Map(
    [
      ...options,
      ...(fetcher.data?.options ?? []),
      ...(selected ? [selected] : []),
    ].map((option) => [option.value, option]),
  );
  return (
    <div className="space-y-1">
      <InputField
        label="Locale"
        name="locale"
        list={listID}
        defaultValue={selected?.label ?? ""}
        placeholder="Browser default"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
        description="Search by language or country, then choose a format. The app language stays English. Clear the field to use your browser default."
        errors={errors}
      />
      <datalist id={listID}>
        <option value="Browser default" />
        {[...choices.values()].map(({ value, label }) => (
          <option key={value} value={label} />
        ))}
      </datalist>
      {fetcher.data && fetcher.data.total > 20 && (
        <p className="text-sm" role="status">
          More matches available. Refine your search by country or language.
        </p>
      )}
    </div>
  );
}
