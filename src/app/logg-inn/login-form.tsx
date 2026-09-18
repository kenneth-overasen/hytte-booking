'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}

      <Field label="E-post" required>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          spellCheck={false}
          placeholder="navn@example.no"
        />
      </Field>

      <Field label="Passord" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Logger inn …' : 'Logg inn'}
      </Button>
    </form>
  );
}
