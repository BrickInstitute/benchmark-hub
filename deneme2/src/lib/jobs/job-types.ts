export interface JobContext {
  jobId: string;
  targetUrl: string;
  targetSite: string;
  maxItems: number;
  config?: {
    category?: string;
    autoScore?: boolean;
  };
}
