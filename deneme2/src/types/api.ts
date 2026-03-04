export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ApiError {
  error: string;
  success: false;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
  success: true;
}
