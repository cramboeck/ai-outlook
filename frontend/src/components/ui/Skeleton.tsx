interface SkeletonProps {
  className?: string;
}

export const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} />
);

// Common skeleton patterns
export const SkeletonCard = () => (
  <div className="bg-card rounded-xl border border-border p-6 space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-3 w-4/5" />
  </div>
);

export const SkeletonTableRow = ({ cols = 5 }: { cols?: number }) => (
  <tr className="border-b border-border">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="p-3">
        <Skeleton className={`h-4 ${i === 0 ? 'w-32' : i === cols - 1 ? 'w-20' : 'w-24'}`} />
      </td>
    ))}
  </tr>
);

export const SkeletonTable = ({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) => (
  <div className="space-y-0">
    {Array.from({ length: rows }).map((_, i) => (
      <SkeletonTableRow key={i} cols={cols} />
    ))}
  </div>
);

export const SkeletonStats = () => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="bg-card rounded-xl border border-border p-4 space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-2 w-24" />
      </div>
    ))}
  </div>
);
