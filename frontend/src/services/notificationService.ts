import { BackendNotification } from "@/src/api/client";

export enum NotificationType {
  Sermon = "sermon",
  Meeting = "meeting",
  Announcement = "announcement",
  General = "general",
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  deep_link?: string | null;
  audience?: string | null;
  language?: string | null;
  status: string;
  delivered_at?: string | null;
  created_at?: string;
  type: NotificationType;
  sermon_id?: string | null;
  meeting_id?: string | null;
  read: boolean;
}

/**
 * Validate raw notification item from API or storage.
 * Rejects malformed items (missing ID, title, body) to prevent UI crashes.
 */
export function validateNotification(raw: any): NotificationItem | null {
  if (!raw || typeof raw !== "object") return null;

  const id = String(raw.id || "").trim();
  const title = String(raw.title || "").trim();
  const body = String(raw.body || "").trim();

  if (!id || !title || !body) return null;

  // Infer notification type
  let type = NotificationType.General;
  const rawType = String(raw.type || "").toLowerCase();
  const deepLink = String(raw.deep_link || "").toLowerCase();
  const sermonId = raw.sermon_id || (deepLink.includes("sermon") ? extractId(deepLink) : null);
  const meetingId = raw.meeting_id || (deepLink.includes("meeting") ? extractId(deepLink) : null);

  if (rawType === "sermon" || sermonId) {
    type = NotificationType.Sermon;
  } else if (rawType === "meeting" || meetingId) {
    type = NotificationType.Meeting;
  } else if (rawType === "announcement") {
    type = NotificationType.Announcement;
  }

  return {
    id,
    title,
    body,
    deep_link: raw.deep_link || null,
    audience: raw.audience || null,
    language: raw.language || null,
    status: raw.status || "published",
    delivered_at: raw.delivered_at || raw.created_at || null,
    created_at: raw.created_at || null,
    type,
    sermon_id: sermonId,
    meeting_id: meetingId,
    read: Boolean(raw.read),
  };
}

function extractId(url: string): string | null {
  const parts = url.split("/");
  return parts[parts.length - 1] || null;
}

/**
 * Deduplicate and merge server notifications into existing local notifications.
 * Preserves user's local `read` status while updating title/body/timestamps.
 * Guaranteed to return items ordered newest-first.
 */
export function mergeAndDeduplicate(
  cached: NotificationItem[],
  incoming: (BackendNotification | NotificationItem)[],
  readIds: Set<string>
): NotificationItem[] {
  const map = new Map<string, NotificationItem>();

  // Populate map with existing cached items
  for (const item of cached) {
    const valid = validateNotification(item);
    if (valid) {
      if (readIds.has(valid.id)) valid.read = true;
      map.set(valid.id, valid);
    }
  }

  // Merge incoming server items
  for (const raw of incoming) {
    const valid = validateNotification(raw);
    if (valid) {
      const existing = map.get(valid.id);
      const isRead = existing ? existing.read : readIds.has(valid.id);
      map.set(valid.id, {
        ...valid,
        read: isRead,
      });
    }
  }

  // Convert to array and sort descending by timestamp
  const list = Array.from(map.values());
  list.sort((a, b) => {
    const tA = new Date(a.delivered_at || a.created_at || 0).getTime();
    const tB = new Date(b.delivered_at || b.created_at || 0).getTime();
    return tB - tA;
  });

  return list;
}

export interface RouteResolution {
  type: NotificationType;
  sermon_id?: string | null;
  meeting_id?: string | null;
}

/**
 * Resolve navigation target for a notification item based on NotificationType.
 */
export function resolveNotificationRoute(item: NotificationItem): RouteResolution {
  if (item.sermon_id) {
    return { type: NotificationType.Sermon, sermon_id: item.sermon_id };
  }
  if (item.meeting_id) {
    return { type: NotificationType.Meeting, meeting_id: item.meeting_id };
  }
  return { type: item.type || NotificationType.General };
}
