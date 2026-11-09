import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Workspace from '@/components/Workspace';
import { getSessionCookieName } from '@/lib/config';
import { verifySessionToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const jar = await cookies();
  const token = jar.get(getSessionCookieName())?.value;
  const session = await verifySessionToken(token);
  if (!session) redirect('/login');
  return <Workspace />;
}
