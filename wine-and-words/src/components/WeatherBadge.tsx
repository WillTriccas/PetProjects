import type { WeatherSnapshot } from "@/lib/supabase/types";

export function WeatherBadge({ snapshot }: { snapshot: WeatherSnapshot | null }) {
  if (!snapshot) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-burgundy-dark/40">
        <span aria-hidden="true">🌡️</span> Weather unavailable
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-sm text-burgundy-dark/80">
      <span aria-hidden="true">{snapshot.icon_url}</span>
      {snapshot.temperature_c != null && <span>{Math.round(snapshot.temperature_c)}°C</span>}
      {snapshot.description && <span className="text-burgundy-dark/60">· {snapshot.description}</span>}
    </span>
  );
}
