export class DashboardEndUserDto {
    phoneNumber: string | null;
    email: string | null;
    externalId: string | null;
    name: string | null;
    avatar: string | null;
    metadata: Object | null;
    lastSeenAt: Date | null;
    createdAt: Date;
}