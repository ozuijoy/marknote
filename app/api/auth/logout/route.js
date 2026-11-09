import { route } from '@/lib/api';
import { loggedOutResponse } from '@/lib/session';

export const POST = route(async () => loggedOutResponse({ ok: true }));
