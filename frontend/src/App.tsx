import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import VideoList from './components/VideoList';
import VideoPlayer from './components/VideoPlayer';
import VideoResult from './components/VideoResult';
import Profile from './components/Profile';
import Header from './components/Header';
import TabBar from './components/TabBar';
import './App.less';

function App() {
  const handleUploadClick = () => {
    console.log('上传点击!!!!!');
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
          {/* 顶部导航栏 */}
          <Header />
          {/* 主内容区域 */}
          <main className="main-content">
            <Routes>
              <Route path="/" element={<VideoList />} />
              <Route path="/video/:id" element={<VideoPlayer />} />
              <Route path="/result/:id" element={<VideoResult />} />
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