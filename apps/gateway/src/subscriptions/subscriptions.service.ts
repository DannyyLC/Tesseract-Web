import { PrismaService } from '../database/prisma.service';
import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { DashboardSubscriptionDto } from './dto/dashboard-subscription.dto';
import { Subscription, SubscriptionPlan, SubscriptionStatus } from '@workflow-platform/database';

@Injectable()
export class SubscriptionsService {
    constructor(
        private readonly prismaService: PrismaService,
        @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ){}

    async getDashboardData(organizationId: string): Promise<DashboardSubscriptionDto | null> {
        const subscription = await this.prismaService.subscription.findFirst({
            where: { organizationId },
            select: {
                id: true,
                plan: true,
                status: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                pendingPlanChange: true,
                planChangeRequestedAt: true,
                customMonthlyPrice: true,
                customMonthlyCredits: true,
                customMaxWorkflows: true,
                customFeatures: true,
            }
        });
        if (!subscription) {
            this.logger.error(`getDashboardData method >> No subscription found for organization ${organizationId}`);
            return null;
        }
        return subscription;
    }

    async createSubscription(organizationId: string, plan: SubscriptionPlan): Promise<Subscription | null> {
        try {
            const newSubscription = await this.prismaService.subscription.create({
                data: {
                    organizationId,
                    plan,
                    status: 'ACTIVE',
                    currentPeriodStart: new Date(),
                    currentPeriodEnd: new Date(new Date().setMonth(new Date().getMonth() + 1)),
                },
            });
            return newSubscription;
        } catch (error) {
            this.logger.error(`createSubscription method >> Error creating subscription for organization ${organizationId}: ${error.message}`);
            return null;
        }
    }

    async updateSubscriptionPlan(organizationId: string, newPlan: SubscriptionPlan): Promise<Subscription | null> {
        try {
            const updatedSubscription = await this.prismaService.subscription.update({
                where: { organizationId },
                data: {
                    pendingPlanChange: newPlan,
                    planChangeRequestedAt: new Date(),
                },
            });
            return updatedSubscription;
        } catch (error) {
            this.logger.error(`updateSubscriptionPlan method >> Error updating subscription for organization ${organizationId}: ${error}`);
            return null;
        }
    }

    async cancelSubscription(organizationId: string): Promise<Subscription | null> {
        try {
            const canceledSubscription = await this.prismaService.subscription.update({ 
                where: { organizationId },
                data: { status: SubscriptionStatus.CANCELED },
            });
            return canceledSubscription;
        } catch (error) {
            this.logger.error(`cancelSubscription method >> Error canceling subscription for organization ${organizationId}: ${error}`);
            return null;
        }
    }
}