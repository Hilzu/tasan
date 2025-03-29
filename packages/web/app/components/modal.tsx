import { type ReactNode, useEffect, useRef } from "react";

import { SubHeading } from "~/components/heading";

interface ModalProps {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  open?: boolean;
  onClose?: (returnValue: string) => void;
}

export function Modal({ title, children, actions, open, onClose }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && ref.current) ref.current.showModal();
  }, [open]);
  return (
    <dialog
      className="fixed m-auto h-fit rounded-lg"
      ref={ref}
      onClick={(event) => {
        event.currentTarget.close("");
      }}
      onClose={(event) => {
        onClose?.(event.currentTarget.returnValue);
      }}
    >
      <div
        className="px-6 py-4"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <form method="dialog">
          <article>
            <SubHeading className="mb-2">{title}</SubHeading>
            <div className="mb-4">{children}</div>
            <div className="flex justify-end gap-2">{actions}</div>
          </article>
        </form>
      </div>
    </dialog>
  );
}
