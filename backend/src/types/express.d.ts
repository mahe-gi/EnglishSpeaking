export interface AuthContext {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
