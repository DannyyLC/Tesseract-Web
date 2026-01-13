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
  TokenUsage,
  CostCalculation,
} from './dto';

@Injectable()
export class LlmModelsService {
  private readonly logger = new Logger(LlmModelsService.name);

  constructor(private prisma: PrismaService) { }

  //==========================================================
  // CRUD DE MODELOS LLM
  //==========================================================
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
        orderBy: [
          { provider: 'asc' },
          { modelName: 'asc' },
          { effectiveFrom: 'desc' },
        ],
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
   * Desactivar un modelo LLM
   * Marca el modelo como inactivo y establece la fecha de fin de vigencia
   */
  async delete(id: string) {
    // Verificar que existe
    const llmModel = await this.findOne(id);

    const now = new Date();
    const updatedModel = await this.prisma.llmModel.update({
      where: { id },
      data: {
        isActive: false,
        effectiveTo: now,
        notes: llmModel.notes
          ? `${llmModel.notes} | Desactivado: ${now.toISOString()}`
          : `Desactivado: ${now.toISOString()}`,
      },
    });

    this.logger.log(
      `Modelo LLM desactivado: ${llmModel.provider}/${llmModel.modelName} (ID: ${id})`,
    );

    return updatedModel;
  }

  //==========================================================
  // CÁLCULO DE COSTOS Y FUNCIONES AUXILIARES
  //==========================================================
  // Precios de fallback (basados en gpt-4o-mini a enero 2026)
  private readonly FALLBACK_PRICES = {
    inputPricePer1m: 0.15, // $0.15 por 1M tokens input
    outputPricePer1m: 0.6, // $0.60 por 1M tokens output
  } as const;

  /**
   * Calcular el costo en USD basado en los tokens usados
   *
   * @param modelName - Nombre del modelo LLM
   * @param usage - Tokens de input/output usados
   * @returns Cálculo detallado del costo
   * @throws Error si los tokens son inválidos
   */
  async calculateCost(
    modelName: string,
    usage: TokenUsage,
  ): Promise<CostCalculation> {
    // Validar entrada
    this.validateTokenUsage(usage);

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
        `No pricing found for model: ${modelName}. Using fallback prices.`,
      );
      return this.calculateWithFallbackPrices(modelName, usage);
    }

    // Calcular costos
    const calculation = this.performCostCalculation(
      usage,
      llmModel.inputPricePer1m,
      llmModel.outputPricePer1m,
      llmModel.modelName,
      llmModel.provider,
    );

    this.logger.debug(
      `Cost calculated for ${modelName}: $${calculation.totalCost} ` +
      `(${usage.inputTokens} input + ${usage.outputTokens} output tokens)`,
    );

    return calculation;
  }

  /**
   * Calcular costos para múltiples modelos en batch (evita N+1)
   *
   * @param usageByModel - Map de modelName → TokenUsage
   * @returns Array de cálculos de costo por modelo
   */
  async calculateCostBatch(
    usageByModel: Record<string, TokenUsage>,
  ): Promise<CostCalculation[]> {
    const modelNames = Object.keys(usageByModel);

    if (modelNames.length === 0) {
      return [];
    }

    // Validar todas las entradas
    for (const usage of Object.values(usageByModel)) {
      this.validateTokenUsage(usage);
    }

    // Batch query: obtener todos los modelos en una sola consulta
    const llmModels = await this.prisma.llmModel.findMany({
      where: {
        modelName: { in: modelNames },
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // Crear map de modelName → LlmModel para lookup rápido
    const modelMap = new Map(llmModels.map((m) => [m.modelName, m]));

    // Calcular costos para cada modelo
    const calculations: CostCalculation[] = [];

    for (const [modelName, usage] of Object.entries(usageByModel)) {
      const llmModel = modelMap.get(modelName);

      if (!llmModel) {
        this.logger.warn(
          `No pricing found for model: ${modelName}. Using fallback prices.`,
        );
        calculations.push(this.calculateWithFallbackPrices(modelName, usage));
      } else {
        calculations.push(
          this.performCostCalculation(
            usage,
            llmModel.inputPricePer1m,
            llmModel.outputPricePer1m,
            llmModel.modelName,
            llmModel.provider,
          ),
        );
      }
    }

    this.logger.debug(
      `Batch cost calculated for ${calculations.length} models`,
    );

    return calculations;
  }

  /**
   * Precios por defecto cuando no se encuentra el modelo en la BD
   */
  private calculateWithFallbackPrices(
    modelName: string,
    usage: TokenUsage,
  ): CostCalculation {
    return this.performCostCalculation(
      usage,
      this.FALLBACK_PRICES.inputPricePer1m,
      this.FALLBACK_PRICES.outputPricePer1m,
      modelName,
      'unknown',
    );
  }

  /**
   * Realiza el cálculo matemático del costo
   * Centraliza la lógica para evitar duplicación
   *
   * @param usage - Tokens usados
   * @param inputPricePer1m - Precio por 1M tokens de input
   * @param outputPricePer1m - Precio por 1M tokens de output
   * @param modelName - Nombre del modelo
   * @param provider - Proveedor del modelo
   * @returns Cálculo de costo con 6 decimales de precisión
   */
  private performCostCalculation(
    usage: TokenUsage,
    inputPricePer1m: number,
    outputPricePer1m: number,
    modelName: string,
    provider: string,
  ): CostCalculation {
    const inputCost = (usage.inputTokens / 1_000_000) * inputPricePer1m;
    const outputCost = (usage.outputTokens / 1_000_000) * outputPricePer1m;
    const totalCost = inputCost + outputCost;

    // Redondear a 6 decimales (suficiente para costos en USD)
    return {
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      model: modelName,
      provider,
    };
  }

  /**
   * Valida que el uso de tokens sea válido
   *
   * @param usage - Objeto con tokens de input/output
   * @throws Error si los tokens son inválidos
   */
  private validateTokenUsage(usage: TokenUsage): void {
    if (!usage) {
      throw new Error('Token usage is required');
    }

    if (usage.inputTokens < 0 || usage.outputTokens < 0) {
      throw new Error('Token counts cannot be negative');
    }

    if (
      !Number.isFinite(usage.inputTokens) ||
      !Number.isFinite(usage.outputTokens)
    ) {
      throw new Error('Token counts must be finite numbers');
    }
  }
}
