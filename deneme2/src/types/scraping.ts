export interface ScrapingJobInfo {
  id: string;
  targetUrl: string;
  targetSite: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  maxItems: number;
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface ScrapingRequest {
  targetUrl: string;
  targetSite: string;
  maxItems?: number;
  config?: {
    category?: string;
    autoScore?: boolean;
  };
}

export interface ScrapedItem {
  title: string;
  description?: string;
  imageBuffer: Buffer;
  sourceUrl: string;
  htmlContent?: string;
  metadata?: {
    dominantColors?: string[];
    typography?: Record<string, string>;
    layoutType?: string;
  };
}
