import { App, AwsLambdaReceiver } from "@slack/bolt"
import { Resource } from "sst"
import { handleIncidentCommand } from "../incident/incident.commands";
import { handleMessageEvent } from "./message.events";


const receiver = new AwsLambdaReceiver({
  signingSecret: Resource.SlackSigningSecret.value,
})

const app = new App({
  token: Resource.SlackBotToken.value,
  receiver
})

app.command("/incident", handleIncidentCommand)
app.event("message", handleMessageEvent)

export const handler = receiver.toHandler()