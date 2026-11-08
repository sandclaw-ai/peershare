/** A path inside the help site, under its base (`/help`): `u("/security")` → `/help/security`. */
export const u = (path: string): string => `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
