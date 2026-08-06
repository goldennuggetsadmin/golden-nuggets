import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import {
  NotificationItem,
  mergeAndDeduplicate,
  validateNotification,
} from "@/src/services/notificationService";

const KEY_NOTIFICATIONS = "sanctuary.notifications.list";
const KEY_READ_IDS = "sanctuary.notifications.read_ids";
const KEY_LAST_FETCH = "sanctuary.notifications.last_fetch";

const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minute freshness TTL

export const notificationStore = {
  /**
   * Get locally cached notifications from storage.
   */
  async getCachedNotifications(): Promise<NotificationItem[]> {
    const raw = await storage.getItem(KEY_NOTIFICATIONS, "[]");
    let items: any[] = [];
    try {
      items = JSON.parse(String(raw || "[]"));
    } catch {
      items = [];
    }

    const readIds = await this.getReadIds();
    const validItems: NotificationItem[] = [];
    for (const item of items) {
      const valid = validateNotification(item);
      if (valid) {
        if (readIds.has(valid.id)) valid.read = true;
        validItems.push(valid);
      }
    }
    return validItems;
  },

  /**
   * Get set of read notification IDs from storage.
   */
  async getReadIds(): Promise<Set<string>> {
    const raw = await storage.getItem(KEY_READ_IDS, "[]");
    let arr: string[] = [];
    try {
      arr = JSON.parse(String(raw || "[]"));
    } catch {
      arr = [];
    }
    return new Set(Array.isArray(arr) ? arr : []);
  },

  /**
   * Fetch notifications from server, deduplicate, validate, merge with local read state,
   * update cache, and return clean sorted items.
   * Throttles network calls unless `force` is true.
   */
  async fetchAndSyncNotifications(
    language?: string,
    force = false
  ): Promise<NotificationItem[]> {
    const lastFetchRaw = await storage.getItem(KEY_LAST_FETCH, 0);
    const lastFetch = typeof lastFetchRaw === "number" ? lastFetchRaw : 0;
    const now = Date.now();

    const cached = await this.getCachedNotifications();
    const readIds = await this.getReadIds();

    // Return cached list if call is throttled and cache exists
    if (!force && lastFetch && now - lastFetch < MIN_REFRESH_INTERVAL_MS && cached.length > 0) {
      return cached;
    }

    try {
      const rawServerItems = await api.notifications(language);
      const merged = mergeAndDeduplicate(cached, rawServerItems, readIds);

      await storage.setItem(KEY_NOTIFICATIONS, JSON.stringify(merged));
      await storage.setItem(KEY_LAST_FETCH, now);

      return merged;
    } catch (e) {
      // Offline or network error: return cached items cleanly without crashing
      return cached;
    }
  },

  /**
   * Mark a single notification as read and persist to storage.
   */
  async markAsRead(id: string): Promise<NotificationItem[]> {
    const readIds = await this.getReadIds();
    readIds.add(id);
    await storage.setItem(KEY_READ_IDS, JSON.stringify(Array.from(readIds)));

    const cached = await this.getCachedNotifications();
    const updated = cached.map((item) => (item.id === id ? { ...item, read: true } : item));

    await storage.setItem(KEY_NOTIFICATIONS, JSON.stringify(updated));
    return updated;
  },

  /**
   * Mark all notifications as read and persist to storage.
   */
  async markAllAsRead(): Promise<NotificationItem[]> {
    const cached = await this.getCachedNotifications();
    const readIds = await this.getReadIds();

    const updated = cached.map((item) => {
      readIds.add(item.id);
      return { ...item, read: true };
    });

    await storage.setItem(KEY_READ_IDS, JSON.stringify(Array.from(readIds)));
    await storage.setItem(KEY_NOTIFICATIONS, JSON.stringify(updated));
    return updated;
  },

  /**
   * Compute unread count.
   */
  getUnreadCount(notifications: NotificationItem[]): number {
    return notifications.filter((n) => !n.read).length;
  },

  /**
   * Format unread badge string (capped at 99+).
   */
  getUnreadBadgeText(count: number): string {
    if (count <= 0) return "";
    if (count > 99) return "99+";
    return String(count);
  },
};
