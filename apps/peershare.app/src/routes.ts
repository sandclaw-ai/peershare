/** `/invite` (and `/peer-share/invite`) is a Guest's page; everything else is the hub. */
export function isGuestPage(pathname: string): boolean {
  return /^\/(peer-share\/)?invite(\/|$)/.test(pathname);
}
