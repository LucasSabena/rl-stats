import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotificationType = "success" | "info" | "warning" | "achievement";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  /** Router path to open when the notification is clicked. */
  href?: string;
  createdAt: number;
  read: boolean;
}

interface NotificationState {
  items: AppNotification[];
  push: (notification: Omit<AppNotification, "id" | "createdAt" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

const MAX_NOTIFICATIONS = 50;

let notificationId = 0;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],

      push: (notification) =>
        set((state) => {
          const item: AppNotification = {
            ...notification,
            id: `n-${Date.now()}-${++notificationId}`,
            createdAt: Date.now(),
            read: false,
          };
          // Avoid duplicate noise: same title + message within a minute.
          const duplicate = state.items.find(
            (existing) =>
              existing.title === item.title &&
              existing.message === item.message &&
              item.createdAt - existing.createdAt < 60_000
          );
          if (duplicate) return state;
          return { items: [item, ...state.items].slice(0, MAX_NOTIFICATIONS) };
        }),

      markRead: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, read: true } : item
          ),
        })),

      markAllRead: () =>
        set((state) => ({
          items: state.items.map((item) => ({ ...item, read: true })),
        })),

      remove: (id) =>
        set((state) => ({ items: state.items.filter((item) => item.id !== id) })),

      clear: () => set({ items: [] }),
    }),
    { name: "rl-notifications" }
  )
);

/**
 * Fire-and-forget helper for non-React call sites (event listeners, API
 * helpers) so they don't need a hook subscription.
 */
export function pushNotification(
  notification: Omit<AppNotification, "id" | "createdAt" | "read">
) {
  useNotificationStore.getState().push(notification);
}
