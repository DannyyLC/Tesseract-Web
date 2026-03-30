import { UserDetailDto as IUserDetailDto } from '@tesseract/types';

export class UserDetailDto implements IUserDetailDto {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  readonly avatar: string | null;
  readonly timezone: string | null;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
  readonly emailVerified: boolean;

  constructor(partial: Partial<UserDetailDto>) {
    Object.assign(this, partial);
  }
}
