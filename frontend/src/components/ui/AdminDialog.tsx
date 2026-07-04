'use client';

import { Modal } from './Modal';

interface AlertDialog {
  type: 'alert';
  title: string;
  message: string;
}

interface ConfirmDialog {
  type: 'confirm';
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

export type DialogState = AlertDialog | ConfirmDialog;

interface AdminDialogProps extends DialogState {
  onClose: () => void;
}

export function AdminDialog({ onClose, ...dialog }: AdminDialogProps) {
  return (
    <Modal isOpen onClose={onClose} maxWidth="max-w-sm">
      <div className="pt-1">
        <h3 className="text-[14px] font-bold text-text-primary mb-2 pr-6">{dialog.title}</h3>
        <p className="text-[12.5px] text-text-muted leading-relaxed mb-5">{dialog.message}</p>
        <div className="flex justify-end gap-2">
          {dialog.type === 'confirm' ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-sm bg-dark border border-border-dim text-text-muted text-[12.5px] hover:border-gold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { dialog.onConfirm(); onClose(); }}
                className="px-4 py-1.5 rounded-sm bg-danger text-white text-[12.5px] font-semibold hover:opacity-90 transition-colors cursor-pointer border-none"
              >
                {dialog.confirmLabel ?? 'Confirm'}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-sm bg-brand text-white text-[12.5px] font-semibold hover:opacity-90 transition-colors cursor-pointer border-none"
            >
              OK
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
