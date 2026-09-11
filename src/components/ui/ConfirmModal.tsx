import { Button } from "./Button";
import { Modal } from "./Modal";

export type ConfirmModalVariant = "danger" | "primary";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmModalVariant;
  isPending?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "primary",
  isPending = false,
}: ConfirmModalProps) {
  const handleClose = () => {
    if (!isPending) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={isPending}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            isLoading={isPending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
