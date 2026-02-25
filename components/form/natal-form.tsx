"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { CityAutocomplete } from "@/components/form/city-autocomplete";
import { buildNatalRequestFromForm, encodeReportEnvelope } from "@/lib/natal-request";
import { birthFormSchema, BirthFormSchema } from "@/lib/schemas/astro";
import { CityResult } from "@/lib/types/astro";

export function NatalForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    setValue,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BirthFormSchema>({
    resolver: zodResolver(birthFormSchema),
    defaultValues: {
      name: "",
      birthDate: "",
      birthTime: "",
    },
  });

  const selectedCity = watch("citySelection") as CityResult | undefined;

  const selectedCityLine = useMemo(() => {
    if (!selectedCity) {
      return null;
    }

    return `${selectedCity.name}, ${selectedCity.country_code} · ${selectedCity.timezone} · (${selectedCity.lat.toFixed(4)}, ${selectedCity.lng.toFixed(4)})`;
  }, [selectedCity]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);

    try {
      const payload = buildNatalRequestFromForm(values);
      const encoded = encodeReportEnvelope({
        payload,
        createdAt: Date.now(),
      });

      router.push(`/report?data=${encoded}`);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6 border border-black p-6">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium">
          Name (optional)
        </label>
        <input
          id="name"
          type="text"
          {...register("name")}
          className="w-full border border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
        />
        {errors.name ? <p className="mt-1 text-sm">{errors.name.message}</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="birthDate" className="mb-1 block text-sm font-medium">
            Birth date
          </label>
          <input
            id="birthDate"
            type="date"
            {...register("birthDate")}
            className="w-full border border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
          />
          {errors.birthDate ? (
            <p className="mt-1 text-sm">{errors.birthDate.message}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="birthTime" className="mb-1 block text-sm font-medium">
            Birth time (24h)
          </label>
          <input
            id="birthTime"
            type="time"
            step={60}
            {...register("birthTime")}
            className="w-full border border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
          />
          {errors.birthTime ? (
            <p className="mt-1 text-sm">{errors.birthTime.message}</p>
          ) : null}
        </div>
      </div>

      <CityAutocomplete
        selectedCity={selectedCity ?? null}
        onSelect={(city) => {
          setValue("citySelection", city, { shouldValidate: true, shouldDirty: true });
        }}
        onClear={() => {
          setValue("citySelection", undefined as never, {
            shouldValidate: true,
            shouldDirty: true,
          });
        }}
      />
      {errors.citySelection ? (
        <p className="-mt-4 text-sm">Select a city from the suggestions.</p>
      ) : null}

      <div className="border border-black px-3 py-2 text-sm">
        {selectedCityLine ?? "No city selected yet."}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full border border-black bg-black px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-70"
      >
        {submitting ? "Preparing report..." : "Generate Report"}
      </button>
    </form>
  );
}
