export const panelPermissions = [
  'queue.view',
  'attendance.view',
  'service_types.manage',
  'users.view',
  'users.manage',
  'roles.view',
  'roles.manage',
  'display.manage',
  'printer.manage',
] as const;

export function canAccessPanel(hasPermission: (permission: string) => boolean): boolean {
  return panelPermissions.some((permission) => hasPermission(permission));
}
