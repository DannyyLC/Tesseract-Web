import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/platform/database/prisma.service';
import { CursorPaginatedResponseUtils } from '@/platform/common/responses/cursor-paginated-response';
import { DEFAULT_PAGE_SIZE, GetToolsDto, PaginatedResponse } from '@tesseract/types';
import { Prisma } from '@tesseract/database';
import { DEFAULT_LOCALE, SupportedLocale } from '@/platform/common/types/locale.type';

@Injectable()
export class ToolsCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllToolsWithFunctions(
    cursor?: string | null,
    take = DEFAULT_PAGE_SIZE,
    paginationAction: 'next' | 'prev' | null = null,
    filters?: {
      search?: string;
    },
    locale: SupportedLocale = DEFAULT_LOCALE,
  ): Promise<PaginatedResponse<GetToolsDto>> {
    const where: Prisma.ToolCatalogWhereInput = {
      ...(filters?.search && {
        OR: [
          { toolName: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { provider: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
    };

    const tools = await this.prisma.toolCatalog.findMany({
      where,
      skip: cursor ? 1 : 0,
      take: paginationAction === 'next' || paginationAction === null ? take + 1 : -(take + 1),
      cursor: cursor ? { id: cursor } : undefined,
      include: {
        functions: true,
      },
      orderBy: { displayName: 'asc' },
    });

    // Los textos en inglés son opcionales: si faltan (NULL) se muestra el texto base en español.
    const wantsEnglish = locale === 'en';
    const pick = (en: string | null, es: string | null) => (wantsEnglish && en ? en : (es ?? ''));

    const sanitizedTools = tools.map((tool) => ({
      id: tool.id,
      toolName: tool.toolName,
      displayName: pick(tool.displayNameEn, tool.displayName),
      description: pick(tool.descriptionEn, tool.description),
      provider: tool.provider ?? '',
      isActive: tool.isActive,
      isInBeta: tool.isInBeta,
      icon: tool.icon ?? '',
      category: tool.category ?? '',
      functions: tool.functions.map((fn) => ({
        id: fn.id,
        functionName: fn.functionName,
        displayName: pick(fn.displayNameEn, fn.displayName),
        description: pick(fn.descriptionEn, fn.description),
        category: fn.category ?? '',
        isActive: fn.isActive,
        isInBeta: fn.isInBeta,
        icon: fn.icon ?? '',
        dangerLevel: fn.dangerLevel ?? '',
      })),
    }));
    const paginatedTools = await CursorPaginatedResponseUtils.getInstance().build(
      sanitizedTools,
      take,
      paginationAction,
    );
    return paginatedTools;
  }
}
