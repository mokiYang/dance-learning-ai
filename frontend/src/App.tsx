import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import VideoList from './components/VideoList';
import VideoPlayer from './components/VideoPlayer';
import VideoResult from './components/VideoResult';
import './App.less';

function App() {
  return (
    <Router>
      <div className="App">
        <main className="container">
          <Routes>
            <Route path="/" element={<VideoList />} />
            <Route path="/video/:id" element={<VideoPlayer />} />
            <Route path="/result/:id" element={<VideoResult />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App; 