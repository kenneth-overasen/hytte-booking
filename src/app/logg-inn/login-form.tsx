'use client';

import { useActionState, useRef, useState } from 'react';
import { loginAction, type LoginState } from './actions';
import { Alert, Button, Field, Input } from '@/components/ui';
import type { OperatorOption } from '@/lib/operator-picker';

/** Verdien når ingen operatør er valgt: skriv e-post som før. */
const MANUAL = '';

/** Forbokstavene i første og siste navn, slik flisene leses på avstand. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

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
        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Bruker</span>
          <div className="grid grid-cols-2 gap-2">
            {operators.map((o) => {
              const active = o.email === picked;
              return (
                <button
                  key={o.email}
                  type="button"
                  // Et nytt trykk på den valgte flisen slipper deg tilbake til
                  // e-postfeltet, så administratorer ikke står fast i et valg.
                  onClick={() => pick(active ? MANUAL : o.email)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 transition ${
                    active
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-surface hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                      active ? 'bg-accent text-accentFg' : 'bg-accent/10 text-accent'
                    }`}
                  >
                    {initials(o.name)}
                  </span>
                  <span className="w-full truncate text-center text-xs font-medium" title={o.name}>
                    {o.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
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
        <>
          {/* Navn alene skiller ikke to like fornavn — vis adressen som velges. */}
          <p className="truncate text-xs text-muted" title={picked}>
            Logger inn som <span className="text-fg">{picked}</span>
          </p>
          {/* Serveren slår opp kontoen på denne adressen som ellers. Et valg her
              gir ingen tilgang i seg selv — passordet kontrolleres likt uansett. */}
          <input type="hidden" name="email" value={picked} />
        </>
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
