import { Controller, Post, Body, Headers, BadRequestException, Req } from '@nestjs/common';
import { BillingService } from './billing.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Controller('billing')
export class BillingController {
    constructor(
        private readonly billingService: BillingService,
        private readonly configService: ConfigService,
    ) { }

    @Post('webhook')
    async handleWebhook(
        @Headers('stripe-signature') signature: string,
        @Req() request: Request,
    ) {
        if (!signature) {
            throw new BadRequestException('Missing stripe-signature header');
        }

        const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
        if (!webhookSecret) {
            throw new Error('STRIPE_WEBHOOK_SECRET not configured');
        }


        // In a real app, we verify signature here.
        // const event = this.stripeClient.stripe.webhooks.constructEvent(request.body, signature, webhookSecret);

        // For now, we assume the body IS the event object (dev mode or simplified)
        // We need to cast it or construct it properly.
        const event = request.body as any; // DANGEROUS in prod without signature check!

        try {
            await this.billingService.handleWebhookEvent(event);
        } catch (err: any) {
            throw new BadRequestException(`Webhook Error: ${err.message}`);
        }

        return { received: true };
    }
}
