export interface DashboardMessageDto {
    role: string;
    content: string;
    attachments: Object | null;
    model: string | null;
    createdAt: Date;
}