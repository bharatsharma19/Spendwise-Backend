import axios from 'axios';
import { auth } from '../config/firebase';

export class AuthService {
  private static instance: AuthService;
  private readonly apiKey: string;

  private constructor() {
    this.apiKey = process.env.FIREBASE_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('FIREBASE_API_KEY is required');
    }
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  public async signInWithEmailAndPassword(email: string, password: string) {
    try {
      const response = await axios.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${this.apiKey}`,
        {
          email,
          password,
          returnSecureToken: true,
        }
      );

      const { localId: uid } = response.data;
      const customToken = await auth.createCustomToken(uid);

      return {
        customToken,
        uid,
      };
    } catch (error: any) {
      if (error.response?.data?.error?.message === 'INVALID_PASSWORD') {
        throw new Error('Invalid email or password');
      }
      throw error;
    }
  }
}
