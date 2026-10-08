import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformStats } from "@/hooks/use-platform-stats";

/**
 * Headline metrics. Data arrives through the service layer, never from
 * hard-coded fixtures inside the component.
 */
const StatsStrip = () => {
  const { data: stats, isPending } = usePlatformStats();

  return (
    <div className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
      {isPending || !stats
        ? Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-card px-4 py-4">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-3 h-6 w-16" />
              <Skeleton className="mt-2 h-2.5 w-24" />
            </div>
          ))
        : stats.map((stat) => (
            <div key={stat.id} className="bg-card px-4 py-4">
              <p className="text-label">{stat.label}</p>
              <p className="mt-2 font-mono text-2xl font-medium text-foreground">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stat.caption}</p>
            </div>
          ))}
    </div>
  );
};

export default StatsStrip;
