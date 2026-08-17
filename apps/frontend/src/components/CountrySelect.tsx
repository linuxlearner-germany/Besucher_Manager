import { useEffect, useState, type SelectHTMLAttributes } from "react";
import { fetchJson } from "../app/core";

export type Country = { code: string; name: string };

let cachedCountries: Country[] | null = null;

export function useCountries(): Country[] {
  const [countries, setCountries] = useState<Country[]>(cachedCountries ?? []);
  useEffect(() => {
    if (cachedCountries) return;
    void fetchJson<{ countries: Country[] }>("/api/countries", { method: "GET", headers: {} })
      .then((payload) => {
        cachedCountries = payload.countries;
        setCountries(payload.countries);
      });
  }, []);
  return countries;
}

export function CountrySelect(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: string;
  onChange: (countryCode: string) => void;
}) {
  const countries = useCountries();
  return (
    <select
      value={props.value}
      required={props.required}
      className={props.className}
      id={props.id}
      aria-invalid={props["aria-invalid"]}
      aria-describedby={props["aria-describedby"]}
      aria-required={props["aria-required"]}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">Bitte wählen</option>
      {countries.map((country) => (
        <option key={country.code} value={country.code}>{country.name}</option>
      ))}
    </select>
  );
}
