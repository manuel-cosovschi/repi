import { handle, sessionUserId } from "@/server/access/http";
import { markNotificationsSeen } from "@/server/notifications/feed";

export const POST = handle(async () => markNotificationsSeen(await sessionUserId()));
