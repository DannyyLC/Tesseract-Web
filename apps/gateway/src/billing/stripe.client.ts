import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeClient implements OnModuleInit {
    public stripe: Stripe;

    constructor(private configService: ConfigService) { }

    onModuleInit() {
        const apiKey = this.configService.get<string>('STRIPE_SECRET_KEY');
        if (!apiKey) {
            throw new Error('STRIPE_SECRET_KEY is not defined in configuration');
        }

        this.stripe = new Stripe(apiKey, {
            apiVersion: '2025-01-27.acacia' as any, // Bypass strict typing for now or match exact version if known
            typescript: true,
        });
    }

    // Helper getters for common resources
    get customers() {
        return this.stripe.customers;
    }

    get subscriptions() {
        return this.stripe.subscriptions;
    }

    get paymentIntents() {
        return this.stripe.paymentIntents;
    }

    get invoices() {
        return this.stripe.invoices;
    }
}
