export interface AuthContext {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  isAnonymous: boolean;
  signInProvider?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
