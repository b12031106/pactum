export function LoadingSkeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function DocumentCardSkeleton() {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <LoadingSkeleton className="h-5 w-3/4" />
      <LoadingSkeleton className="h-4 w-1/2" />
      <div className="flex gap-2">
        <LoadingSkeleton className="h-5 w-16 rounded-full" />
        <LoadingSkeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function DocumentDetailSkeleton() {
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 space-y-4">
        <LoadingSkeleton className="h-8 w-1/3" />
        <LoadingSkeleton className="h-4 w-1/4" />
        <LoadingSkeleton className="h-64 w-full" />
      </div>
      <div className="w-full lg:w-[350px] space-y-3">
        <LoadingSkeleton className="h-8 w-full" />
        <LoadingSkeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
