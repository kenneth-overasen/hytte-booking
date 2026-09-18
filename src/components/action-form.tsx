'use client';

import { useActionState, type ReactNode } from 'react';
import { Alert, Button } from './ui';

export type ActionState = { error?: string; success?: string };

/**
 * A small wrapper around a server action so any panel can get a button plus
 * inline success/error feedback without repeating the plumbing.
 */
export function ActionForm({
  action,
  hidden = {},
  label,
  pendingLabel,
  variant = 'secondary',
  confirm,
  children,
  className = '',
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hidden?: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  confirm?: string;
  children?: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className={`space-y-2 ${className}`}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? (pendingLabel ?? 'Jobber …') : label}
      </Button>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
    </form>
  );
}

/** A plain form posting to a non-state server action, with a confirmation prompt. */
export function ConfirmForm({
  action,
  hidden = {},
  label,
  confirm,
  variant = 'danger',
}: {
  action: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  label: string;
  confirm: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" variant={variant}>
        {label}
      </Button>
    </form>
  );
}
