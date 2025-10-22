
export interface ClientPayload {
  id: string;
  name: string;
  email: string;
  plan: string;
  maxWorkflows: number;
  maxExecutionsPerDay: number;
  isActive: boolean;
  region: string | null;
  metadata: any;
}