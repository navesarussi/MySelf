import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import { listPushTokens, removePushTokens } from "@/lib/push/tokens";
import type { PushPayload, PushSendResult } from "@/lib/push/types";

const expo = new Expo();

function collectInvalidTokens(tickets: ExpoPushTicket[], tokens: string[]): string[] {
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status === "error") {
      const err = ticket.details?.error;
      if (err === "DeviceNotRegistered") dead.push(tokens[i]);
    }
  });
  return dead.filter(Boolean);
}

/** Send to all registered tokens (or a provided list). Removes dead tokens. */
export async function sendPush(
  payload: PushPayload,
  tokens?: string[]
): Promise<PushSendResult> {
  const list = tokens ?? (await listPushTokens());
  const valid = list.filter((t) => Expo.isExpoPushToken(t));
  if (!valid.length) return { sent: 0, failed: 0, removedTokens: [] };

  const messages: ExpoPushMessage[] = valid.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets: ExpoPushTicket[] = [];
  const ticketTokens: string[] = [];

  let offset = 0;
  for (const chunk of chunks) {
    const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
    tickets.push(...chunkTickets);
    ticketTokens.push(...valid.slice(offset, offset + chunk.length));
    offset += chunk.length;
  }

  const removedTokens = collectInvalidTokens(tickets, ticketTokens);
  if (removedTokens.length) await removePushTokens(removedTokens);

  const failed = tickets.filter((t) => t.status === "error").length;
  return { sent: tickets.length - failed, failed, removedTokens };
}
