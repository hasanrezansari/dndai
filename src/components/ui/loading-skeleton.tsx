export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 w-full ${className}`.trim()}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded-sm bg-[var(--surface-high)] overflow-hidden relative"
          style={{ width: i === lines - 1 ? "72%" : "100%" }}
        >
          <span
            className="absolute inset-0 animate-shimmer opacity-60 pointer-events-none"
            aria-hidden
          />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] min-h-[88px] bg-[var(--surface-high)] border border-[rgba(77,70,53,0.2)] overflow-hidden relative ${className}`.trim()}
    >
      <span
        className="absolute inset-0 animate-shimmer opacity-50 pointer-events-none"
        aria-hidden
      />
    </div>
  );
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return (
    <div
      className="rounded-[var(--radius-avatar)] bg-[var(--surface-high)] shrink-0 overflow-hidden relative"
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 animate-shimmer opacity-55 pointer-events-none"
        aria-hidden
      />
    </div>
  );
}

export function ModeCardsSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-[var(--void-gap)] w-full max-w-md ${className}`.trim()}
    >
      <SkeletonCard className="min-h-[180px]" />
      <SkeletonCard className="min-h-[180px]" />
    </div>
  );
}
