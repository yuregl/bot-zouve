export interface RoleInfo {
  id: string;
  name: string;
}

/**
 * Reads a comma-separated list of role names or IDs, like `admin, Moderador`. Names are
 * lowercased so they match without regard to case; empty entries are dropped.
 */
export function parseRoleList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((role) => role.trim().toLowerCase())
    .filter((role) => role.length > 0);
}

/** Whether any of the member's roles is in the allowed list, by name or ID. */
export function canManageBirthdays(memberRoles: readonly RoleInfo[], allowedRoles: readonly string[]): boolean {
  return memberRoles.some((role) => allowedRoles.includes(role.id) || allowedRoles.includes(role.name.trim().toLowerCase()));
}
