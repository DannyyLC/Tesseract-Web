import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@tesseract/database';
import { PrismaService } from '@/platform/database/prisma.service';
import { CreateLlmCategoryDto, UpdateLlmCategoryDto, QueryLlmCategoryDto } from './dto';

/**
 * CRUD de categorías de modelos LLM (globales, gestionadas por super admin).
 */
@Injectable()
export class LlmCategoriesService {
  private readonly logger = new Logger(LlmCategoriesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Listar categorías, opcionalmente filtrando por estado. Incluye el conteo
   * de modelos asociados (útil para estadísticas y para evitar borrados ciegos).
   */
  async findAll(query: QueryLlmCategoryDto) {
    const { isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where = isActive === undefined ? {} : { isActive };

    const [data, total] = await Promise.all([
      this.prisma.llmModelCategory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { models: true } } },
      }),
      this.prisma.llmModelCategory.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const category = await this.prisma.llmModelCategory.findUnique({
      where: { id },
      include: { _count: { select: { models: true } } },
    });
    if (!category) {
      throw new NotFoundException(`Categoría con ID ${id} no encontrada`);
    }
    return category;
  }

  async create(dto: CreateLlmCategoryDto) {
    try {
      return await this.prisma.llmModelCategory.create({ data: dto });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' // unique constraint (name)
      ) {
        throw new ConflictException(`Ya existe una categoría con el nombre "${dto.name}"`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateLlmCategoryDto) {
    await this.findOne(id);
    try {
      return await this.prisma.llmModelCategory.update({ where: { id }, data: dto });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Ya existe una categoría con el nombre "${dto.name}"`);
      }
      throw error;
    }
  }

  /**
   * Eliminar una categoría. La FK usa ON DELETE SET NULL, por lo que los
   * modelos que la referencian quedan sin categoría (no se borran).
   */
  async delete(id: string) {
    await this.findOne(id);
    const deleted = await this.prisma.llmModelCategory.delete({ where: { id } });
    this.logger.log(`Categoría LLM eliminada: ${deleted.name} (ID: ${id})`);
    return deleted;
  }
}
