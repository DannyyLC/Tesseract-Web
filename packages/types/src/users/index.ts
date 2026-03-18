export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  VIEWER = 'VIEWER',
}

export interface DashboardUserDataDto {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
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

export interface User {
  id: string;
  email: string;
  name: string;
  password?: string | null;
  googleId?: string | null;
  emailVerified: boolean;
  emailVerificationToken?: string | null;
  emailVerificationTokenExpires?: Date | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  lastLoginAt?: Date | null;
  avatar?: string | null;
  timezone?: string | null;
  organizationId: string;
}

export interface UserDetailDto {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  avatar: string | null;
  timezone: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  emailVerified: boolean;
}

export interface UpdateProfileDto {
  name?: string;
  avatar?: string;
  timezone?: string;
}

export interface LeaveOrganizationDto {
  confirmationText: string;
  code2FA?: string;
}
