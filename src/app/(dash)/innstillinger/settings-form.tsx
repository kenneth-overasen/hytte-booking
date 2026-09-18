'use client';

import { useActionState, type ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import type { SettingsState } from './actions';

/**
 * Wraps a settings section: server-rendered fields as children, with the
 * action plumbing, submit button and inline feedback handled here.
 */
export function SettingsForm({
  action,
  settingsKey,
  children,
  label = 'Lagre',
  encType,
}: {
  action: (prev: SettingsState, fd: FormData) => Promise<SettingsState>;
  settingsKey?: string;
  children: ReactNode;
  label?: string;
  encType?: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(action, {});

  return (
    <form action={formAction} encType={encType} className="space-y-4">
      {settingsKey && <input type="hidden" name="_key" value={settingsKey} />}
      {children}

      {state.error && (
        <Alert kind="error">
          {state.error}
          {state.detail && <pre className="mt-1 whitespace-pre-wrap text-xs">{state.detail}</pre>}
        </Alert>
      )}
      {state.success && (
        <Alert kind="success">
          {state.success}
          {state.detail && <pre className="mt-1 whitespace-pre-wrap break-all text-xs">{state.detail}</pre>}
        </Alert>
      )}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Lagrer …' : label}
      </Button>
    </form>
  );
}

/** A button that runs an action without any fields of its own. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  hidden = {},
  variant = 'secondary',
  confirm,
}: {
  action: (prev: SettingsState, fd: FormData) => Promise<SettingsState>;
  label: string;
  pendingLabel?: string;
  hidden?: Record<string, string>;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(action, {});

  return (
    <div className="space-y-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? (pendingLabel ?? 'Jobber …') : label}
        </Button>
      </form>
      {state.error && (
        <Alert kind="error">
          {state.error}
          {state.detail && <pre className="mt-1 whitespace-pre-wrap text-xs">{state.detail}</pre>}
        </Alert>
      )}
      {state.success && (
        <Alert kind="success">
          {state.success}
          {state.detail && <pre className="mt-1 whitespace-pre-wrap break-all text-xs">{state.detail}</pre>}
        </Alert>
      )}
    </div>
  );
}
