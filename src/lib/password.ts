/**
 * Password policy, resolved in one place so the server checks and the form
 * hints can never drift apart.
 *
 * Deliberately free of `server-only` and of the zod-validated `env()` helper:
 * the *type* is imported by client components, and the policy object is passed
 * to them as a prop from a server component.
 */

export type PasswordPolicy = {
  minLength: number;
  requireComplexity: boolean;
  /** True when ALLOW_WEAK_PASSWORDS is on — surfaced in the UI so it is visible. */
  relaxed: boolean;
};

export const STRICT_POLICY: PasswordPolicy = {
  minLength: 12,
  requireComplexity: true,
  relaxed: false,
};

/**
 * For a closed, trusted network. Still keeps a floor of 4 characters so an
 * empty or single-character password cannot be set by accident.
 */
export const RELAXED_POLICY: PasswordPolicy = {
  minLength: 4,
  requireComplexity: false,
  relaxed: true,
};

export function isWeakPasswordsAllowed(): boolean {
  const raw = (process.env.ALLOW_WEAK_PASSWORDS ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function passwordPolicy(): PasswordPolicy {
  return isWeakPasswordsAllowed() ? RELAXED_POLICY : STRICT_POLICY;
}

/** Returns a Norwegian error message, or null when the password is acceptable. */
export function passwordProblem(password: string, policy: PasswordPolicy = passwordPolicy()): string | null {
  if (password.length < policy.minLength) {
    return `Passordet må være minst ${policy.minLength} tegn.`;
  }
  if (policy.requireComplexity) {
    if (!/[a-zæøå]/i.test(password)) return 'Passordet må inneholde minst én bokstav.';
    if (!/\d|[^\w\s]/.test(password)) return 'Passordet må inneholde minst ett tall eller spesialtegn.';
  }
  return null;
}

/** The hint shown under a password field. */
export function describePolicy(policy: PasswordPolicy): string {
  return policy.requireComplexity
    ? `Minst ${policy.minLength} tegn, og må inneholde tall eller spesialtegn.`
    : `Minst ${policy.minLength} tegn. Kravene til sterkt passord er slått av.`;
}
