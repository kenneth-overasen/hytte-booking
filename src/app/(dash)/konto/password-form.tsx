'use client';

import { useActionState } from 'react';
import { changePasswordAction, type PasswordState } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';
import { describePolicy, type PasswordPolicy } from '@/lib/password';

export function PasswordForm({ policy }: { policy: PasswordPolicy }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePasswordAction, {});

  return (
    <form action={action} className="max-w-sm space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}

      <Field label="Nåværende passord" required>
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Nytt passord" required hint={describePolicy(policy)}>
        <Input name="next" type="password" autoComplete="new-password" required minLength={policy.minLength} />
      </Field>
      <Field label="Gjenta nytt passord" required>
        <Input name="repeat" type="password" autoComplete="new-password" required minLength={policy.minLength} />
      </Field>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Lagrer …' : 'Endre passord'}
      </Button>
    </form>
  );
}
