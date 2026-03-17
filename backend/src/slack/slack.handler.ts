import { App, AwsLambdaReceiver } from "@slack/bolt";
import { Resource } from "sst";
import { handleIncidentCommand } from "../incident/incident.commands";
import {
	handleIncidentStartSubmission,
	handleIncidentEndSubmission,
} from "../incident/incident.views";
import { handleMessageEvent } from "./message.events";

const receiver = new AwsLambdaReceiver({
	signingSecret: Resource.SlackSigningSecret.value,
});

const app = new App({
	token: Resource.SlackBotToken.value,
	receiver,
});

app.command("/incident", handleIncidentCommand);
app.event("message", handleMessageEvent);
app.view("incident_start_modal", handleIncidentStartSubmission);
app.view("incident_end_modal", handleIncidentEndSubmission);

export const handler = receiver.toHandler();
