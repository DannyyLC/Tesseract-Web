export class CreateCustomerDto {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}
