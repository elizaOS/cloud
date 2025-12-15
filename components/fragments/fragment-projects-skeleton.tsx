/**
 * Fragment Projects Table Skeleton
 * Loading state for projects table
 */

export function FragmentProjectsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 animate-pulse"
        >
          <div className="flex items-center gap-4 flex-1">
            <div className="w-12 h-12 rounded-lg bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/10 rounded w-1/3" />
              <div className="h-3 bg-white/10 rounded w-1/2" />
            </div>
          </div>
          <div className="h-8 w-8 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}
