import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import './index.less';

/**
 * 首页运营提示 Bar
 *
 * 展示规则（与产品策略一致）：
 *  - 仅在用户登录后展示
 *  - 当用户已学习完所有"新手入门"教学视频后自动隐藏（服务端判定）
 *  - 用户每完成一个作品时（VideoComparison 投稿成功）会派发 'onboardingChanged' 事件，
 *    本组件收到后重新拉取状态，做到"完成最后一个 beginner 视频后回首页 bar 立即下掉"
 *  - 用户可点击 × 手动关闭，关闭状态写入 localStorage（按用户 ID 维度）
 *  - 本期文案与跳转目标都通过常量配置，未来切换运营策略只需要改这里
 */

// 当前运营策略：引导用户先录制新手入门视频
const PROMOTION_CONFIG = {
  text: '🌟 新手入门指引：跟着这些视频录制你的第一个作品',
  cta: '去看看',
  targetPath: '/beginner',
  // 关闭状态的 localStorage key 前缀
  storageKeyPrefix: 'dance_promo_dismissed:beginner:v1',
};

interface PromotionBarProps {
  className?: string;
}

// 'loading'  : 正在拉取后端状态，先不渲染避免闪烁
// 'visible'  : 应当展示
// 'hidden'   : 不展示（已完成 / 用户手动关闭 / 未登录）
type Visibility = 'loading' | 'visible' | 'hidden';

const PromotionBar: React.FC<PromotionBarProps> = ({ className = '' }) => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [visibility, setVisibility] = useState<Visibility>('loading');

  // 关闭状态按用户维度存储，多账号互不影响
  const storageKey = user?.id != null
    ? `${PROMOTION_CONFIG.storageKeyPrefix}:${user.id}`
    : PROMOTION_CONFIG.storageKeyPrefix;

  // 用 ref 跟踪当前 effect 是否已被卸载/重置，避免过期请求 setState
  const cancelledRef = useRef(false);

  // 拉取一次后端状态并更新可见性。
  // 注意：refresh 时如果已经 hidden（用户手动关掉了），不再恢复成 visible。
  const fetchAndApply = useCallback(async () => {
    if (!isAuthenticated) {
      setVisibility('hidden');
      return;
    }
    if (localStorage.getItem(storageKey) === '1') {
      setVisibility('hidden');
      return;
    }
    try {
      const res = await apiService.getOnboardingStatus();
      if (cancelledRef.current) return;
      if (res.success && res.has_completed_beginner) {
        setVisibility('hidden');
      } else {
        // 未完成 / 接口失败：运营曝光优先
        setVisibility('visible');
      }
    } catch {
      if (cancelledRef.current) return;
      setVisibility('visible');
    }
  }, [isAuthenticated, storageKey]);

  // 登录态变化时重置并首拉
  useEffect(() => {
    cancelledRef.current = false;
    setVisibility('loading');
    fetchAndApply();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchAndApply]);

  // 监听完成事件：用户每完成一个作品就重新核对一次，让 bar 在完成最后一个 beginner 时立刻下掉
  useEffect(() => {
    const handler = () => {
      if (!isAuthenticated) return;
      // 已经手动 × 的，不需要再查（fetchAndApply 内部也会短路，但提早返回省一次请求）
      if (localStorage.getItem(storageKey) === '1') return;
      fetchAndApply();
    };
    window.addEventListener('onboardingChanged', handler);
    return () => {
      window.removeEventListener('onboardingChanged', handler);
    };
  }, [isAuthenticated, storageKey, fetchAndApply]);

  if (visibility !== 'visible') return null;

  const handleClick = () => {
    navigate(PROMOTION_CONFIG.targetPath);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem(storageKey, '1');
    setVisibility('hidden');
  };

  return (
    <div
      className={`promotion-bar ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
    >
      <div className="promotion-bar__content">
        <span className="promotion-bar__text">{PROMOTION_CONFIG.text}</span>
        <span className="promotion-bar__cta">
          {PROMOTION_CONFIG.cta}
          <span className="promotion-bar__arrow">→</span>
        </span>
      </div>
      <button
        type="button"
        className="promotion-bar__close"
        onClick={handleDismiss}
        aria-label="关闭提示"
      >
        ×
      </button>
    </div>
  );
};

export default PromotionBar;

