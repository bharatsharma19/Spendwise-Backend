import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { createUserClient } from '../config/supabaseClient';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

export interface QueryOptions {
  page?: number;
  limit?: number;
  offset?: number;
  search?: string;
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
}

export abstract class BaseService {
  protected readonly table: string;

  constructor(table: string) {
    this.table = table;
  }

  /**
   * Returns a user-scoped Supabase client (respects RLS) if token is provided,
   * otherwise returns the admin client (bypasses RLS).
   * Always prefer passing a token for data operations.
   */
  protected getClient(token?: string): SupabaseClient {
    if (token) {
      return createUserClient(token);
    }
    return supabase;
  }

  protected async getDocument<T>(id: string, token?: string): Promise<T> {
    const client = this.getClient(token);
    const { data, error } = await client.from(this.table).select('*').eq('id', id).single();

    if (error || !data) {
      throw new AppError(`${this.table} not found`, HttpStatusCode.NOT_FOUND, ErrorType.NOT_FOUND);
    }
    return data as T;
  }

  protected async createDocument<T>(data: Record<string, unknown>, token?: string): Promise<T> {
    const client = this.getClient(token);
    const { data: created, error } = await client
      .from(this.table)
      .insert({
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new AppError(
        `Failed to create ${this.table}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
    return created as T;
  }

  protected async updateDocument<T>(
    id: string,
    data: Record<string, unknown>,
    token?: string
  ): Promise<T> {
    const client = this.getClient(token);
    const { data: updated, error } = await client
      .from(this.table)
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new AppError(
        `Failed to update ${this.table}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
    return updated as T;
  }

  protected async deleteDocument(id: string, token?: string): Promise<void> {
    const client = this.getClient(token);
    const { error } = await client.from(this.table).delete().eq('id', id);
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
    options?: QueryOptions,
    token?: string
  ): Promise<T[]> {
    const client = this.getClient(token);
    let query = client.from(this.table).select('*');

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
          break;
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
      throw new AppError(
        `Failed to fetch collection ${this.table}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }

    return data as T[];
  }
}
