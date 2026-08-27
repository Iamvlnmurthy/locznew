import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LoginPage() {
  // OAuth client IDs are public identifiers. Read this on the server at request time so the
  // off-box CI build does not permanently bake an empty value into the login page.
  const googleClientId =
    process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

  return <LoginForm googleClientId={googleClientId} />;
}
