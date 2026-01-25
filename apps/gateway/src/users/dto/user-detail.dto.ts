export class UserDetailDto {
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

    constructor(partial: Partial<UserDetailDto>) {
        Object.assign(this, partial);
    }
}
