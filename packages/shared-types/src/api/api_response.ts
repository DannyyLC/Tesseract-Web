export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  message?: string;
  errors?: string[];
  statusCode?: number;
  timestamp?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export class ApiResponseBuilder<T = any> {
  private response: ApiResponse<T>;
  constructor() {
    this.response = {
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    };
  }

  setSuccess(success: boolean): ApiResponseBuilder<T> {
    this.response.success = success;
    return this;
  }
  setData(data: T): ApiResponseBuilder<T> {
    this.response.data = data;
    return this;
  }
  setMessage(message: string): ApiResponseBuilder<T> {
    this.response.message = message;
    return this;
  }
  setErrors(errors: string[]): ApiResponseBuilder<T> {
    this.response.errors = errors;
    return this;
  }
  setStatusCode(statusCode: number): ApiResponseBuilder<T> {
    this.response.statusCode = statusCode;
    return this;
  }
  build(): ApiResponse<T> {
    return this.response;
  }
}
