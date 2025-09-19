// API服务配置
const API_BASE_URL = 'http://localhost:8128/api';

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

  // 通用请求方法，支持去重
  private async makeRequest<T>(url: string, options?: RequestInit): Promise<T> {
    const requestKey = `${options?.method || 'GET'}:${url}`;
    
    // 如果已经有相同的请求在进行中，返回该请求的Promise
    if (this.pendingRequests.has(requestKey)) {
      return this.pendingRequests.get(requestKey)!;
    }

    // 创建新的请求
    const requestPromise = fetch(url, options).then(response => response.json());
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
    const response = await fetch(`http://localhost:8128/api/pose-video/${workId}/${videoType}`);
    if (!response.ok) {
      throw new Error(`获取视频失败: ${response.statusText}`);
    }
    return response.blob();
  }

  // 获取标记骨骼的视频URL（用于直接播放）
  getPoseVideoUrl(workId: string, videoType: 'reference' | 'user'): string {
    return `http://localhost:8128/api/pose-video/${workId}/${videoType}`;
  }
}

// 创建API服务实例
export const apiService = new ApiService();

// 导出默认实例
export default apiService;
