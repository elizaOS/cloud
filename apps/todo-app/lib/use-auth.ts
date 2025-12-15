"use client";

import { useState, useEffect, useCallback } from "react";
import { createAppSession, getCurrentUser } from "./cloud-api";
import type { User, AuthState } from "./types";

const TOKEN_KEY = "eliza_todo_token";

export function useAuth(): AuthState & {
  login: () => Promise<void>;
  logout: () => void;
} {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    token: null,
  });

  const loadUser = useCallback(async (token: string) => {
    const user = await getCurrentUser(token).catch(() => null);
    if (user) {
      setState({ user, isLoading: false, isAuthenticated: true, token });
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        token: null,
      });
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      loadUser(token);
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [loadUser]);

  const login = useCallback(async () => {
    const session = await createAppSession(
      `${window.location.origin}/auth/callback`,
    );
    window.location.href = session.loginUrl;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      token: null,
    });
  }, []);

  return { ...state, login, logout };
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
