export interface SearchQuery {
  title: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
}

export interface SearchResult {
  url: string;
  title: string;
  quality: string;
  source: string;
  headers?: Record<string, string>;
}

export interface Task {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  query: SearchQuery;
  results?: SearchResult[];
  error?: string;
}
