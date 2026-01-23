export interface CursorPaginatedRequest {
    cursor?: string;
    action: 'next' | 'prev' | null;
    pageSize: number;
}