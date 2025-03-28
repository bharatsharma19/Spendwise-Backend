import { db } from '../config/firebase';
import { AppError, HttpStatusCode, ErrorType } from '../utils/error';
import { Timestamp, Query, DocumentData } from 'firebase-admin/firestore';

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
      return this.getDocument<T>(id);
    } catch (error) {
      if (error instanceof AppError) throw error;
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
      throw new AppError(
        `Failed to delete ${this.collection}`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async getCollection<T>(
    query: {
      field: string;
      operator: FirebaseFirestore.WhereFilterOp;
      value: any;
    }[] = []
  ): Promise<T[]> {
    try {
      let ref: Query<DocumentData> = db.collection(this.collection);
      query.forEach(({ field, operator, value }) => {
        ref = ref.where(field, operator, value);
      });
      const snapshot = await ref.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
    } catch (error) {
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
    query: {
      field: string;
      operator: FirebaseFirestore.WhereFilterOp;
      value: any;
    }[] = []
  ): Promise<T[]> {
    try {
      let ref: Query<DocumentData> = db
        .collection(this.collection)
        .doc(parentId)
        .collection(subCollection);
      query.forEach(({ field, operator, value }) => {
        ref = ref.where(field, operator, value);
      });
      const snapshot = await ref.get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
    } catch (error) {
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
      throw new AppError(
        `Failed to update ${subCollection} document`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }

  protected async deleteSubCollectionDocument(
    parentId: string,
    subCollection: string,
    documentId: string
  ): Promise<void> {
    try {
      await db
        .collection(this.collection)
        .doc(parentId)
        .collection(subCollection)
        .doc(documentId)
        .delete();
    } catch (error) {
      throw new AppError(
        `Failed to delete ${subCollection} document`,
        HttpStatusCode.INTERNAL_SERVER_ERROR,
        ErrorType.DATABASE
      );
    }
  }
}
