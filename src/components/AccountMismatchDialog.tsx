import { Trans, useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAccountMismatchStore } from "@/stores/accountMismatchStore";
import { useAccountMismatch } from "@/hooks/useAccountMismatch";
import { AlertTriangle } from "lucide-react";

export function AccountMismatchDialog() {
  const { t } = useTranslation("profiles");
  const mismatch = useAccountMismatchStore((s) => s.mismatch);
  const showDialog = useAccountMismatchStore((s) => s.showDialog);
  const {
    handleSwitchProfile,
    handleSwitchProfileAndRestart,
    handleSaveIdentity,
    handleDismiss,
  } = useAccountMismatch();

  if (!mismatch || !showDialog) return null;

  return (
    <Modal
      isOpen={showDialog && mismatch !== null}
      onClose={handleDismiss}
      title={t("accountMismatch.title")}
      size="sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-accent-warning/30 bg-accent-warning/5 p-3">
          <AlertTriangle
            size={20}
            className="shrink-0 text-accent-warning mt-0.5"
          />
          <div className="space-y-2 text-sm">
            <p className="text-text-primary">
              <Trans
                t={t}
                i18nKey="accountMismatch.detected"
                values={{ name: mismatch.detectedPlayerName }}
                components={{
                  bold: <strong className="text-accent-warning" />,
                }}
              />
            </p>
            <p className="text-text-secondary">
              <Trans
                t={t}
                i18nKey="accountMismatch.currentProfile"
                values={{ profile: mismatch.currentProfileName }}
                components={{ bold: <strong className="text-text-primary" /> }}
              />
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {mismatch.matchedProfileId && (
            <>
              <Button
                variant="primary"
                className="w-full"
                onClick={() =>
                  handleSwitchProfileAndRestart(mismatch.matchedProfileId!)
                }
              >
                Switch to {mismatch.matchedProfileName} and restart
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => handleSwitchProfile(mismatch.matchedProfileId!)}
              >
                {t("accountMismatch.switchTo", {
                  profile: mismatch.matchedProfileName,
                })}
              </Button>
            </>
          )}

          <Button
            variant={mismatch.matchedProfileId ? "secondary" : "primary"}
            className="w-full"
            onClick={() =>
              handleSaveIdentity(
                mismatch.currentProfileId,
                mismatch.detectedPrimaryId,
                mismatch.detectedPlayerName,
              )
            }
          >
            {t("accountMismatch.associate", {
              name: mismatch.detectedPlayerName,
            })}
          </Button>

          <Button variant="ghost" className="w-full" onClick={handleDismiss}>
            {t("accountMismatch.dismiss")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
