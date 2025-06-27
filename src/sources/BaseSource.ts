import { SearchQuery, SearchResult } from "../types";

export abstract class BaseSource {
  abstract name: string;

  /**
   * Searches for content on the source website.
   * @param query - The search query containing title, type, etc.
   * @returns A promise that resolves to an array of found, validated search results.
   */
  abstract find(query: SearchQuery): Promise<SearchResult[]>;
}
