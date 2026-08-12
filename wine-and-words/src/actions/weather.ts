"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { fetchWeather } from "@/lib/domain/weather";
import { toDateOnly } from "@/lib/utils";

export interface ActionResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

/**
 * Fetch a weather snapshot for an event's location/date from Open-Meteo and
 * persist it. Only runs when the event has lat/lon set; silently no-ops
 * (returns `skipped: true`) if coordinates are missing or the API is
 * unavailable — this must never throw or block the caller.
 */
export async function fetchAndPersistWeather(eventId: string): Promise<ActionResult> {
  const supabase = await createServerClient();

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, lat, lon, event_date")
    .eq("id", eventId)
    .single();

  if (eventError || !event || event.lat == null || event.lon == null || !event.event_date) {
    return { success: true, skipped: true };
  }

  const weather = await fetchWeather(event.lat, event.lon, toDateOnly(event.event_date));

  if (!weather) {
    return { success: true, skipped: true };
  }

  // Weather snapshots are written by the trusted server only (not directly
  // insertable by club members under RLS), so use the service role client.
  const service = createServiceRoleClient();
  const { error } = await service.from("weather_snapshots").insert({
    event_id: eventId,
    temperature_c: weather.temperatureC,
    weather_code: weather.weatherCode,
    description: weather.description,
    icon_url: weather.icon,
    raw: weather.raw as never,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/events/${eventId}`);

  return { success: true };
}
