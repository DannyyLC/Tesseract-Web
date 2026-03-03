// ============================================================
// End Users — Shared types for end user display
// ============================================================

export interface DashboardEndUserDto {
  id: string;
  phoneNumber: string | null;
  email: string | null;
  externalId: string | null;
  name: string | null;
  avatar: string | null;
  metadata: object | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}
