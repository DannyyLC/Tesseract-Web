export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer' | string;

export interface DashboardUserDataDto {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  avatar: string | null;
  timezone: string | null;
  emailVerified?: boolean;
}

export interface DashboardUsersDto {
  total: number;
  byRole: {
    viewer: number;
    admin: number;
    owner: number;
    [key: string]: number;
  };
  active: number;
  inactive: number;
  verified: number;
  unverified: number;
}

export interface UpdateUserDto {
  role?: UserRole;
  isActive?: boolean;
}
