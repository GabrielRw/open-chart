export function ReportSkeleton() {
  return (
    <section className="space-y-4 border border-black p-6" aria-live="polite">
      <p className="text-sm">Generating natal report...</p>
      <div className="h-8 w-full animate-pulse bg-black/10" />
      <div className="h-8 w-4/5 animate-pulse bg-black/10" />
      <div className="h-8 w-3/5 animate-pulse bg-black/10" />
    </section>
  );
}
