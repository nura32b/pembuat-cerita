
import React, { useState, useEffect } from 'react';

// FIX: Add 'warning' to ToastType to support warning-level notifications.
export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
const toastListeners = new Set<(toast: ToastMessage) => void>();

export const toast = (message: string, type: ToastType = 'info') => {
  toastId += 1;
  const newToast = { id: toastId, message, type };
  toastListeners.forEach(listener => listener(newToast));
};

const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const addToast = (newToast: ToastMessage) => {
      setToasts(currentToasts => [...currentToasts, newToast]);
      setTimeout(() => {
        setToasts(currentToasts => currentToasts.filter(t => t.id !== newToast.id));
      }, 5000);
    };

    toastListeners.add(addToast);
    return () => {
      toastListeners.delete(addToast);
    };
  }, []);

  // FIX: Add a background color for the 'warning' toast type.
  const getBgColor = (type: ToastType) => {
    switch (type) {
      case 'success': return 'bg-green-600';
      case 'error': return 'bg-red-600';
      case 'warning': return 'bg-yellow-600';
      default: return 'bg-blue-600';
    }
  };

  return (
    <div className="fixed top-5 right-5 z-50 space-y-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`${getBgColor(t.type)} text-white px-4 py-2 rounded-md shadow-lg animate-fade-in-out`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;