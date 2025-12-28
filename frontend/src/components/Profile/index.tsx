import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import Login from '../Login';
import VideoCard from '../VideoCard';
import Tabs from '../Tabs';
import './index.less';

const Profile: React.FC = () => {
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const [userVideos, setUserVideos] = useState<any[]>([]);
  const [referenceVideos, setReferenceVideos] = useState<any[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'user' | 'reference'>('user');

  // 获取用户发布的视频 - Hooks必须在所有条件返回之前
  useEffect(() => {
    if (isAuthenticated && user) {
      const fetchVideos = async () => {
        try {
          setVideosLoading(true);
          
          // 并行获取用户视频和教学视频
          const [userVideosResponse, referenceVideosResponse] = await Promise.all([
            apiService.getUserVideos(),
            apiService.getReferenceVideos()
          ]);
          
          if (userVideosResponse.success) {
            setUserVideos(userVideosResponse.videos || []);
          }
          
          if (referenceVideosResponse.success) {
            // 只显示当前用户上传的教学视频（通过author字段匹配）
            const myReferenceVideos = referenceVideosResponse.videos?.filter(
              (video: any) => video.author === user?.username
            ) || [];
            setReferenceVideos(myReferenceVideos);
          }
        } catch (error) {
          console.error('获取视频失败:', error);
        } finally {
          setVideosLoading(false);
        }
      };
      
      fetchVideos();
    }
  }, [isAuthenticated, user]);

  // 条件返回必须在所有Hooks之后
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

  const handleTabChange = (tab: 'user' | 'reference') => {
    setActiveTab(tab);
  };

  const handleVideoClick = (videoId: string, videoType: 'user' | 'reference' = 'user') => {
    if (videoType === 'user') {
      navigate(`/user-video/${videoId}?tab=user`);
    } else {
      navigate(`/video/${videoId}?tab=reference`);
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
          <button className="btn-logout-header" onClick={handleLogout} title="退出登录">
            退出登录
          </button>
          {user?.email && <p className="email">{user.email}</p>}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="profile-videos-section">
        <div className="video-tabs-wrapper">
          <Tabs
            items={[
              { key: 'user', label: '用户视频' },
              { key: 'reference', label: '教学视频' }
            ]}
            activeKey={activeTab}
            onChange={(key) => handleTabChange(key as 'user' | 'reference')}
          />
        </div>

        {/* 视频网格 */}
        {videosLoading ? (
          <div className="videos-loading">加载中...</div>
        ) : activeTab === 'user' ? (
          userVideos.length === 0 ? (
            <div className="videos-empty">
              <p>还没有发布过用户视频</p>
              <p className="empty-hint">快去上传你的第一个视频吧！</p>
            </div>
          ) : (
            <div className="profile-videos-grid">
              {userVideos.map((video) => (
                <VideoCard
                  key={video.video_id}
                  videoId={video.video_id}
                  videoType="user"
                  title={video.title || video.filename}
                  author={video.author}
                  onClick={() => handleVideoClick(video.video_id, 'user')}
                />
              ))}
            </div>
          )
        ) : (
          referenceVideos.length === 0 ? (
            <div className="videos-empty">
              <p>还没有发布过教学视频</p>
              <p className="empty-hint">快去上传你的第一个教学视频吧！</p>
            </div>
          ) : (
            <div className="profile-videos-grid">
              {referenceVideos.map((video) => (
                <VideoCard
                  key={video.video_id}
                  videoId={video.video_id}
                  videoType="reference"
                  title={video.title || video.filename}
                  author={video.author}
                  thumbnailPath={video.thumbnail_path}
                  onClick={() => handleVideoClick(video.video_id, 'reference')}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default Profile;
