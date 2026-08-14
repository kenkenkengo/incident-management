import type {
	AllMiddlewareArgs,
	BlockAction,
	ButtonAction,
	SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { applyRoleToggle, applyStepToggle } from "./incident.checklist";

// 初動チェックリストのボタン押下（ステップ完了 / 役割立候補）を処理する。
// block_actions は 3 秒以内に ack が必要。処理は chat.update 1 回で軽量。

type ActionArgs = AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>;

const parseContext = (body: BlockAction) => {
	const action = body.actions[0] as ButtonAction;
	const [incidentId, key] = (action.value ?? "").split(":");
	const channel = body.channel?.id;
	const messageTs = body.message?.ts;
	const userId = body.user.id;
	return { incidentId, key, channel, messageTs, userId };
};

export const handleChecklistStep = async ({
	ack,
	body,
	client,
}: ActionArgs) => {
	await ack();
	const { incidentId, key, channel, messageTs, userId } = parseContext(body);
	if (!incidentId || !key || !channel || !messageTs) return;
	await applyStepToggle(client, incidentId, key, userId, channel, messageTs);
};

export const handleChecklistRole = async ({
	ack,
	body,
	client,
}: ActionArgs) => {
	await ack();
	const { incidentId, key, channel, messageTs, userId } = parseContext(body);
	if (!incidentId || !key || !channel || !messageTs) return;
	await applyRoleToggle(client, incidentId, key, userId, channel, messageTs);
};
