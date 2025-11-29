import { DocumentData, Query, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { AppError, ErrorType, HttpStatusCode } from '../utils/error';

export interface QueryOptions {
  limit?: number;
  offset?: number; // Note: In Firestore, using a cursor (startAfter) is better for performance, but offset works for smaller sets
  orderBy?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}

export abstract class BaseService {
  protected readonly collection: string;

  constructor(collection: string) {
    this.collection = collection;
  }

  protected async getDocument<T>(id: string): Promise<T> {
    try {
      const doc = await db.collection(this.collection).doc(id).get();
      if (!doc.exists) {
        throw new AppError(
          `${this.collection} not found`,
          HttpStatusCode.NOT_FOUND,
          ErrorType.NOT_FOUND
        );
      }
      return { id: doc.id, ...doc.data() } as T;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error(`Error getting document from ${this.collection}:`, error);
      throw new AppError(
        `Failed to get ${this.collection}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async createDocument<T>(data: Omit<T, 'id'>): Promise<T> {
    try {
      const docRef = await db.collection(this.collection).add({
        ...data,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return { id: docRef.id, ...data } as T;
    } catch (error) {
      console.error(`Error creating document in ${this.collection}:`, error);
      throw new AppError(
        `Failed to create ${this.collection}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async updateDocument<T>(id: string, data: Partial<T>): Promise<T> {
    try {
      const docRef = db.collection(this.collection).doc(id);
      await docRef.update({
        ...data,
        updatedAt: Timestamp.now(),
      });
      // Re-fetch to return complete object
      return this.getDocument<T>(id);
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error(`Error updating document in ${this.collection}:`, error);
      throw new AppError(
        `Failed to update ${this.collection}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async deleteDocument(id: string): Promise<void> {
    try {
      const docRef = db.collection(this.collection).doc(id);
      await docRef.delete();
    } catch (error) {
      console.error(`Error deleting document from ${this.collection}:`, error);
      throw new AppError(
        `Failed to delete ${this.collection}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  // UPDATED: Added pagination and sorting options
  protected async getCollection<T>(
    filters: {
      field: string;
      operator: FirebaseFirestore.WhereFilterOp;
      value: any;
    }[] = [],
    options?: QueryOptions
  ): Promise<T[]> {
    try {
      let ref: Query<DocumentData> = db.collection(this.collection);

      filters.forEach(({ field, operator, value }) => {
        ref = ref.where(field, operator, value);
      });

      if (options?.orderBy) {
        ref = ref.orderBy(options.orderBy.field, options.orderBy.direction);
      } else {
        // Default sort by createdAt if available, otherwise strictly required for pagination consistency
        // We check if the collection might have createdAt, but since we can't know for sure at runtime without schema,
        // we'll assume it's safe or the caller should provide orderBy.
        // Ideally, we should have a consistent field.
        ref = ref.orderBy('createdAt', 'desc');
      }

      if (options?.offset) ref = ref.offset(options.offset);
      if (options?.limit) ref = ref.limit(options.limit);

      const snapshot = await ref.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
    } catch (error) {
      // Log the specific error for debugging
      console.error(`Firestore Query Error in ${this.collection}:`, error);
      throw new AppError(
        `Failed to get ${this.collection} collection`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async getSubCollection<T>(
    parentId: string,
    subCollection: string,
    filters: {
      field: string;
      operator: FirebaseFirestore.WhereFilterOp;
      value: any;
    }[] = [],
    options?: QueryOptions
  ): Promise<T[]> {
    try {
      let ref: Query<DocumentData> = db
        .collection(this.collection)
        .doc(parentId)
        .collection(subCollection);

      filters.forEach(({ field, operator, value }) => {
        ref = ref.where(field, operator, value);
      });

      if (options?.orderBy) {
        ref = ref.orderBy(options.orderBy.field, options.orderBy.direction);
      } else {
        ref = ref.orderBy('createdAt', 'desc');
      }

      if (options?.offset) ref = ref.offset(options.offset);
      if (options?.limit) ref = ref.limit(options.limit);

      const snapshot = await ref.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
    } catch (error) {
      console.error(`Error getting subcollection ${subCollection} in ${this.collection}:`, error);
      throw new AppError(
        `Failed to get ${subCollection} subcollection`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async addToSubCollection<T>(
    parentId: string,
    subCollection: string,
    data: Omit<T, 'id'>
  ): Promise<T> {
    try {
      const docRef = await db
        .collection(this.collection)
        .doc(parentId)
        .collection(subCollection)
        .add({
          ...data,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      return { id: docRef.id, ...data } as T;
    } catch (error) {
      console.error(`Error adding to subcollection ${subCollection} in ${this.collection}:`, error);
      throw new AppError(
        `Failed to add to ${subCollection} subcollection`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async updateSubCollectionDocument<T>(
    parentId: string,
    subCollection: string,
    documentId: string,
    data: Partial<T>
  ): Promise<T> {
    try {
      const docRef = db
        .collection(this.collection)
        .doc(parentId)
        .collection(subCollection)
        .doc(documentId);

      await docRef.update({
        ...data,
        updatedAt: Timestamp.now(),
      });

      const doc = await docRef.get();
      return { id: doc.id, ...doc.data() } as T;
    } catch (error) {
      console.error(
        `Error updating subcollection document ${subCollection} in ${this.collection}:`,
        error
      );
      throw new AppError(
        `Failed to update ${subCollection} document`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }
}
