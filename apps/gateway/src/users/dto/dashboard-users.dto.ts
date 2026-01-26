export interface DashboardUsersDto {
  totalUsers: number;
  activeUsers: number;
  invitedUsers: number;
  pendingUsers: number;
  users: DashboardUserDataDto[];
}

export interface DashboardUserDataDto {
  id?: string;
  email: string;
  name: string;
  role: String;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  avatar: string | null;
  timezone: string | null;
  emailVerified?: boolean;
}
