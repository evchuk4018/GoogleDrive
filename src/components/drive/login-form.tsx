'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import { login } from './drive-api';
import { getErrorMessage } from './drive-utils';
import { drivePublicPath } from '@/lib/config/drive-public-path';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = token.trim();

    if (!value) {
      setError('Enter your Drive API token to continue.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(value);
      setToken('');

      if (onSuccess) {
        onSuccess();
      } else {
        window.location.assign(drivePublicPath('/'));
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'The token could not be verified.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="field-group">
        <label htmlFor="drive-token">API token</label>
        <input
          autoComplete="current-password"
          autoFocus
          disabled={isSubmitting}
          id="drive-token"
          name="token"
          onChange={(event) => setToken(event.target.value)}
          placeholder="Paste your token"
          required
          type="password"
          value={token}
        />
      </div>
      {error ? (
        <p aria-live="polite" className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="button button-primary button-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
