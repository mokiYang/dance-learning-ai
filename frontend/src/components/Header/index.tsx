import React from 'react';
import { useNavigate } from 'react-router-dom';
import LanguageSwitcher from '../LanguageSwitcher';
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
        <LanguageSwitcher />
      </div>
    </header>
  );
};

export default Header;
