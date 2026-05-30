/**
 * Wind Data Integration — Open-Meteo hourly wind for Toronto
 */

export interface HourlyWindData {
  hour: number;
  speedMs: number;
  directionDeg: number;
  dirX: number;
  dirZ: number;
}

export interface WindDataSet {
  date: string;
  hourly: HourlyWindData[];
  fetchedAt: number;
}

const FALLBACK_SPEED = 5.0; // m/s
const FALLBACK_DIR_DEG = 60; // produces dirX≈0.87, dirZ≈-0.5 (existing WSW default)

function degToDir(deg: number): { dirX: number; dirZ: number } {
  const rad = deg * Math.PI / 180;
  return { dirX: Math.sin(rad), dirZ: -Math.cos(rad) };
}

function buildFallback(date: string): WindDataSet {
  const { dirX, dirZ } = degToDir(FALLBACK_DIR_DEG);
  const hourly: HourlyWindData[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    speedMs: FALLBACK_SPEED,
    directionDeg: FALLBACK_DIR_DEG,
    dirX,
    dirZ,
  }));
  return { date, hourly, fetchedAt: Date.now() };
}

export async function fetchWindData(date?: string): Promise<WindDataSet> {
  const today = date ?? new Date().toISOString().slice(0, 10);
  try {
    let url =
      "https://api.open-meteo.com/v1/forecast?latitude=44.2253&longitude=-76.4951&hourly=wind_speed_10m,wind_direction_10m&timezone=America/Toronto";
    if (date) {
      url += `&start_date=${date}&end_date=${date}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const speeds: number[] = json.hourly.wind_speed_10m;
    const dirs: number[] = json.hourly.wind_direction_10m;

    const hourly: HourlyWindData[] = [];
    for (let h = 0; h < 24; h++) {
      const speedMs = (speeds[h] ?? 0) / 3.6; // km/h → m/s
      const directionDeg = dirs[h] ?? 0;
      const { dirX, dirZ } = degToDir(directionDeg);
      hourly.push({ hour: h, speedMs, directionDeg, dirX, dirZ });
    }

    return { date: today, hourly, fetchedAt: Date.now() };
  } catch (err) {
    console.warn("Wind data fetch failed, using fallback:", err);
    return buildFallback(today);
  }
}
