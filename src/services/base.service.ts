import { supabase } from '../config/supabase';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}

export abstract class BaseService {
  protected readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  protected async getDocument<T>(id: string): Promise<T> {
    const { data, error } = await supabase.from(this.table).select('*').eq('id', id).single();

    if (error || !data) {
      throw new AppError(`${this.table} not found`, HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
    }
    return data as T;
  }

  protected async createDocument<T>(data: Record<string, unknown>): Promise<T> {
    const { data: created, error } = await supabase
      .from(this.table)
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error(`Error creating in ${this.table}:`, error);
      throw new AppError(
        `Failed to create ${this.table}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
    return created as T;
  }

  protected async updateDocument<T>(id: string, data: Record<string, unknown>): Promise<T> {
    const { data: updated, error } = await supabase
      .from(this.table)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`Error updating ${this.table}:`, error);
      throw new AppError(
        `Failed to update ${this.table}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
    return updated as T;
  }

  protected async deleteDocument(id: string): Promise<void> {
    const { error } = await supabase.from(this.table).delete().eq('id', id);
    if (error) {
      throw new AppError(
        `Failed to delete from ${this.table}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async getCollection<T>(
    filters: { field: string; operator: string; value: unknown }[] = [],
    options?: QueryOptions
  ): Promise<T[]> {
    let query = supabase.from(this.table).select('*');

    filters.forEach(({ field, operator, value }) => {
      switch (operator) {
        case '==':
          query = query.eq(field, value);
          break;
        case '>=':
          query = query.gte(field, value);
          break;
        case '<=':
          query = query.lte(field, value);
          break;
        case '>':
          query = query.gt(field, value);
          break;
        case '<':
          query = query.lt(field, value);
          break;
        case 'in':
          query = query.in(field, value as readonly unknown[]);
          break;
        case 'array-contains':
          query = query.contains(field, [value]);
          break;
        default:
          // Fallback for other operators if supported or custom logic needed
          console.warn(`Unsupported operator ${operator} for field ${field}`);
      }
    });

    if (options?.orderBy) {
      query = query.order(options.orderBy.field, {
        ascending: options.orderBy.direction === 'asc',
      });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (options?.limit) query = query.limit(options.limit);
    if (options?.offset)
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);

    const { data, error } = await query;

    if (error) {
      console.error(error);
      throw new AppError(
        `Failed to fetch collection ${this.table}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }

    return data as T[];
  }
}
