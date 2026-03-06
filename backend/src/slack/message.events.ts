import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { addMessage, findActiveByChannel } from "../incident/incident.repository";

export const handleMessageEvent = async ({
  event,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  // ボットのメッセージやサブタイプ付きは除外
  if (event.subtype) {
    return;
  }

  const incident = await findActiveByChannel(event.channel)
  if (!incident) {
    return;
  }

  await addMessage(incident.id, {
    userId: event.user,
    userName: event.user,
    text: event.text ?? "",
    messageTs: event.ts,
  })
}