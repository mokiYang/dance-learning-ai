import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './index.less';

interface TabBarProps {
  onUploadClick: () => void;
}

const TabBar: React.FC<TabBarProps> = ({ onUploadClick }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleTabClick = (key: string) => {
    navigate(key);
  };

  return (
    <div className="tab-bar">
      {/* 首页 Tab */}
      <div
        className={`tab-bar-item ${location.pathname === '/' ? 'active' : ''}`}
        onClick={() => handleTabClick('/')}
      >
        <div className="tab-bar-icon">🏠</div>
        <div className="tab-bar-label">首页</div>
      </div>

      {/* 中间上传按钮 */}
      <div className="tab-bar-upload" onClick={onUploadClick}>
        <div className="upload-button">
          <span className="upload-icon">+</span>
        </div>
      </div>

      {/* 个人页 Tab */}
      <div
        className={`tab-bar-item ${location.pathname === '/profile' ? 'active' : ''}`}
        onClick={() => handleTabClick('/profile')}
      >
        <div className="tab-bar-icon">👤</div>
        <div className="tab-bar-label">个人页</div>
      </div>
    </div>
  );
};

export default TabBar;
