import { CursorPaginatedResponse, PaginatedResponse } from '@workflow-automation/shared-types';

export class CursorPaginatedResponseUtils {
  private static instance: CursorPaginatedResponseUtils;

  private constructor() {}

  static getInstance(): CursorPaginatedResponseUtils {
    if (!CursorPaginatedResponseUtils.instance) {
      CursorPaginatedResponseUtils.instance = new CursorPaginatedResponseUtils();
    }
    return CursorPaginatedResponseUtils.instance;
  }

  async build<T extends { id: string }>(
    items: T[],
    take: number,
    paginationAction: 'next' | 'prev' | null,
  ): Promise<CursorPaginatedResponse<T>> {
    return {
      items: items.slice(0, take),
      nextCursor:
        items.length > (take ?? 10) || paginationAction === 'prev'
          ? (items.slice(0, take ?? 10).pop()?.id ?? null)
          : null,
      prevCursor:
        (paginationAction === 'prev' && items.length > (take ?? 10)) || paginationAction === 'next'
          ? items[0]?.id 
          : null,
      nextPageAvailable: items.length > (take ?? 10) || paginationAction === 'prev',
      pageSize: take ?? 10,
    };
  }
}
