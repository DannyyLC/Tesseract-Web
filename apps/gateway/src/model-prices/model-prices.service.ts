import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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
export class ModelPricesService {
  private readonly logger = new Logger(ModelPricesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calcular el costo en USD basado en los tokens usados
   */
  async calculateCost(
    modelName: string,
    usage: TokenUsage,
  ): Promise<CostCalculation> {
    // Buscar el precio actual del modelo
    const modelPrice = await this.prisma.modelPrice.findFirst({
      where: {
        modelName,
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!modelPrice) {
      this.logger.warn(
        `No pricing found for model: ${modelName}. Using default prices.`,
      );
      // Fallback: precios aproximados de gpt-4o-mini
      return this.calculateWithFallbackPrices(modelName, usage);
    }

    // Calcular costos
    const inputCost =
      (usage.inputTokens / 1_000_000) * modelPrice.inputPricePer1m;
    const outputCost =
      (usage.outputTokens / 1_000_000) * modelPrice.outputPricePer1m;
    const totalCost = inputCost + outputCost;

    return {
      inputCost: Number(inputCost.toFixed(6)),
      outputCost: Number(outputCost.toFixed(6)),
      totalCost: Number(totalCost.toFixed(6)),
      model: modelPrice.modelName,
      provider: modelPrice.provider,
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
   * Obtener todos los modelos activos con sus precios
   */
  async getActiveModelPrices() {
    return this.prisma.modelPrice.findMany({
      where: {
        isActive: true,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: [{ provider: 'asc' }, { modelName: 'asc' }],
    });
  }

  /**
   * Obtener precio específico de un modelo
   */
  async getModelPrice(modelName: string) {
    return this.prisma.modelPrice.findFirst({
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
