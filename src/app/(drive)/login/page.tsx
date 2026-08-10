import Link from 'next/link';

import { LoginForm } from '../../../components/drive/login-form';

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-card">
        <Link className="brand brand-centered" href="/">
          <span aria-hidden="true" className="brand-mark">
            D
          </span>
          <span>Drive</span>
        </Link>
        <p className="eyebrow">Private storage</p>
        <h1>Sign in to Drive</h1>
        <p className="login-intro">
          Use the API token configured for this private Drive service. Your browser session is
          short-lived and stored in a secure cookie.
        </p>
        <LoginForm />
        <p className="login-footer">
          <Link href="/">Return to Drive</Link>
        </p>
      </div>
    </main>
  );
}
