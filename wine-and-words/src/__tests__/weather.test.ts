import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWeather, mapWeatherCode } from "@/lib/domain/weather";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mapWeatherCode", () => {
  it("maps known WMO codes to descriptions and icons", () => {
    expect(mapWeatherCode(0)).toEqual({ description: "Clear sky", icon: "☀️" });
    expect(mapWeatherCode(3)).toEqual({ description: "Overcast", icon: "☁️" });
    expect(mapWeatherCode(61)).toEqual({ description: "Slight rain", icon: "🌧️" });
    expect(mapWeatherCode(95)).toEqual({ description: "Thunderstorm", icon: "⛈️" });
  });

  it("covers fog, snow, and shower categories", () => {
    expect(mapWeatherCode(45).description).toBe("Fog");
    expect(mapWeatherCode(75).description).toBe("Heavy snow fall");
    expect(mapWeatherCode(80).description).toBe("Slight rain showers");
  });

  it("falls back to unknown for an unrecognized code", () => {
    expect(mapWeatherCode(1234)).toEqual({ description: "Unknown", icon: "❓" });
  });
});

describe("fetchWeather", () => {
  it("returns null for invalid coordinates without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWeather(Number.NaN, 0, "2024-06-01");

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a mapped snapshot on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          time: ["2024-06-01"],
          weathercode: [1],
          temperature_2m_max: [24],
          temperature_2m_min: [16],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWeather(51.5, -0.1, "2024-06-01");

    expect(result).not.toBeNull();
    expect(result!.weatherCode).toBe(1);
    expect(result!.description).toBe("Mainly clear");
    expect(result!.temperatureC).toBe(20);
  });

  it("returns null when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWeather(51.5, -0.1, "2024-06-01");
    expect(result).toBeNull();
  });

  it("returns null when the daily data is missing expected fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ daily: {} }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWeather(51.5, -0.1, "2024-06-01");
    expect(result).toBeNull();
  });

  it("never throws even when fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchWeather(51.5, -0.1, "2024-06-01")).resolves.toBeNull();
  });
});
