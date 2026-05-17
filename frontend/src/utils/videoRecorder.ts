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

  // 候选录制格式，按优先级从高到低
  // 注意：iOS Safari 的 MediaRecorder.isTypeSupported('video/webm') 会"假支持"
  // （返回 true 但实际仍输出 mp4），因此必须把 mp4 系列放在 webm 前面，
  // 才能让 iOS 命中 mp4 分支并得到真实的 mp4 容器
  private static readonly SUPPORTED_TYPES: readonly string[] = [
    'video/mp4;codecs=h264',  // 桌面 Chrome/Edge 部分版本 + 桌面 Safari
    'video/mp4',               // iOS Safari
    'video/webm;codecs=vp9',   // Chrome/Firefox 首选，质量最好
    'video/webm;codecs=vp8',   // 老 Chrome
    'video/webm',              // 兜底
  ];

  // 选出当前浏览器支持的最高优先级 MIME 类型；找不到时抛错
  private static pickSupportedMimeType(): string {
    for (const type of VideoRecorder.SUPPORTED_TYPES) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`[视频录制] 选择格式: ${type}`);
        return type;
      }
    }
    throw new Error('浏览器不支持任何可用的录制格式');
  }

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
      this.selectedMimeType = VideoRecorder.pickSupportedMimeType();

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.selectedMimeType
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

      this.selectedMimeType = VideoRecorder.pickSupportedMimeType();

      // 使用 Canvas 流创建 MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.canvasStream, {
        mimeType: this.selectedMimeType,
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
      this.selectedMimeType = VideoRecorder.pickSupportedMimeType();

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: this.selectedMimeType
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
        
        // 优先使用 MediaRecorder 实例真正在用的 mimeType（比 isTypeSupported 更可靠，
        // 因为 iOS Safari 的 isTypeSupported 对 webm 会"假支持"）
        const actualMime = (this.mediaRecorder && (this.mediaRecorder as MediaRecorder).mimeType) || this.selectedMimeType;
        // 同步回写，使后续 getFileExtension 也基于真实值
        if (actualMime) {
          this.selectedMimeType = actualMime;
        }
        const lower = actualMime.toLowerCase();
        const blobType = lower.includes('mp4')
          ? 'video/mp4'
          : lower.includes('webm')
          ? 'video/webm'
          : lower.includes('ogg')
          ? 'video/ogg'
          : 'video/webm';

        const blob = new Blob(this.recordedChunks, {
          type: blobType
        });
        
        console.log(`[视频录制] 创建 Blob，实际 mimeType: ${actualMime}，归一化类型: ${blobType}，大小: ${blob.size} 字节`);
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

  // 获取与实际录制格式相匹配的文件扩展名（不含点）
  public getFileExtension(): string {
    if (this.selectedMimeType.includes('mp4')) return 'mp4';
    if (this.selectedMimeType.includes('webm')) return 'webm';
    if (this.selectedMimeType.includes('ogg')) return 'ogv';
    return 'webm';
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