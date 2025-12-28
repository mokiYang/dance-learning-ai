/**
 * 视频缩略图工具函数
 * 用于从视频Blob或视频元素中提取第一帧作为封面
 */

/**
 * 从视频Blob中提取第一帧作为封面图片
 * @param videoBlob 视频Blob对象
 * @returns Promise<string> 返回base64格式的图片URL
 */
export async function extractThumbnailFromBlob(videoBlob: Blob): Promise<string | null> {
  return new Promise((resolve, reject) => {
    try {
      // 创建视频URL
      const videoUrl = URL.createObjectURL(videoBlob);
      
      // 创建video元素
      const video = document.createElement('video');
      video.src = videoUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      
      // 当视频元数据加载完成时，提取第一帧
      video.addEventListener('loadedmetadata', () => {
        // 设置当前时间为0（第一帧）
        video.currentTime = 0.1; // 使用0.1秒避免某些浏览器无法获取第0帧
      });
      
      // 当视频可以显示第一帧时
      video.addEventListener('seeked', () => {
        try {
          // 创建canvas来绘制视频帧
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(videoUrl);
            reject(new Error('无法创建Canvas上下文'));
            return;
          }
          
          // 将视频帧绘制到canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // 将canvas转换为base64图片
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);
          
          // 清理资源
          URL.revokeObjectURL(videoUrl);
          
          resolve(thumbnailUrl);
        } catch (error) {
          URL.revokeObjectURL(videoUrl);
          reject(error);
        }
      });
      
      // 错误处理
      video.addEventListener('error', (e) => {
        URL.revokeObjectURL(videoUrl);
        reject(new Error('视频加载失败'));
      });
      
      // 如果视频已经加载完成，直接触发seeked事件
      if (video.readyState >= 2) {
        video.currentTime = 0.1;
      }
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 从视频元素中提取当前帧作为封面图片
 * @param videoElement 视频元素
 * @returns Promise<string> 返回base64格式的图片URL
 */
export async function extractThumbnailFromVideoElement(
  videoElement: HTMLVideoElement
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    try {
      // 创建canvas来绘制视频帧
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('无法创建Canvas上下文'));
        return;
      }
      
      // 将视频帧绘制到canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // 将canvas转换为base64图片
      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.85);
      
      resolve(thumbnailUrl);
    } catch (error) {
      reject(error);
    }
  });
}

