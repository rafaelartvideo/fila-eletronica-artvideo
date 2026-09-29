export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidUsername(value: unknown) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}
