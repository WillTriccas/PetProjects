/**
 * Open-Meteo integration: fetch a weather snapshot for an event's location
 * and date, and map WMO weather codes to human-readable descriptions/icons.
 * Server-side only. Designed to never throw — callers can always trust a
 * `null` return means "no snapshot available" rather than crash the request.
 */

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const FETCH_TIMEOUT_MS = 8000;

export interface WeatherData {
  temperatureC: number;
  weatherCode: number;
  description: string;
  icon: string;
  raw: unknown;
}

interface OpenMeteoResponse {
  daily?: {
    time?: string[];
    weathercode?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

/**
 * Fetch a single-day weather snapshot for the given coordinates and ISO date
 * (YYYY-MM-DD). Returns null if lat/lon are invalid, the network request
 * fails or times out, or the response doesn't contain usable data.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  date: string
): Promise<WeatherData | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !date) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url =
      `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}` +
      `&start_date=${date}&end_date=${date}` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoResponse;
    const code = data.daily?.weathercode?.[0];
    const max = data.daily?.temperature_2m_max?.[0];
    const min = data.daily?.temperature_2m_min?.[0];

    if (code === undefined || max === undefined || min === undefined) {
      return null;
    }

    const { description, icon } = mapWeatherCode(code);

    return {
      temperatureC: Math.round(((max + min) / 2) * 10) / 10,
      weatherCode: code,
      description,
      icon,
      raw: data,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Map a WMO weather interpretation code (as used by Open-Meteo) to a short
 * human-readable description and an icon key. Unknown codes fall back to a
 * generic "unknown" description.
 */
export function mapWeatherCode(code: number): { description: string; icon: string } {
  const table: Record<number, { description: string; icon: string }> = {
    0: { description: "Clear sky", icon: "☀️" },
    1: { description: "Mainly clear", icon: "🌤️" },
    2: { description: "Partly cloudy", icon: "⛅" },
    3: { description: "Overcast", icon: "☁️" },
    45: { description: "Fog", icon: "🌫️" },
    48: { description: "Depositing rime fog", icon: "🌫️" },
    51: { description: "Light drizzle", icon: "🌦️" },
    53: { description: "Moderate drizzle", icon: "🌦️" },
    55: { description: "Dense drizzle", icon: "🌦️" },
    56: { description: "Light freezing drizzle", icon: "🌧️" },
    57: { description: "Dense freezing drizzle", icon: "🌧️" },
    61: { description: "Slight rain", icon: "🌧️" },
    63: { description: "Moderate rain", icon: "🌧️" },
    65: { description: "Heavy rain", icon: "🌧️" },
    66: { description: "Light freezing rain", icon: "🌧️" },
    67: { description: "Heavy freezing rain", icon: "🌧️" },
    71: { description: "Slight snow fall", icon: "🌨️" },
    73: { description: "Moderate snow fall", icon: "🌨️" },
    75: { description: "Heavy snow fall", icon: "❄️" },
    77: { description: "Snow grains", icon: "❄️" },
    80: { description: "Slight rain showers", icon: "🌦️" },
    81: { description: "Moderate rain showers", icon: "🌦️" },
    82: { description: "Violent rain showers", icon: "⛈️" },
    85: { description: "Slight snow showers", icon: "🌨️" },
    86: { description: "Heavy snow showers", icon: "🌨️" },
    95: { description: "Thunderstorm", icon: "⛈️" },
    96: { description: "Thunderstorm with slight hail", icon: "⛈️" },
    99: { description: "Thunderstorm with heavy hail", icon: "⛈️" },
  };

  return table[code] ?? { description: "Unknown", icon: "❓" };
}
