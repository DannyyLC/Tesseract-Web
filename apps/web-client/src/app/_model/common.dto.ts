export interface PaginatedResponse<T> {
  items: T[];
  nextPageAvailable: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  pageSize: number;
}
