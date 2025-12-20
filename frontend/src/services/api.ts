// API服务配置
// 生产环境使用相对路径，通过 nginx 代理；开发环境使用 localhost
const API_BASE_URL = import.meta.env.DEV ? 'http://localhost:8128/api' : '/api';
const SERVER_BASE_URL = import.meta.env.DEV ? 'http://localhost:8128' : '';

// 导出获取服务器基础URL的函数（供其他组件使用）
export const getServerBaseUrl = () => SERVER_BASE_URL;
export const getVideoUrl = (videoId: string) => `${SERVER_BASE_URL}/video/${videoId}`;

// Token存储键名
const TOKEN_KEY = 'dance_auth_token';

// 获取Token
const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

// 接口类型定义
export interface VideoInfo {
  filename: string;
  duration: number;
  fps: number;
  pose_frames: number;
}

export interface PoseDifference {
  frame_idx: number;
  reference_frame: number;
  difference: number;
  timestamp: number;
}

export interface ComparisonResult {
  success: boolean;
  work_id: string;
  video_info: {
    reference: VideoInfo;
    user: VideoInfo;
  };
  comparison: {
    threshold: number;
    total_differences: number;
    differences: PoseDifference[];
  };
  pose_videos?: {
    reference: string;
    user: string;
  };
  report_path: string;
}

export interface FrameComparison {
  frame_index: number;
  reference_frame: number;
  user_frame: number;
  timestamp: number;
  difference: number;
  has_difference: boolean;
  has_pose_data: boolean;
  pose_quality_issue: boolean;
}

export interface FrameComparisonResult {
  success: boolean;
  work_id: string;
  video_info: {
    reference: VideoInfo;
    user: VideoInfo;
  };
  frame_comparisons: FrameComparison[];
  threshold: number;
}

export interface UserVideoUpload {
  success: boolean;
  user_video_id: string;
  filename: string;
  filepath: string;
  duration: number;
  fps: number;
  pose_data_extracted: boolean;
  message?: string;
}

export interface ReferenceVideo {
  id: number;
  video_id: string;
  filename: string;
  file_path: string;
  duration: number;
  fps: number;
  upload_time: string;
  pose_data_path?: string;
  pose_data_extracted: boolean;
  pose_extraction_time?: string;
  pose_video_path?: string;
  pose_video_generated: boolean;
  pose_video_generation_time?: string;
  description?: string;
  tags?: string;
  author?: string;
  title?: string;
  has_pose_data?: boolean;
  has_pose_video?: boolean;
}

export interface UploadResult {
  success: boolean;
  filename: string;
  filepath: string;
  duration: number;
  fps: number;
  description?: string;
  tags?: string;
  author?: string;
  title?: string;
  pose_data_extracted?: boolean;
  pose_video_generated?: boolean;
  pose_frames?: number;
  message?: string;
  warning?: string;
}


// API服务类
class ApiService {
  private baseUrl: string;
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // 通用请求方法，支持去重和自动添加Token
  private async makeRequest<T>(url: string, options?: RequestInit): Promise<T> {
    const requestKey = `${options?.method || 'GET'}:${url}`;
    
    // 如果已经有相同的请求在进行中，返回该请求的Promise
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    // 添加Token到请求头
    const token = getAuthToken();
    const headers: HeadersInit = {
      ...options?.headers,
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 创建新的请求
    const requestPromise = fetch(url, {
      ...options,
      headers,
    }).then(async response => {
      // 处理401未授权错误
      if (response.status === 401) {
        // Token过期或无效，清除本地存储
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('dance_current_user');
        
        // 如果不在登录页，跳转到个人页（登录页）
        if (window.location.pathname !== '/profile') {
          window.location.href = '/profile';
        }
        
        throw new Error('未登录或登录已过期，请重新登录');
      }
      
      return response.json();
    });
    
    this.pendingRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // 请求完成后从pendingRequests中移除
      this.pendingRequests.delete(requestKey);
    }
  }


  // 上传参考视频
  async uploadReferenceVideo(
    videoFile: File, 
    description?: string, 
    author?: string,
    title?: string
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('video', videoFile);
    
    if (description) {
      formData.append('description', description);
    }
    
    if (author) {
      formData.append('author', author);
    }
    
    if (title) {
      formData.append('title', title);
    }

    return this.makeRequest(`${this.baseUrl}/upload-reference`, {
      method: 'POST',
      body: formData,
    });
  }

  // 获取参考视频列表
  async getReferenceVideos(): Promise<{ success: boolean; videos: ReferenceVideo[] }> {
    return this.makeRequest(`${this.baseUrl}/reference-videos`);
  }

  // 上传用户视频并提取骨骼数据
  async uploadUserVideo(
    userVideo: File,
    referenceVideoId: string
  ): Promise<UserVideoUpload> {
    const formData = new FormData();
    formData.append('user_video', userVideo);
    formData.append('reference_video_id', referenceVideoId);

    return this.makeRequest(`${this.baseUrl}/upload-user-video`, {
      method: 'POST',
      body: formData,
    });
  }


  // 使用已上传的用户视频进行比较
  async compareWithUploadedVideo(
    userVideoId: string,
    referenceVideoId: string,
    threshold: number = 0.3
  ): Promise<ComparisonResult> {
    const formData = new FormData();
    formData.append('user_video_id', userVideoId);
    formData.append('reference_video_id', referenceVideoId);
    formData.append('threshold', threshold.toString());

    return this.makeRequest(`${this.baseUrl}/compare-uploaded-videos`, {
      method: 'POST',
      body: formData,
    });
  }

  // 删除用户视频和骨骼数据
  async deleteUserVideo(userVideoId: string): Promise<{ success: boolean; message: string }> {
    return this.makeRequest(`${this.baseUrl}/delete-user-video/${userVideoId}`, {
      method: 'DELETE',
    });
  }


  // 获取逐帧对比数据
  async getFrameComparison(workId: string): Promise<FrameComparisonResult> {
    return this.makeRequest(`${this.baseUrl}/frame-comparison/${workId}`);
  }

  // 获取标记骨骼的视频文件
  async getPoseVideo(workId: string, videoType: 'reference' | 'user'): Promise<Blob> {
    const baseUrl = import.meta.env.DEV ? 'http://localhost:8128' : '';
    const response = await fetch(`${baseUrl}/api/pose-video/${workId}/${videoType}`);
    if (!response.ok) {
      throw new Error(`获取视频失败: ${response.statusText}`);
    }
    return response.blob();
  }

  // 获取标记骨骼的视频URL（用于直接播放）
  getPoseVideoUrl(workId: string, videoType: 'reference' | 'user'): string {
    const baseUrl = import.meta.env.DEV ? 'http://localhost:8128' : '';
    return `${baseUrl}/api/pose-video/${workId}/${videoType}`;
  }
}

// 创建API服务实例
export const apiService = new ApiService();

// 导出默认实例
export default apiService;
