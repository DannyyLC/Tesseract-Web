import { AnimatePresence, PanInfo, motion, useMotionValue, useTransform } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { NotificationEventDto } from '@tesseract/types';
import { toIntlLocale } from '@/lib/intl-locale';

type T = (key: string, params?: Record<string, string | number>) => string;

const formatTimeAgo = (date: Date | string, t: T, intlLocale: string) => {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) return t('justNow');

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return t('minutesAgo', { count: diffInMinutes });

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return t('hoursAgo', { count: diffInHours });

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return t('daysAgo', { count: diffInDays });

  return past.toLocaleDateString(intlLocale, { day: 'numeric', month: 'short' });
};

interface NotificationItemProps {
  notification: NotificationEventDto;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function NotificationItem({
  notification,
  onRead,
  onDelete,
  isExpanded,
  onToggle,
}: NotificationItemProps) {
  const t = useTranslations('Notifications.Item');
  const intlLocale = toIntlLocale(useLocale());
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
    <div className="relative overflow-hidden border-b border-border last:border-0">
      {/* Background Actions Layer */}
      <motion.div
        style={{ opacity: bgOpacity }}
        className="absolute inset-0 flex items-center justify-between bg-danger px-6"
      >
        <Trash2 className="text-text-inverse" size={20} />
        <Trash2 className="text-text-inverse" size={20} />
      </motion.div>

      {/* Foreground Content Layer */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={(e, info: PanInfo) => {
          if (Math.abs(info.offset.x) > 250) {
            onDelete(notification.id);
          }
        }}
        className={`relative z-10 cursor-pointer px-4 py-4 transition-colors ${
          !notification.isRead ? 'bg-surface-secondary' : 'bg-surface'
        }`}
      >
        <div className="flex items-start gap-3" onClick={handleClick}>
          {/* Unread Indicator */}
          {!notification.isRead && (
            <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-info shadow-sm" />
          )}

          <div className={`flex-1 ${!notification.isRead ? '' : 'ml-5'}`}>
            <div className="flex items-start justify-between gap-2">
              <p
                className={`text-sm font-medium ${
                  !notification.isRead ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {notification.title}
              </p>
              <span className="whitespace-nowrap text-[10px] text-text-tertiary">
                {formatTimeAgo(notification.createdAt, t, intlLocale)}
              </span>
            </div>

            <p
              className={`mt-0.5 text-sm ${
                !notification.isRead ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {displayDescription}
            </p>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onDelete(notification.id);
                      }}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-50"
                    >
                      <Trash2 size={12} />
                      {t('delete')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
