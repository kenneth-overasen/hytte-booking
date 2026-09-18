import type { ComponentProps, ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accentFg hover:opacity-90 border-transparent',
  secondary: 'bg-surface text-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border-border',
  ghost: 'bg-transparent text-fg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border-transparent',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 border-transparent',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

export function LinkButton({
  variant = 'secondary',
  className = '',
  ...props
}: ComponentProps<'a'> & { variant?: ButtonVariant }) {
  return (
    <a
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = '',
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} className={`${inputClass} ${className}`} />;
}

export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select {...props} className={`${inputClass} ${className}`} />;
}

export function Textarea({ className = '', ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={`${inputClass} ${className}`} />;
}

export function Checkbox({ label, hint, ...props }: ComponentProps<'input'> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-accent accent-[rgb(var(--accent))]"
      />
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
  );
}

/**
 * A neutral card-like box with a coloured stripe and heading, rather than a
 * fully tinted block. A saturated wash (amber especially) turns muddy over the
 * dark navy surface, and coloured body text hurts legibility; keeping the body
 * in the normal foreground colour avoids both.
 */
const ALERT_STYLES: Record<'info' | 'success' | 'warning' | 'error', { box: string; title: string }> = {
  info: { box: 'border-l-sky-500 bg-sky-500/[0.07]', title: 'text-sky-700 dark:text-sky-300' },
  success: { box: 'border-l-emerald-500 bg-emerald-500/[0.07]', title: 'text-emerald-700 dark:text-emerald-300' },
  warning: { box: 'border-l-amber-500 bg-amber-500/[0.07]', title: 'text-amber-700 dark:text-amber-300' },
  error: { box: 'border-l-rose-500 bg-rose-500/[0.07]', title: 'text-rose-700 dark:text-rose-300' },
};

export function Alert({
  kind = 'info',
  title,
  children,
}: {
  kind?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: ReactNode;
}) {
  const style = ALERT_STYLES[kind];
  return (
    <div className={`rounded-lg border border-border border-l-4 px-3 py-2.5 text-sm text-fg ${style.box}`}>
      {title && <p className={`font-semibold ${style.title}`}>{title}</p>}
      {children && <div className={title ? 'mt-0.5 text-fg/85' : 'text-fg/85'}>{children}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
