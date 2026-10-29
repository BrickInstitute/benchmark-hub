export interface BenchmarkListItem {
  id: string;
  title: string;
  thumbnailPath: string | null;
  imagePath: string;
  overallScore: number | null;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  tags: {
    tag: {
      id: string;
      name: string;
      slug: string;
    };
  }[];
  sourceSite: string | null;
  createdAt: string;
}

export interface BenchmarkDetail extends BenchmarkListItem {
  description: string | null;
  sourceUrl: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  format: string | null;
  dominantColors: string[] | null;
  typography: Record<string, string> | null;
  layoutType: string | null;
  status: string;
  isUploaded: boolean;
}

export interface BenchmarkFilters {
  category?: string;
  tags?: string[];
  minScore?: number;
  maxScore?: number;
  sourceSite?: string;
  search?: string;
  sort?: string;
  page?: number;
}
