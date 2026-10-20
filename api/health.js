/**
 * Public health probe used by the control console.
 *
 * Deliberately boring: no secrets, no environment dump. It reports what is
 * already visible in every response (commit, region) plus uptime and a clock
 * so the console can measure latency against its own request.
 */
import { json } from './_lib/auth.js';

const booted = Date.now();

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }

  json(res, 200, {
    ok: true,
    service: 'aegis-m-web',
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || 'local',
    ref: process.env.VERCEL_GIT_COMMIT_REF || 'local',
    env: process.env.VERCEL_ENV || 'development',
    region: process.env.VERCEL_REGION || 'local',
    now: Date.now(),
    uptimeSec: Math.round((Date.now() - booted) / 1000),
  });
}
