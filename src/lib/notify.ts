// Notification helper - stores in DB and (in production) would dispatch to other channels.
import { db } from "@/lib/db";
import type { NotificationType, NotificationSeverity } from "@/lib/types";

export async function sendNotification(
  userId: string,
  args: {
    type: NotificationType;
    title: string;
    body: string;
    severity?: NotificationSeverity;
    payload?: any;
    channels?: string[];
  },
) {
  return db.notification.create({
    data: {
      userId,
      type: args.type,
      title: args.title,
      body: args.body,
      severity: args.severity ?? "info",
      payload: JSON.stringify(args.payload ?? {}),
      channels: JSON.stringify(args.channels ?? ["in_app"]),
    },
  });
}
