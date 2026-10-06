import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import './index.less';

interface LoginProps {
  onSuccess?: () => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true); // true: 登录模式, false: 注册模式
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证输入
    if (!username.trim() || !password.trim()) {
      setError(t('auth.required'));
      return;
    }

    if (username.length < 3) {
      setError(t('auth.usernameMin'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.passwordMin'));
      return;
    }

    setLoading(true);

    try {
      let result;
      if (isLogin) {
        result = await login(username, password);
      } else {
        result = await register(username, password, email);
      }

      if (result.success) {
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(result.error || t('auth.actionFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2 className="login-title">{t(isLogin ? 'auth.login' : 'auth.register')}</h2>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">{t('auth.username')}</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('auth.enterUsername')}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="email">{t('auth.emailOptional')}</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.enterEmail')}
                disabled={loading}
                autoComplete="email"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="password">{t('auth.password')}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('auth.enterPassword')}
              disabled={loading}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? t('common.processing') : t(isLogin ? 'auth.login' : 'auth.register')}
          </button>
        </form>

        <div className="login-footer">
          <span className="toggle-text">
            {t(isLogin ? 'auth.noAccount' : 'auth.hasAccount')}
          </span>
          <button type="button" className="btn-toggle" onClick={toggleMode} disabled={loading}>
            {t(isLogin ? 'auth.registerNow' : 'auth.loginNow')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
