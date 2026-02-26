import { useState } from 'react';
import { PanInfo, motion, useMotionValue, useTransform } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { NotificationEventDto } from '@/app/_model/notifications.dto';

const formatTimeAgo = (date: Date | string) => {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return 'hace unos segundos';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `hace ${diffInMinutes} min`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `hace ${diffInHours} h`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `hace ${diffInDays} d`;
  
  return past.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

interface NotificationItemProps {
  notification: NotificationEventDto;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function NotificationItem({ notification, onRead, onDelete, isExpanded, onToggle }: NotificationItemProps) {
  const x = useMotionValue(0);
  const bgOpacity = useTransform(x, [-5, 0, 5], [1, 0, 1]);

  
  const handleClick = () => {
    onToggle();
    if (!isExpanded && !notification.isRead) {
      onRead(notification.id);
    }
  };

  const MAX_LENGTH = 50;
  const description = notification.desc;
  const shouldTruncate = description.length > MAX_LENGTH && !isExpanded;
  const displayDescription = shouldTruncate 
      ? `${description.slice(0, MAX_LENGTH)}...` 
      : description;

  return (
    <div className="relative overflow-hidden border-b border-black/5 last:border-0 dark:border-white/5">
        {/* Background Actions Layer */}
        <motion.div 
            style={{ opacity: bgOpacity }}
            className="absolute inset-0 flex items-center justify-between bg-red-500 px-6"
        >
            <Trash2 className="text-white" size={20} />
            <Trash2 className="text-white" size={20} />
        </motion.div>

        {/* Foreground Content Layer */}
        <motion.div
            layout
            style={{ x }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={(e, info: PanInfo) => {
                if (Math.abs(info.offset.x) > 250) {
                    onDelete(notification.id);
                }
            }}
            transition={{ layout: { duration: 0.2, type: "spring", stiffness: 300, damping: 30 } }}
            className={`relative z-10 cursor-pointer px-4 py-4 transition-colors ${
                !notification.isRead 
                    ? 'bg-[#F9FAFB] dark:bg-[#1A1A1A]' 
                    : 'bg-white dark:bg-[#141414]'
            }`}
        >
            <div 
                className="flex items-start gap-3"
                onClick={handleClick}
            >
                {/* Unread Indicator */}
                {!notification.isRead && (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                )}
                
                <div className={`flex-1 ${!notification.isRead ? '' : 'ml-5'}`}>
                    <div className="flex items-start justify-between gap-2">
                         <p className={`text-sm font-medium ${
                            !notification.isRead 
                                ? 'text-black dark:text-white' 
                                : 'text-black/60 dark:text-white/60'
                         }`}>
                            {notification.title}
                        </p>
                        <span className="whitespace-nowrap text-[10px] text-black/40 dark:text-white/40">
                             {formatTimeAgo(notification.createdAt)}
                        </span>
                    </div>

                    <p className={`mt-0.5 text-sm ${
                        !notification.isRead 
                            ? 'text-black/90 dark:text-white/90' 
                            : 'text-black/50 dark:text-white/50'
                    }`}>
                        {displayDescription}
                    </p>


                    {isExpanded && (
                        <div className="mt-3 flex justify-end">
                             <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(notification.id);
                                }}
                                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                             >
                                <Trash2 size={12} />
                                Eliminar
                             </button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    </div>
  );
}
