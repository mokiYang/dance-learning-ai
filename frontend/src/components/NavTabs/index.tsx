import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './index.less';

const NavTabs: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabs = [
    {
      key: '/',
      label: '首页',
      icon: '🏠',
    },
    {
      key: '/profile',
      label: '个人页',
      icon: '👤',
    },
    // 可以继续添加更多 tab
    // {
    //   key: '/explore',
    //   label: '发现',
    //   icon: '🔍',
    // },
  ];

  const isActive = (key: string) => {
    return location.pathname === key;
  };

  return (
    <nav className="nav-tabs">
      <div className="nav-tabs-container">
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className={`nav-tab-item ${isActive(tab.key) ? 'active' : ''}`}
            onClick={() => navigate(tab.key)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </div>
        ))}
      </div>
    </nav>
  );
};

export default NavTabs;
