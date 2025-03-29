import { Button } from "~/components/button";
import { Modal } from "~/components/modal";

interface DeleteExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onDelete: () => void;
}

export function DeleteExpenseModal({
  open,
  onClose,
  onDelete,
}: DeleteExpenseModalProps) {
  return (
    <Modal
      title="Delete expense"
      open={open}
      onClose={(returnValue) => {
        if (returnValue === "delete") onDelete();
        onClose();
      }}
      actions={
        <>
          <Button variant="secondary" value="cancel" type="submit">
            Cancel
          </Button>
          <Button variant="danger" value="delete" type="submit" autoFocus>
            Delete
          </Button>
        </>
      }
    >
      Are you sure you want to delete this expense? This action cannot be
      undone.
    </Modal>
  );
}
