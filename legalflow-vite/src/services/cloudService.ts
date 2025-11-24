import type { Transaction, Category, LloydsCollectionItem, GenericCollectionItem, AccessCollectionItem } from '../types';

const API_BASE_URL = (import.meta.env.VITE_LEGALFLOW_API_URL || '').replace(/\/$/, '');

export class UnauthorizedError extends Error {
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

const ensureApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new Error('חסר משתנה סביבה VITE_LEGALFLOW_API_URL');
  }

  return API_BASE_URL;
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T);

  if (response.status === 401) {
    throw new UnauthorizedError((data as { error?: string }).error || 'Invalid credentials');
  }

  if (!response.ok) {
    const message = (data as { error?: string }).error || response.statusText || 'שגיאה בשרת';
    throw new Error(message);
  }

  return data as T;
};

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const baseUrl = ensureApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  return parseResponse<T>(response);
};

const authorizedRequest = async <T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> => {
  if (!token) {
    throw new Error('Missing auth token');
  }

  return request<T>(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
};

export interface CloudSnapshot {
  transactions: Transaction[];
  initialBalance: number;
  clients: string[];
  customCategories: Category[];
  loanOverrides: Record<string, number>;
  lloydsCollection?: LloydsCollectionItem[];
  genericCollection?: GenericCollectionItem[];
  accessCollection?: AccessCollectionItem[];
  updatedAt: string;
}

export interface AuthSuccess {
  token: string;
  user: {
    username: string;
    role: string;
  };
}

export const login = (username: string, password: string) =>
  request<AuthSuccess>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export const fetchCloudSnapshot = async (token: string): Promise<CloudSnapshot | null> => {
  if (!token) {
    return null;
  }

  return authorizedRequest<CloudSnapshot>('/api/v1/state', token);
};

export const persistCloudSnapshot = async (token: string, payload: CloudSnapshot) => {
  if (!token) {
    return;
  }

  await authorizedRequest('/api/v1/state', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

