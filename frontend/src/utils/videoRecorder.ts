export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  // Canvas 录制相关
  private canvas: HTMLCanvasElement | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;
  private canvasStream: MediaStream | null = null;
  private sourceVideoElement: HTMLVideoElement | null = null;
  private animationFrameId: number | null = null;
  // 保存选择的 MIME 类型，用于创建 Blob
  private selectedMimeType: string = 'video/webm';

  public async startRecording(): Promise<void> {
    try {
      // 如果没有现有流，则获取新的流
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: 'user'
          },
          audio: false
        });
      }

      this.recordedChunks = [];
      
      // 检测支持的 MIME 类型
      // 优先尝试 mp4（如果浏览器支持），否则使用 webm
      const supportedTypes = [
        'video/mp4;codecs=h264',  // 优先尝试 H.264 编码的 MP4
        'video/mp4',               // 通用 MP4
        'video/webm;codecs=vp9',   // VP9 编码的 WebM（质量更好）
        'video/webm;codecs=vp8',   // VP8 编码的 WebM
        'video/webm',              // 通用 WebM
        'video/ogg;codecs=theora'  // Ogg Theora（备用）
      ];
      
      let selectedType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedType = type;
          console.log(`[视频录制] 选择格式: ${type}`);
          break;
        }
      }
      
      // 保存选择的格式，用于后续创建 Blob
      this.selectedMimeType = selectedType;
      
      if (!selectedType) {
        throw new Error('浏览器不支持任何可用的录制格式');
      }
      
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: selectedType
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
    } catch (error) {
      console.error('启动录制失败:', error);
      throw error;
    }
  }

  // 使用 Canvas 从 video 元素捕获并录制
  public async startRecordingFromVideoElement(videoElement: HTMLVideoElement): Promise<void> {
    try {
      this.recordedChunks = [];
      this.sourceVideoElement = videoElement;
      
      // 创建离屏 Canvas，使用视频元素的实际尺寸
      this.canvas = document.createElement('canvas');
      
      // 使用视频的实际播放尺寸（videoWidth/videoHeight）
      // 如果视频还没加载完成，等待加载
      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        await new Promise<void>((resolve) => {
          const checkSize = () => {
            if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
              resolve();
            } else {
              setTimeout(checkSize, 100);
            }
          };
          checkSize();
        });
      }
      
      // 设置 Canvas 尺寸为视频的实际尺寸
      this.canvas.width = videoElement.videoWidth;
      this.canvas.height = videoElement.videoHeight;
      
      console.log(`录制 Canvas 尺寸: ${this.canvas.width}x${this.canvas.height}`);
      
      this.canvasContext = this.canvas.getContext('2d');
      
      if (!this.canvasContext) {
        throw new Error('无法创建 Canvas 上下文');
      }
      
      // 开始绘制循环
      const drawFrame = () => {
        if (!this.canvas || !this.canvasContext || !this.sourceVideoElement) {
          return;
        }
        
        // 从 video 元素绘制当前帧到 canvas（保持原始尺寸，不裁切）
        this.canvasContext.drawImage(
          this.sourceVideoElement,
          0, 0,
          this.canvas.width,
          this.canvas.height
        );
        
        // 继续下一帧
        this.animationFrameId = requestAnimationFrame(drawFrame);
      };
      
      // 开始绘制
      drawFrame();
      
      // 从 Canvas 捕获流
      this.canvasStream = this.canvas.captureStream(30); // 30fps
      
      // 检测支持的 MIME 类型
      // 优先尝试 mp4（如果浏览器支持），否则使用 webm
      const supportedTypes = [
        'video/mp4;codecs=h264',  // 优先尝试 H.264 编码的 MP4
        'video/mp4',               // 通用 MP4
        'video/webm;codecs=vp9',   // VP9 编码的 WebM（质量更好）
        'video/webm;codecs=vp8',   // VP8 编码的 WebM
        'video/webm'               // 通用 WebM
      ];
      
      let selectedType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedType = type;
          console.log(`[视频录制] 选择格式: ${type}`);
          break;
        }
      }
      
      if (!selectedType) {
        throw new Error('浏览器不支持任何可用的录制格式');
      }
      
      // 保存选择的格式
      this.selectedMimeType = selectedType;
      
      // 使用 Canvas 流创建 MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.canvasStream, {
        mimeType: selectedType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // 开始录制
      this.mediaRecorder.start(1000);
    } catch (error) {
      console.error('启动 Canvas 录制失败:', error);
      throw error;
    }
  }

  // 使用已存在的流进行录制
  public async startRecordingWithStream(stream: MediaStream): Promise<void> {
    try {
      this.recordedChunks = [];
      this.stream = stream;
      
      // 检测支持的 MIME 类型
      // 优先尝试 mp4（如果浏览器支持），否则使用 webm
      const supportedTypes = [
        'video/mp4;codecs=h264',  // 优先尝试 H.264 编码的 MP4
        'video/mp4',               // 通用 MP4
        'video/webm;codecs=vp9',   // VP9 编码的 WebM（质量更好）
        'video/webm;codecs=vp8',   // VP8 编码的 WebM
        'video/webm'               // 通用 WebM
      ];
      
      let selectedType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedType = type;
          console.log(`[视频录制] 选择格式: ${type}`);
          break;
        }
      }
      
      if (!selectedType) {
        throw new Error('浏览器不支持任何可用的录制格式');
      }
      
      // 保存选择的格式
      this.selectedMimeType = selectedType;
      
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: selectedType
      });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000);
    } catch (error) {
      console.error('启动录制失败:', error);
      throw error;
    }
  }

  public stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('录制器未初始化'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        // 停止 Canvas 绘制循环
        if (this.animationFrameId !== null) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
        }
        
        // 停止 Canvas 流的轨道
        if (this.canvasStream) {
          this.canvasStream.getTracks().forEach(track => track.stop());
          this.canvasStream = null;
        }
        
        // 使用实际选择的 MIME 类型创建 Blob
        // 如果 selectedMimeType 包含 codecs，提取基础类型
        const blobType = this.selectedMimeType.includes('mp4') 
          ? 'video/mp4' 
          : this.selectedMimeType.includes('webm')
          ? 'video/webm'
          : 'video/webm'; // 默认使用 webm
        
        const blob = new Blob(this.recordedChunks, {
          type: blobType
        });
        
        console.log(`[视频录制] 创建 Blob，类型: ${blobType}，大小: ${blob.size} 字节`);
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  public getStream(): MediaStream | null {
    return this.stream;
  }

  public isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  // 暂停录制
  public pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  // 恢复录制
  public resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  // 清理资源
  public cleanup(): void {
    // 停止绘制循环
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // 停止 MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    // 停止 Canvas 流
    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach(track => track.stop());
      this.canvasStream = null;
    }
    
    // 清空录制数据
    this.recordedChunks = [];
    this.mediaRecorder = null;
    this.stream = null;
    this.canvas = null;
    this.canvasContext = null;
    this.sourceVideoElement = null;
  }
} 