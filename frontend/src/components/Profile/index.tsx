import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Login from '../Login';
import './index.less';

const Profile: React.FC = () => {
  const { user, isAuthenticated, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="profile-container">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout();
    }
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <div className="avatar">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="头像" />
          ) : (
            <div className="avatar-placeholder">
              {user?.username.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="user-info">
          <h2 className="username">{user?.username}</h2>
          {user?.email && <p className="email">{user.email}</p>}
        </div>
      </div>

      <div className="profile-content">
        <div className="info-section">
          <h3 className="section-title">账号信息</h3>
          <div className="info-list">
            <div className="info-item">
              <span className="info-label">用户名</span>
              <span className="info-value">{user?.username}</span>
            </div>
            {user?.email && (
              <div className="info-item">
                <span className="info-label">邮箱</span>
                <span className="info-value">{user.email}</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">注册时间</span>
              <span className="info-value">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}
              </span>
            </div>
            {user?.last_login && (
              <div className="info-item">
                <span className="info-label">最后登录</span>
                <span className="info-value">
                  {new Date(user.last_login).toLocaleString('zh-CN')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* <div className="features-section">
          <h3 className="section-title">会员功能</h3>
          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-icon">📹</span>
              <span className="feature-text">上传教学视频</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🎯</span>
              <span className="feature-text">跟学练习</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">📊</span>
              <span className="feature-text">查看学习记录</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">💬</span>
              <span className="feature-text">评论互动</span>
            </div>
          </div>
        </div> */}
      </div>

      <div className="profile-actions">
        <button className="btn-logout" onClick={handleLogout}>
          退出登录
        </button>
      </div>
    </div>
  );
};

export default Profile;
