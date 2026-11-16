import { z } from 'zod';

export const NAV_ROUTES = [
  'dashboard',
  'new-run',
  'plan',
  'goals',
  'games',
  'profiles',
  'history',
  'logs',
  'settings'
] as const;

export const NavRouteSchema = z.enum(NAV_ROUTES);
export type NavRoute = z.infer<typeof NavRouteSchema>;

export function isValidNavRoute(route: unknown): route is NavRoute {
  return NavRouteSchema.safeParse(route).success;
}
