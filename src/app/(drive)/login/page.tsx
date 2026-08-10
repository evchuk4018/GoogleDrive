import { LoginForm } from '../../../components/drive/login-form';
import { drivePublicPath } from '../../../lib/config/drive-public-path';

export default function LoginPage() {
  return (
    <main className="login-page">
      <div className="login-card">
        <a className="brand brand-centered" href={drivePublicPath('/')}>
          <span aria-hidden="true" className="brand-mark">
            D
          </span>
          <span>Drive</span>
        </a>
        <p className="eyebrow">Private storage</p>
        <h1>Sign in to Drive</h1>
        <p className="login-intro">
          Use the API token configured for this private Drive service. Your browser session is
          short-lived and stored in a secure cookie.
        </p>
        <LoginForm />
        <p className="login-footer">
          <a href={drivePublicPath('/')}>Return to Drive</a>
        </p>
      </div>
    </main>
  );
}
