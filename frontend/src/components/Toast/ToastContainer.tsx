import React, { useState, useEffect } from "react";
import Toast from "./index";

interface ToastItem {
  id: string;
  message: string;
  type?: "success" | "error" | "info";
  duration?: number;
}

let toastList: ToastItem[] = [];
let listeners: Array<(toasts: ToastItem[]) => void> = [];

// 全局显示 Toast 的方法
export const showToast = (
  message: string,
  type: "success" | "error" | "info" = "success",
  duration: number = 3000
) => {
  const id = `toast-${Date.now()}-${Math.random()}`;
  const newToast: ToastItem = { id, message, type, duration };
  
  toastList = [...toastList, newToast];
  listeners.forEach((listener) => listener(toastList));
  
  return id;
};

// 移除 Toast
export const removeToast = (id: string) => {
  toastList = toastList.filter((toast) => toast.id !== id);
  listeners.forEach((listener) => listener(toastList));
};

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (newToasts: ToastItem[]) => {
      setToasts([...newToasts]);
    };

    listeners.push(listener);

    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
