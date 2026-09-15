import { supabase } from '../config/database';
import { Example, CreateExampleInput, UpdateExampleInput } from '../models/exampleModel';

const TABLE_NAME = 'examples';

export const getAllExamples = async (): Promise<Example[]> => {
  const { data, error } = await supabase.from(TABLE_NAME).select('*');
  if (error) throw error;
  return data || [];
};

export const getExampleById = async (id: string): Promise<Example | null> => {
  const { data, error } = await supabase.from(TABLE_NAME).select('*').eq('id', id).single();
  if (error) return null;
  return data;
};

export const createExample = async (input: CreateExampleInput): Promise<Example> => {
  const { data, error } = await supabase.from(TABLE_NAME).insert(input).select().single();
  if (error) throw error;
  return data;
};

export const updateExample = async (
  id: string,
  input: UpdateExampleInput
): Promise<Example | null> => {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) return null;
  return data;
};

export const deleteExample = async (id: string): Promise<boolean> => {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
  if (error) return false;
  return true;
};
