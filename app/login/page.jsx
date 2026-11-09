import LoginForm from '@/components/LoginForm';
import { APP_NAME } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `登入 · ${APP_NAME}`,
};

export default function LoginPage() {
  return <LoginForm appName={APP_NAME} />;
}
