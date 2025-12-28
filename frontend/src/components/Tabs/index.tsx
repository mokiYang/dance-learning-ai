import React from 'react';
import './index.less';

export interface TabItem {
  key: string;
  label: string;
}

export interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

const Tabs: React.FC<TabsProps> = ({ items, activeKey, onChange, className = '' }) => {
  return (
    <div className={`tabs-container ${className}`}>
      {items.map((item) => (
        <button
          key={item.key}
          className={`tab-button ${activeKey === item.key ? 'active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default Tabs;

