export interface Example {
  id: string;
  name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateExampleInput {
  name: string;
  description?: string;
}

export interface UpdateExampleInput {
  name?: string;
  description?: string;
}
