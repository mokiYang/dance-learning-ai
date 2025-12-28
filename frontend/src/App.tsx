import { BrowserRouter as Router, Routes, Route, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import VideoList from './components/VideoList';
import VideoPlayer from './components/VideoPlayer';
import UserVideoPlayer from './components/UserVideoPlayer';
import VideoResult from './components/VideoResult';
import VideoComparison from './components/VideoComparison';
import Profile from './components/Profile';
import Header from './components/Header';
import TabBar from './components/TabBar';
import ToastContainer from './components/Toast/ToastContainer';
import './App.less';

// 对比页独立路由组件
const VideoComparisonPage: React.FC = () => {
  const { workId } = useParams<{ workId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  if (!workId) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>工作ID不存在</p>
        <button onClick={() => navigate('/')} className="btn btn-primary">返回首页</button>
      </div>
    );
  }
  
  // 从查询参数获取视频ID，如果存在则返回到视频详情页，否则返回上一页
  const videoId = searchParams.get('videoId');
  const handleClose = () => {
    if (videoId) {
      navigate(`/video/${videoId}`);
    } else {
      navigate(-1);
    }
  };
  
  // 对比页作为独立页面，隐藏 Header 和 TabBar
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 }}>
      <VideoComparison
        workId={workId}
        onClose={handleClose}
      />
    </div>
  );
};

function App() {
  const handleUploadClick = () => {
    // 触发上传逻辑，可以通过 ref 或者状态管理来触发 VideoList 中的上传
    const uploadInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (uploadInput) {
      uploadInput.click();
    }
  };

  return (
    <AuthProvider>
      <Router>
        <div className="App">
          {/* 全局通知组件 */}
          <ToastContainer />
          {/* 顶部导航栏 */}
          <Header />
          {/* 主内容区域 */}
          <main className="main-content">
            <Routes>
              <Route path="/" element={<VideoList />} />
              <Route path="/video/:id" element={<VideoPlayer />} />
              <Route path="/user-video/:id" element={<UserVideoPlayer />} />
              <Route path="/result/:id" element={<VideoResult />} />
              <Route path="/comparison/:workId" element={<VideoComparisonPage />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </main>
          {/* 底部导航栏 */}
          <TabBar onUploadClick={handleUploadClick} />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App; 