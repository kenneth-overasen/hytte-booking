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

  const button = (
    <Button type="submit" variant={variant} disabled={pending}>
      {pending ? (pendingLabel ?? 'Jobber …') : label}
    </Button>
  );

  return (
    <>
      <form
        action={formAction}
        className={className}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {/* Outside the spaced wrapper: space-y-* targets every child, so a
            hidden input still pushes the button down by the gap. */}
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {children ? (
          <div className="space-y-2">
            {children}
            {button}
          </div>
        ) : (
          button
        )}
      </form>

      {/* A sibling, not a form child: inside a button row it then takes a full
          line of its own below every button instead of stretching the row and
          displacing them. order/basis are inert outside a flex container. */}
      {(state.error || state.success) && (
        <div className="order-last basis-full">
          {state.error && <Alert kind="error">{state.error}</Alert>}
          {state.success && <Alert kind="success">{state.success}</Alert>}
        </div>
      )}
    </>
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
