import React from 'react';
import { useNavigate } from 'react-router-dom';
import './index.less';

const Header: React.FC = () => {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <div className="header-content">
        {/* Logo */}
        <div className="logo" onClick={() => navigate('/')}>
          <span className="logo-text">DANCEAURA</span>
        </div>
      </div>
    </header>
  );
};

export default Header;
