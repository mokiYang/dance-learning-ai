import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService, TOKEN_KEY, USER_KEY } from '../services/api';

// 用户信息类型
export interface User {
  id: number;
  username: string;
  email?: string;
  avatar_url?: string;
  created_at?: string;
  last_login?: string;
  role?: 'user' | 'admin';
}

// 认证上下文类型
interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, password: string, email?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 初始化：从localStorage恢复登录状态
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('恢复用户信息失败:', error);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }

    setIsLoading(false);
  }, []);

  // 登录
  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await apiService.login(username, password);

      if (data.success) {
        setToken(data.token!);
        setUser(data.user!);
        localStorage.setItem(TOKEN_KEY, data.token!);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return { success: true };
      } else {
        return { success: false, error: data.error || '登录失败' };
      }
    } catch (error) {
      console.error('登录请求失败:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  // 注册
  const register = async (username: string, password: string, email?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const data = await apiService.register(username, password, email);

      if (data.success) {
        setToken(data.token!);
        setUser(data.user!);
        localStorage.setItem(TOKEN_KEY, data.token!);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        return { success: true };
      } else {
        return { success: false, error: data.error || '注册失败' };
      }
    } catch (error) {
      console.error('注册请求失败:', error);
      return { success: false, error: '网络错误，请稍后重试' };
    }
  };

  // 注销
  const logout = async () => {
    if (token) {
      try {
        await apiService.logout();
      } catch (error) {
        console.error('注销请求失败:', error);
      }
    }

    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  // 更新用户信息
  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
  };

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isAdmin: !!user && user.role === 'admin',
    isLoading,
    login,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// 自定义Hook：使用认证上下文
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth必须在AuthProvider内部使用');
  }
  return context;
};

// 辅助函数：获取Token（用于API调用）
export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};
