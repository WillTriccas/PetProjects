import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-burgundy/10", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gold/50 bg-white/50 px-6 py-12 text-center">
      <p className="font-serif text-lg font-semibold text-burgundy-dark">{title}</p>
      {description && <p className="max-w-sm text-sm text-burgundy-dark/70">{description}</p>}
      {action}
    </div>
  );
}
