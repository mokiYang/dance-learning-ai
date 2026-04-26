import React, { useEffect, useRef, useState } from 'react';
import { apiService } from '../../services/api';
import './index.less';

interface PoseFrame {
  frame_index: number;
  pose_data: number[][] | null; // [[x,y,z,visibility], ...] 13 个点
  timestamp: number;
}

interface PoseCanvasProps {
  /** 视频元素的 ref（用于监听播放时间、对齐尺寸） */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** 视频 ID */
  videoId: string;
  /** 视频 FPS（默认 30） */
  fps?: number;
  /** 是否启用（可外部切换骨骼显隐） */
  enabled?: boolean;
  /** 骨骼线颜色（CSS 色值），默认绿色 */
  color?: string;
  /** 线条宽度 */
  lineWidth?: number;
  /** 点的半径 */
  pointRadius?: number;
  /** 最低可见度阈值（低于则不绘制该点） */
  visibilityThreshold?: number;
  /** 是否开启相邻关键帧线性插值（默认 true，让骨骼移动更平滑） */
  interpolate?: boolean;
}

// 13 个关键点对应后端 selected_landmarks 顺序
// 0=鼻 1=左肩 2=右肩 3=左肘 4=右肘 5=左腕 6=右腕
// 7=左髋 8=右髋 9=左膝 10=右膝 11=左踝 12=右踝
const POSE_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [0, 2], [1, 2],        // 头-肩
  [1, 3], [3, 5],                // 左臂
  [2, 4], [4, 6],                // 右臂
  [1, 7], [2, 8], [7, 8],        // 躯干
  [7, 9], [9, 11],               // 左腿
  [8, 10], [10, 12],             // 右腿
];

const PoseCanvas: React.FC<PoseCanvasProps> = ({
  videoRef,
  videoId,
  fps = 30,
  enabled = true,
  color = '#00ff00',
  lineWidth = 2,
  pointRadius = 3,
  visibilityThreshold = 0.3,
  interpolate = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<PoseFrame[]>([]);
  const frameIndicesRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // 拉取骨骼数据
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiService.getPoseData(videoId);
        if (cancelled) return;

        if (res && res.success && Array.isArray(res.pose_data)) {
          const frames: PoseFrame[] = res.pose_data;
          framesRef.current = frames;
          frameIndicesRef.current = frames.map(f => f.frame_index);
          setLoaded(true);
        }
      } catch (err) {
        console.warn('[PoseCanvas] 加载骨骼数据失败:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // 绘制循环
  useEffect(() => {
    if (!enabled || !loaded) {
      // 清空画布
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 在数据帧中二分查找 <= targetFrameIdx 的最大索引，返回该位置
    const findPrevIndex = (targetFrameIdx: number): number => {
      const indices = frameIndicesRef.current;
      if (!indices.length) return -1;

      let lo = 0;
      let hi = indices.length - 1;
      let best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (indices[mid] <= targetFrameIdx) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return best;
    };

    /**
     * 获取当前要绘制的关键点数组（含插值）。
     * 返回 13 个点的 [x, y, visibility]（归一化坐标），或 null。
     */
    const getInterpolatedKeypoints = (currentFrameIdx: number): Array<[number, number, number] | null> | null => {
      const frames = framesRef.current;
      const indices = frameIndicesRef.current;
      if (!frames.length) return null;

      const prevIdx = findPrevIndex(currentFrameIdx);
      if (prevIdx < 0) {
        // 视频开头，还没到第一个关键帧，用第一帧
        const f = frames[0];
        if (!f.pose_data) return null;
        return f.pose_data.map(kp => [kp[0], kp[1], kp[3] ?? 1] as [number, number, number]);
      }

      const prevFrame = frames[prevIdx];
      const nextFrame = prevIdx + 1 < frames.length ? frames[prevIdx + 1] : null;

      // 不插值 or 没有下一帧 or 前后帧有空数据 → 直接返回前一帧
      if (
        !interpolate ||
        !nextFrame ||
        !prevFrame.pose_data ||
        !nextFrame.pose_data ||
        indices[prevIdx] === currentFrameIdx
      ) {
        const data = prevFrame.pose_data;
        if (!data) return null;
        return data.map(kp => [kp[0], kp[1], kp[3] ?? 1] as [number, number, number]);
      }

      // 在 prevFrame 和 nextFrame 之间做线性插值
      const a = indices[prevIdx];
      const b = indices[prevIdx + 1];
      const t = b > a ? (currentFrameIdx - a) / (b - a) : 0;
      const tClamped = Math.max(0, Math.min(1, t));

      const prevKps = prevFrame.pose_data;
      const nextKps = nextFrame.pose_data;
      const len = Math.min(prevKps.length, nextKps.length);
      const result: Array<[number, number, number] | null> = [];
      for (let i = 0; i < len; i++) {
        const p = prevKps[i];
        const q = nextKps[i];
        const visP = p[3] ?? 1;
        const visQ = q[3] ?? 1;
        // 插值后的可见度取两帧的最小值（任一帧不可见则平滑过渡隐去）
        const vis = Math.min(visP, visQ);
        if (vis < visibilityThreshold) {
          result.push(null);
          continue;
        }
        const x = p[0] + (q[0] - p[0]) * tClamped;
        const y = p[1] + (q[1] - p[1]) * tClamped;
        result.push([x, y, vis]);
      }
      return result;
    };

    const drawFrame = () => {
      // 根据视频显示区域（object-fit: contain）计算实际绘制区域
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;

      // 保证 canvas 的像素尺寸与 CSS 尺寸一致（处理高 DPI）
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      if (!vw || !vh || video.paused && video.currentTime === 0) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      // 计算视频在容器内的实际显示矩形（object-fit: contain）
      const videoAspect = vw / vh;
      const canvasAspect = cw / ch;
      let renderW = cw;
      let renderH = ch;
      let offsetX = 0;
      let offsetY = 0;
      if (videoAspect > canvasAspect) {
        // 视频更宽，左右撑满、上下留黑边
        renderW = cw;
        renderH = cw / videoAspect;
        offsetY = (ch - renderH) / 2;
      } else {
        // 视频更高，上下撑满、左右留黑边
        renderH = ch;
        renderW = ch * videoAspect;
        offsetX = (cw - renderW) / 2;
      }

      // 当前播放时间 → 帧索引
      const currentFrameIdx = Math.floor(video.currentTime * fps);
      const kps = getInterpolatedKeypoints(currentFrameIdx);

      if (kps) {
        const pts = kps.map(kp => {
          if (!kp) return null;
          return {
            x: offsetX + kp[0] * renderW,
            y: offsetY + kp[1] * renderH,
          };
        });

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lineWidth;

        // 画连线
        ctx.beginPath();
        for (const [a, b] of POSE_CONNECTIONS) {
          const pa = pts[a];
          const pb = pts[b];
          if (pa && pb) {
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
          }
        }
        ctx.stroke();

        // 画点
        for (const p of pts) {
          if (p) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, loaded, videoRef, fps, color, lineWidth, pointRadius, visibilityThreshold, interpolate]);

  return <canvas ref={canvasRef} className="pose-canvas-overlay" />;
};

export default PoseCanvas;
