export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private stream: MediaStream | null = null;

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
      const supportedTypes = [
        'video/webm',
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/mp4',
        'video/ogg;codecs=theora'
      ];
      
      let selectedType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedType = type;
          console.log('使用录制格式:', selectedType);
          break;
        }
      }
      
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
      console.log('录制已开始');
    } catch (error) {
      console.error('启动录制失败:', error);
      throw error;
    }
  }

  // 新增方法：使用已存在的流进行录制
  public async startRecordingWithStream(stream: MediaStream): Promise<void> {
    try {
      // 确保清空之前的录制数据
      this.recordedChunks = [];
      this.stream = stream;
      
      // 检测支持的 MIME 类型
      const supportedTypes = [
        'video/webm',
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/mp4',
        'video/ogg;codecs=theora'
      ];
      
      let selectedType = '';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedType = type;
          console.log('使用录制格式:', selectedType);
          break;
        }
      }
      
      if (!selectedType) {
        throw new Error('浏览器不支持任何可用的录制格式');
      }
      
      // 创建 MediaRecorder - 使用独立的流副本
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: selectedType
      });

      this.mediaRecorder.ondataavailable = (event) => {
        console.log('录制数据可用，大小:', event.data.size);
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // 开始录制 - 每秒收集一次数据
      this.mediaRecorder.start(1000);
      console.log('录制已开始，使用独立流副本');
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
        console.log('录制停止，收集到的数据块数量:', this.recordedChunks.length);
        const blob = new Blob(this.recordedChunks, {
          type: 'video/webm'
        });
        console.log('最终录制文件大小:', blob.size);
        
        // 停止录制流中的所有轨道
        if (this.stream) {
          this.stream.getTracks().forEach(track => {
            track.stop();
          });
        }
        
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

  // 新增：暂停录制
  public pauseRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
      console.log('录制已暂停');
    }
  }

  // 新增：恢复录制
  public resumeRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
      console.log('录制已恢复');
    }
  }

  // 新增方法：清理资源
  public cleanup(): void {
    console.log('清理录制器，清空所有录制数据');
    
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    
    // 清空录制数据
    this.recordedChunks = [];
    this.mediaRecorder = null;
    this.stream = null;
    
    console.log('录制器清理完成');
  }
} 