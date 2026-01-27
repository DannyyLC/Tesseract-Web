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
    paginationAction?: 'next' | 'prev' | null,
  ): Promise<CursorPaginatedResponse<T>> {
    let data: T[] = [];
    let hasNextPage = false;
    let hasPrevPage = false;

    if (paginationAction === 'prev') {
      if (items.length > take) {
        hasPrevPage = true;
        data = items.slice(1);
      } else {
        hasPrevPage = false;
        data = items;
      }
      hasNextPage = true;
    } else {
      if (items.length > take) {
        hasNextPage = true;
        data = items.slice(0, take);
      } else {
        hasNextPage = false;
        data = items;
      }
      hasPrevPage = paginationAction === 'next';
    }

    return {
      items: data,
      nextCursor: hasNextPage && data.length > 0 ? data[data.length - 1].id : null,
      prevCursor: hasPrevPage && data.length > 0 ? data[0].id : null,
      nextPageAvailable: hasNextPage,
      pageSize: take ?? 10,
    };
  }
}
