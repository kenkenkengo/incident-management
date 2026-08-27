import { App, AwsLambdaReceiver } from "@slack/bolt";
import { Resource } from "sst";
import {
	handleChecklistRole,
	handleChecklistStep,
} from "../incident/incident.actions";
import { ACTION_ROLE, ACTION_STEP } from "../incident/incident.checklist";
import { handleIncidentCommand } from "../incident/incident.commands";
import { handleIncidentStartSubmission } from "../incident/incident.views";
import { handleReactionAdded } from "../incident/reaction.events";
import { handleChannelCreated } from "./channel.events";
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
app.event("reaction_added", handleReactionAdded);
app.event("channel_created", handleChannelCreated);
app.view("incident_start_modal", handleIncidentStartSubmission);
app.action(ACTION_STEP, handleChecklistStep);
// 役割ボタンは action_id を役割ごとにユニーク化しているため前方一致で受ける
app.action(new RegExp(`^${ACTION_ROLE}_`), handleChecklistRole);

const asyncHandler = receiver.toHandler();

export const handler = (
	event: Parameters<typeof asyncHandler>[0],
	context: Parameters<typeof asyncHandler>[1],
) => asyncHandler(event, context);
