'use client';

import { useActionState, useRef, useState } from 'react';
import { loginAction, type LoginState } from './actions';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import type { OperatorOption } from '@/lib/operator-picker';

/** Velgerens verdi når ingen operatør er valgt: skriv e-post som før. */
const MANUAL = '';

export function LoginForm({ operators }: { operators: OperatorOption[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [picked, setPicked] = useState(MANUAL);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Tom liste = velgeren er av (SHOW_OPERATOR_PICKER), eller det finnes ingen
  // aktive operatører ennå. Begge deler gir skjemaet slik det alltid har vært.
  const showPicker = operators.length > 0;

  function pick(email: string) {
    setPicked(email);
    // Passordet er det eneste som gjenstår etter et valg — hopp rett dit.
    if (email !== MANUAL) passwordRef.current?.focus();
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert kind="error">{state.error}</Alert>}

      {showPicker && (
        <Field label="Bruker" hint={picked || 'Administratorer logger inn med e-post.'}>
          <Select name="operator" autoFocus value={picked} onChange={(e) => pick(e.target.value)}>
            <option value={MANUAL}>Annen bruker – skriv e-post …</option>
            {operators.map((o) => (
              <option key={o.email} value={o.email}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {picked === MANUAL ? (
        <Field label="E-post" required>
          <Input
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus={!showPicker}
            spellCheck={false}
            placeholder="navn@example.no"
          />
        </Field>
      ) : (
        // Serveren slår opp kontoen på denne adressen som ellers. Et valg her
        // gir ingen tilgang i seg selv — passordet kontrolleres likt uansett.
        <input type="hidden" name="email" value={picked} />
      )}

      <Field label="Passord" required>
        <Input ref={passwordRef} name="password" type="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? 'Logger inn …' : 'Logg inn'}
      </Button>
    </form>
  );
}
