import { SubscriptionPlan } from "@workflow-platform/database";


export interface OrganizationDashboardDto {
    name: string;
    plan: SubscriptionPlan;
    allowOverages: boolean;
    isActive: boolean;
    createdAt: Date;    
    customMaxUsers: number | null;
    customMaxApiKeys: number | null;
    customMaxWorkflows: number | null;
}