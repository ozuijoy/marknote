import { route } from '@/lib/api';
import { APP_NAME, checkRequiredEnv, getEmbedAllowlist } from '@/lib/config';
import { getSessionFromRequest } from '@/lib/session';

export const GET = route(async (req) => {
  const session = await getSessionFromRequest(req);
  return Response.json({
    authenticated: Boolean(session),
    appName: APP_NAME,
    embedHosts: getEmbedAllowlist(),
    missingEnv: checkRequiredEnv(),
  });
});
