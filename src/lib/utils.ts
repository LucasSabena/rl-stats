import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOCALE_BY_LANGUAGE: Record<string, string> = {
  es: "es-ES",
  en: "en-US",
  pt: "pt-BR",
};

function activeLocale(): string {
  let language = "es";
  try {
    const stored =
      typeof localStorage !== "undefined" ? localStorage.getItem("rl-lang") : null;
    if (stored) language = stored;
  } catch {
    language = "es";
  }
  return LOCALE_BY_LANGUAGE[language.split("-")[0]] ?? "es-ES";
}

export function formatDate(timestamp: number | string | Date): string {
  const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleDateString(activeLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(timestamp: number | string | Date): string {
  const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp);
  return date.toLocaleDateString(activeLocale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatLocalDateFromUnix(timestampSeconds: number): string {
  return formatLocalDateKey(new Date(timestampSeconds * 1000));
}

export function parseLocalDateToUnix(date: string, endOfDay = false): number | null {
  if (!date) return null;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const parsed = new Date(`${date}${suffix}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor(parsed.getTime() / 1000);
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatSpeed(speed: number): string {
  return `${Math.round(speed)} uu/s`;
}

export function formatBoost(amount: number): string {
  return `${Math.round(amount)}%`;
}

export function calculateWinRate(wins: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}

export function calculateTrend(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(activeLocale()).format(value);
}

export function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
