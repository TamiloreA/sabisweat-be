/**
 * Support Model
 *
 * Types and interfaces for the Help & Support domain and FAQs.
 */

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  order: number;
  is_published: boolean;
  url?: string | null;
  created_at?: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface SupportFaqsResponse {
  data: FAQItem[];
}
