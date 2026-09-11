import { useTranslation } from "react-i18next";
import { moodIcon, moodLabelKey, moodTone } from "@/lib/moods";

export function MoodGlyph({ mood }: { mood?: string | null }) {
  const { t } = useTranslation(['mood']);
  const Icon = moodIcon(mood);
  if (!mood) return null;
  return (
    <span title={t(moodLabelKey(mood))}>
      <Icon size={13} className={moodTone(mood)} aria-label={t(moodLabelKey(mood))} />
    </span>
  );
}
