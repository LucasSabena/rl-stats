import { z } from "zod";

const emptyStringToNull = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
};

export const settingsSchema = z.object({
  playerName: z.string(),
  autoStart: z.boolean(),
  rlPath: z.preprocess(emptyStringToNull, z.string().nullable()),
  platform: z.preprocess(
    emptyStringToNull,
    z.enum(["steam", "epic"]).nullable(),
  ),
  defaultMatchType: z.enum([
    "ranked",
    "casual",
    "tournament",
    "training",
    "other",
  ]),
  sessionGapMinutes: z.number().int().min(5).max(120),
  kickoffGoalThresholdSeconds: z.number().int().min(1).max(20),
  warnOnProfileMismatch: z.boolean(),
  autoSwitchProfileOnExactMatch: z.boolean(),
  autoSyncOnMatchEnd: z.boolean(),
});

export type SettingsFormInput = z.input<typeof settingsSchema>;
export type SettingsFormValues = z.infer<typeof settingsSchema>;

export const iniSettingsSchema = z.object({
  port: z.number().int().min(1).max(65535),
  enabled: z.boolean(),
});

export type IniSettingsFormValues = z.infer<typeof iniSettingsSchema>;
