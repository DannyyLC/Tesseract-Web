import { Organization, Subscription } from './models.model';

export interface DashboardOrganizationDto extends Organization {
  subscriptionData: Partial<Subscription>;
}

export interface UpdateOrganizationDto {
  name?: string;
}

export interface InviteUserDto {
  email: string;
}

export interface AcceptInvitationDto {
  user: string;
  password?: string;
  verificationCode: string;
}
