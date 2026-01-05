import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateLlmModelDto,
  UpdateLlmModelDto,
  QueryLlmModelsDto,
} from './dto';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostCalculation {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
  provider: string;
}

@Injectable()
export class LlmModelsService {
  private readonly logger = new Logger(LlmModelsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Crear un nuevo modelo LLM
   */
  async create(createLlmModelDto: CreateLlmModelDto) {
    // Verificar si ya existe un modelo activo en el mismo rango de fechas
    const existingModel = await this.prisma.llmModel.findFirst({
      where: {
        provider: createLlmModelDto.provider,
        modelName: createLlmModelDto.modelName,
        isActive: true,
        effectiveFrom: createLlmModelDto.effectiveFrom
          ? new Date(createLlmModelDto.effectiveFrom)
          : { lte: new Date() },
        OR: [
          { effectiveTo: null },
          {
            effectiveTo: createLlmModelDto.effectiveTo
              ? { gte: new Date(createLlmModelDto.effectiveTo) }
              : { gte: new Date() },
          },
        ],
      },
    });

    if (existingModel) {
      throw new ConflictException(
        `Ya existe un modelo activo para ${createLlmModelDto.provider}/${createLlmModelDto.modelName} en el rango de fechas especificado`,
      );
    }

    return this.prisma.llmModel.create({
      data: {
        ...createLlmModelDto,
        effectiveFrom: createLlmModelDto.effectiveFrom
          ? new Date(createLlmModelDto.effectiveFrom)
          : new Date(),
        effectiveTo: createLlmModelDto.effectiveTo
          ? new Date(createLlmModelDto.effectiveTo)
          : null,
      },
    });
  }

  /**
   * Obtener todos los modelos LLM con filtros y paginación
   */
  async findAll(query: QueryLlmModelsDto) {
    const { provider, tier, isActive, category, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (provider) where.provider = provider;
    if (tier) where.tier = tier;
    if (isActive !== undefined) where.isActive = isActive;
    if (category) where.category = category;

    const [data, total] = await Promise.all([
      this.prisma.llmModel.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ provider: 'asc' }, { modelName: 'asc' }, { effectiveFrom: 'desc' }],
      }),
      this.prisma.llmModel.count({ where }),
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

  /**
   * Obtener un modelo LLM por ID
   */
  async findOne(id: string) {
    const llmModel = await this.prisma.llmModel.findUnique({
      where: { id },
    });

    if (!llmModel) {
      throw new NotFoundException(`Modelo LLM con ID ${id} no encontrado`);
    }

    return llmModel;
  }

  /**
   * Actualizar un modelo LLM
   */
  async update(id: string, updateLlmModelDto: UpdateLlmModelDto) {
    // Verificar que existe
    await this.findOne(id);

    return this.prisma.llmModel.update({
      where: { id },
      data: {
        ...updateLlmModelDto,
        effectiveFrom: updateLlmModelDto.effectiveFrom
          ? new Date(updateLlmModelDto.effectiveFrom)
          : undefined,
        effectiveTo: updateLlmModelDto.effectiveTo
          ? new Date(updateLlmModelDto.effectiveTo)
          : undefined,
      },
    });
  }

  /**
   * Calcular el costo en USD basado en los tokens usados
   */
  async calculateCost(
    modelName: string,
    usage: TokenUsage,
  ): Promise<CostCalculation> {
    // Buscar el modelo actual
    const llmModel = await this.prisma.llmModel.findFirst({
      where: {
        modelName,
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!llmModel) {
      this.logger.warn(
        `No pricing found for model: ${modelName}. Using default prices.`,
      );
      // Fallback: precios aproximados de gpt-4o-mini
      return this.calculateWithFallbackPrices(modelName, usage);
    }

    // Calcular costos
    const inputCost =
      (usage.inputTokens / 1_000_000) * llmModel.inputPricePer1m;
    const outputCost =
      (usage.outputTokens / 1_000_000) * llmModel.outputPricePer1m;
    const totalCost = inputCost + outputCost;

    return {
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      model: llmModel.modelName,
      provider: llmModel.provider,
    };
  }

  /**
   * Precios por defecto cuando no se encuentra el modelo en la BD
   */
  private calculateWithFallbackPrices(
    modelName: string,
    usage: TokenUsage,
  ): CostCalculation {
    // Precios aproximados por defecto (basados en gpt-4o-mini)
    const fallbackPrices = {
      inputPricePer1m: 0.15, // $0.15 por 1M tokens input
      outputPricePer1m: 0.6, // $0.60 por 1M tokens output
    };

    const inputCost =
      (usage.inputTokens / 1_000_000) * fallbackPrices.inputPricePer1m;
    const outputCost =
      (usage.outputTokens / 1_000_000) * fallbackPrices.outputPricePer1m;
    const totalCost = inputCost + outputCost;

    return {
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      model: modelName,
      provider: 'unknown',
    };
  }

  /**
   * Obtener todos los modelos activos
   */
  async getActiveModels() {
    return this.prisma.llmModel.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: [{ provider: 'asc' }, { modelName: 'asc' }],
    });
  }

  /**
   * Obtener modelo específico por nombre
   */
  async getModel(modelName: string) {
    return this.prisma.llmModel.findFirst({
      where: {
        modelName,
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
  }
}
