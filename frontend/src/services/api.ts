/**
 * API 配置和服务
 * 统一管理所有 API 相关的 URL 配置和请求方法
 * 生产环境使用相对路径，通过 nginx 代理；开发环境使用 localhost
 */

// ==================== 配置部分 ====================

// 判断是否为开发环境
const isDev = import.meta.env.DEV;

// 服务器基础 URL
export const SERVER_BASE_URL = isDev ? 'http://localhost:8128' : '';

// API 基础 URL
export const API_BASE_URL = isDev ? 'http://localhost:8128/api' : '/api';

// Token 存储键名
export const TOKEN_KEY = 'dance_auth_token';

// 用户信息存储键名
export const USER_KEY = 'dance_current_user';

// 获取服务器基础 URL（供其他组件使用）
export const getServerBaseUrl = () => SERVER_BASE_URL;

// 获取视频 URL
export const getVideoUrl = (videoId: string) => `${SERVER_BASE_URL}/video/${videoId}`;

// 获取视频缩略图 URL
export const getThumbnailUrl = (videoId: string) => `${SERVER_BASE_URL}/thumbnail/${videoId}`;

// 获取骨骼视频 URL
export const getPoseVideoUrl = (workId: string, videoType: 'reference' | 'user') => 
  `${SERVER_BASE_URL}/api/pose-video/${workId}/${videoType}`;

// 获取Token
const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

// ==================== 类型定义 ====================

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
  task_id?: string;  // 后台任务ID（用于轮询状态）
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
  thumbnail_path?: string;
  has_pose_data?: boolean;
  has_pose_video?: boolean;
}

export interface UploadResult {
  success: boolean;
  video_id?: string;
  task_id?: string;  // 异步任务ID
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
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> || {}),
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // 创建新的请求
    const requestPromise = fetch(url, {
      ...options,
      headers,
    }).then(response => response.json());
    
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

  // 获取用户视频状态（检查骨骼数据提取是否完成）
  async getUserVideoStatus(videoId: string): Promise<{
    success: boolean;
    pose_data_extracted: boolean;
    pose_extraction_error?: string;
    pose_extraction_progress?: number;
  }> {
    return this.makeRequest(`${this.baseUrl}/user-video-status/${videoId}`);
  }

  // 轮询用户视频状态直到骨骼数据提取完成（无超时限制，由后端控制处理完成）
  async pollUserVideoStatus(
    videoId: string,
    onProgress?: (progress: number, extracted: boolean) => void,
    interval: number = 2000
  ): Promise<{ success: boolean; error?: string }> {
    while (true) {
      try {
        const result = await this.getUserVideoStatus(videoId);
        
        console.log('轮询状态:', result);
        
        if (!result.success) {
          return { success: false, error: '获取视频状态失败' };
        }
        
        // 调用进度回调
        if (onProgress) {
          onProgress(result.pose_extraction_progress || 0, result.pose_data_extracted);
        }
        
        // 骨骼数据提取完成（无论成功或失败）
        if (result.pose_data_extracted) {
          console.log('检测到提取完成，error:', result.pose_extraction_error);
          if (result.pose_extraction_error) {
            return { success: false, error: result.pose_extraction_error };
          }
          return { success: true };
        }
        
        // 等待一段时间后继续轮询
        await new Promise(resolve => setTimeout(resolve, interval));
        
      } catch (error) {
        console.error('轮询用户视频状态出错:', error);
        return { success: false, error: '网络错误，请重试' };
      }
    }
  }


  // 获取逐帧对比数据
  async getFrameComparison(workId: string): Promise<FrameComparisonResult> {
    return this.makeRequest(`${this.baseUrl}/frame-comparison/${workId}`);
  }

  // 获取标记骨骼的视频文件
  async getPoseVideo(workId: string, videoType: 'reference' | 'user'): Promise<Blob> {
    const response = await fetch(`${SERVER_BASE_URL}/api/pose-video/${workId}/${videoType}`);
    if (!response.ok) {
      throw new Error(`获取视频失败: ${response.statusText}`);
    }
    return response.blob();
  }

  // 获取标记骨骼的视频URL（用于直接播放）
  getPoseVideoUrl(workId: string, videoType: 'reference' | 'user'): string {
    return `${SERVER_BASE_URL}/api/pose-video/${workId}/${videoType}`;
  }

  // 获取任务状态
  async getTaskStatus(taskId: string): Promise<{
    success: boolean;
    task: {
      task_id: string;
      video_id: string;
      video_type: string;
      task_type: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress: number;
      error_message?: string;
      pose_data_extracted?: boolean;
      pose_video_generated?: boolean;
      pose_frames?: number;
      created_at: string;
      started_at?: string;
      completed_at?: string;
    };
  }> {
    return this.makeRequest(`${this.baseUrl}/task-status/${taskId}`);
  }

  // 轮询任务状态直到完成
  async pollTaskStatus(
    taskId: string, 
    onProgress?: (progress: number, status: string) => void,
    interval: number = 1000,
    maxAttempts: number = 300
  ): Promise<any> {
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const result = await this.getTaskStatus(taskId);
        
        if (!result.success) {
          throw new Error('获取任务状态失败');
        }
        
        const { task } = result;
        
        // 调用进度回调
        if (onProgress) {
          onProgress(task.progress, task.status);
        }
        
        // 任务完成
        if (task.status === 'completed') {
          return task;
        }
        
        // 任务失败
        if (task.status === 'failed') {
          throw new Error(task.error_message || '任务处理失败');
        }
        
        // 等待一段时间后继续轮询
        await new Promise(resolve => setTimeout(resolve, interval));
        
      } catch (error) {
        console.error('轮询任务状态出错:', error);
        throw error;
      }
    }
    
    throw new Error('任务处理超时');
  }

  // ==================== 认证相关 API ====================

  // 用户登录
  async login(username: string, password: string): Promise<{
    success: boolean;
    token?: string;
    user?: any;
    error?: string;
  }> {
    return this.makeRequest(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
  }

  // 用户注册
  async register(username: string, password: string, email?: string): Promise<{
    success: boolean;
    token?: string;
    user?: any;
    error?: string;
  }> {
    return this.makeRequest(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password, email }),
    });
  }

  // 用户登出
  async logout(): Promise<{ success: boolean }> {
    return this.makeRequest(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
    });
  }
}

// 创建API服务实例
export const apiService = new ApiService();

// 导出默认实例
export default apiService;
