import { NatalForm } from "@/components/form/natal-form";

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-10 border-b border-black pb-6">
        <h1 className="font-serif text-4xl">Natal Report</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6">
          Enter birth details to generate a structured natal chart report using live
          FreeAstroAPI data.
        </p>
      </header>
      <NatalForm />
    </main>
  );
}
