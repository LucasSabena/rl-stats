import { Laugh, Smile, Meh, Annoyed, Angry, CircleDashed, type LucideIcon } from "lucide-react";

export type MoodKey = "very_happy" | "happy" | "neutral" | "angry" | "very_angry";

/** All rateable moods, happiest first. */
export const MOODS: MoodKey[] = ["very_happy", "happy", "neutral", "angry", "very_angry"];

const MOOD_ICONS: Record<MoodKey, LucideIcon> = {
  very_happy: Laugh,
  happy: Smile,
  neutral: Meh,
  angry: Annoyed,
  very_angry: Angry,
};

/** Unrated matches render with a dashed placeholder, never as neutral. */
export const UnratedIcon: LucideIcon = CircleDashed;

export function isMoodKey(value: unknown): value is MoodKey {
  return typeof value === "string" && (MOODS as string[]).includes(value);
}

export function moodIcon(mood: string | null | undefined): LucideIcon {
  if (isMoodKey(mood)) return MOOD_ICONS[mood];
  return UnratedIcon;
}

/** i18n key for the mood label (namespace `mood`). */
export function moodLabelKey(mood: string | null | undefined): string {
  if (isMoodKey(mood)) return `mood:options.${mood}`;
  return "mood:unrated";
}

/** Tailwind tone class for the mood icon. */
export function moodTone(mood: string | null | undefined): string {
  switch (mood) {
    case "very_happy":
      return "text-accent-success";
    case "happy":
      return "text-accent-primary";
    case "neutral":
      return "text-text-tertiary";
    case "angry":
      return "text-accent-warning";
    case "very_angry":
      return "text-accent-danger";
    default:
      return "text-text-muted";
  }
}
