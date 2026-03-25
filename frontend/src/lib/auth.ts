import axios from "axios";

const TOKEN_KEY = "paper-insight-token";
const USER_KEY = "paper-insight-user";

export interface UserInfo {
  id: number;
  email: string;
  name: string;
}

interface AuthResponse {
  token: string;
  user: UserInfo;
}

const authApi = axios.create({ baseURL: "/api" });

export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  const { data } = await authApi.post<AuthResponse>("/auth/register", {
    email,
    password,
    name,
  });
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const { data } = await authApi.post<AuthResponse>("/auth/login", {
    email,
    password,
  });
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): UserInfo | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
