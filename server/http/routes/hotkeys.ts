import { Problem } from '../../problem.js';
import { input } from '../helpers.js';
import type { RequestContext } from '../contracts.js';
export async function hotkeysRoutes(ctx: RequestContext): Promise<unknown> {
  const { hotkeys, req, method, user, json } = ctx;
  if (!user) throw new Problem(401, 'Please sign in to continue.');
  if (method === 'GET') return json(200, { items: await hotkeys.list(user) });
  if (method === 'PATCH') return json(200, await hotkeys.replace(user, await input(req)));
  throw new Problem(405, 'Method not allowed.');
}
