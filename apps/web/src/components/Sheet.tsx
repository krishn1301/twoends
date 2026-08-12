import { useEffect } from 'react';

import type { ReactNode } from 'react';

/**
 * A sheet that slides up over the screen.
 *
 * Used instead of a route because drawing or sending a photo is something you
 * do *to* the home screen and then return from — the mental model is a drawer,
 * not a destination, and the app still has no router.
 *
 * Escape closes it, the backdrop closes it, and the scroll behind it is locked
 * so a drag on the canvas cannot scroll the page underneath.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-60 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-void relative max-h-[92vh] overflow-y-auto rounded-t-[32px] px-5 pt-3 pb-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        {/* The grab handle. Purely a signal that this is a sheet and can go away. */}
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />

        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} className="text-ash h-11 px-2 text-sm">
            Close
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
