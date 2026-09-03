import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * Form furniture, shared so every screen in the setup flow behaves identically.
 *
 * Two rules from the build plan are baked in here rather than left to each
 * screen: labels stay visible (a placeholder that vanishes the moment you type
 * is not a label), and errors sit beside the field they describe rather than in
 * a banner at the top of the page.
 */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="text-sm" style={{ color: '#e4566e' }}>
          {error}
        </span>
      ) : hint ? (
        <span className="text-ash text-sm">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`bg-surface-2 text-chalk w-full rounded-2xl px-4 py-3.5 text-base outline-none placeholder:text-[var(--color-placeholder)] focus:ring-2 focus:ring-white/25 ${className}`}
    />
  );
}

export function Button({
  children,
  accent,
  variant = 'solid',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  accent: string;
  variant?: 'solid' | 'quiet';
  children: ReactNode;
}) {
  const solid = variant === 'solid';
  return (
    <button
      {...props}
      className={`w-full rounded-full py-3.5 text-[1.02rem] font-semibold transition-opacity disabled:opacity-40 ${solid ? 'text-void' : 'text-ash'} ${className}`}
      style={solid ? { background: accent } : undefined}
    >
      {children}
    </button>
  );
}

/**
 * An honest progress bar: it counts every step, including the ones you may skip.
 * A bar that only counts steps you did not skip lurches forward and stops
 * meaning anything.
 */
export function Progress({ step, total, accent }: { step: number; total: number; accent: string }) {
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${step} of ${total}`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${(step / total) * 100}%`, background: accent }}
      />
    </div>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className="text-ash -ml-2 flex h-11 w-11 items-center justify-center"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 5 8 12l7 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
