import { App, AwsLambdaReceiver } from "@slack/bolt";
import { Resource } from "sst";
import {
	handleChecklistRole,
	handleChecklistStep,
} from "../incident/incident.actions";
import { ACTION_ROLE, ACTION_STEP } from "../incident/incident.checklist";
import { handleIncidentCommand } from "../incident/incident.commands";
import {
	handleIncidentEndSubmission,
	handleIncidentStartSubmission,
	handleIncidentStatusSubmission,
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
app.view("incident_status_modal", handleIncidentStatusSubmission);
app.action(ACTION_STEP, handleChecklistStep);
app.action(ACTION_ROLE, handleChecklistRole);

const asyncHandler = receiver.toHandler();

export const handler = (
	event: Parameters<typeof asyncHandler>[0],
	context: Parameters<typeof asyncHandler>[1],
) => asyncHandler(event, context);
