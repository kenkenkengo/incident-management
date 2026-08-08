/// <reference path="./.sst/platform/config.d.ts" />

import type { CognitoUserPoolClient } from "./.sst/platform/src/components/aws/cognito-user-pool-client";

const createRotationSecret = (token: sst.Secret) => {
	const secret = new aws.secretsmanager.Secret("RotationSecret", {
		name: $interpolate`${$app.name}-${$app.stage}-origin-verify-token`,
	});

	// 初期値は sst.Secret と同じ値を設定
	new aws.secretsmanager.SecretVersion("RotationSecretVersion", {
		secretId: secret.id,
		secretString: $jsonStringify({
			current: token.value,
			previous: "",
		}),
	});

	return secret;
};

const createUserPool = () => {
	const userPool = new sst.aws.CognitoUserPool("UserPool", {
		usernames: ["email"],
	});

	const client = userPool.addClient("Web", {
		transform: {
			client: {
				explicitAuthFlows: [
					"ALLOW_USER_PASSWORD_AUTH",
					"ALLOW_REFRESH_TOKEN_AUTH",
					"ALLOW_USER_SRP_AUTH",
				],
			},
		},
	});

	return { userPool, client };
};

const createApi = (
	userPool: sst.aws.CognitoUserPool,
	client: CognitoUserPoolClient,
	secret: aws.secretsmanager.Secret,
) => {
	const api = new sst.aws.ApiGatewayV2("Api");

	const originAuthorizer = api.addAuthorizer({
		name: "originVerifyAuthorizer",
		lambda: {
			identitySources: ["$request.header.x-origin-verify"],
			ttl: "5 minutes",
			function: {
				handler: "src/authorizer.handler",
				runtime: "nodejs22.x",
				environment: {
					ORIGIN_VERIFY_SECRET_ID: secret.id,
				},
				permissions: [
					{
						actions: ["secretsmanager:GetSecretValue"],
						resources: [secret.arn],
					},
				],
			},
		},
	});

	const cognitoAuthorizer = api.addAuthorizer({
		name: "CognitoAuthorizer",
		jwt: {
			issuer: $interpolate`https://cognito-idp.${aws.getRegionOutput().region}.amazonaws.com/${userPool.id}`,
			audiences: [client.id],
		},
	});

	return { api, cognitoAuthorizer, originAuthorizer };
};

const createTokenRotation = (
	secret: aws.secretsmanager.Secret,
	siteDistributionId: $util.Output<string>,
) => {
	const rotationFn = new sst.aws.Function("TokenRotation", {
		handler: "src/rotation.handler",
		runtime: "nodejs22.x",
		environment: {
			ORIGIN_VERIFY_SECRET_ID: secret.id,
			CLOUDFRONT_DISTRIBUTION_ID: siteDistributionId,
		},
		permissions: [
			{
				actions: [
					"secretsmanager:GetSecretValue",
					"secretsmanager:PutSecretValue",
				],
				resources: [secret.arn],
			},
			{
				actions: [
					"cloudfront:GetDistribution",
					"cloudfront:GetDistributionConfig",
					"cloudfront:UpdateDistribution",
					"cloudfront:CreateInvalidation",
				],
				resources: [
					$interpolate`arn:aws:cloudfront::${aws.getCallerIdentityOutput().accountId}:distribution/${siteDistributionId}`,
				],
			},
		],
	});

	const rule = new aws.cloudwatch.EventRule("TokenRotationSchedule", {
		scheduleExpression: "rate(1 day)",
	});

	new aws.cloudwatch.EventTarget("TokenRotationTarget", {
		rule: rule.name,
		arn: rotationFn.arn,
	});

	new aws.lambda.Permission("TokenRotationPermission", {
		action: "lambda:InvokeFunction",
		function: rotationFn.name,
		principal: "events.amazonaws.com",
	});
};

const createSite = (api: sst.aws.ApiGatewayV2, secret: sst.Secret) => {
	const site = new sst.aws.StaticSite("Site", {
		path: "../frontend",
		build: { command: "npm run build", output: "dist" },
		dev: { url: "http://localhost:5173" },
		transform: {
			cdn: (args) => {
				const apiDomain = api.url.apply((url) => new URL(url).hostname);
				args.origins = $resolve(args.origins).apply((origins) => [
					...origins,
					{
						domainName: apiDomain,
						originId: "apiOrigin",
						customOriginConfig: {
							httpPort: 80,
							httpsPort: 443,
							originProtocolPolicy: "https-only",
							originSslProtocols: ["TLSv1.2"],
						},
						customHeaders: [
							{
								name: "x-origin-verify",
								value: secret.value,
							},
						],
					},
				]);

				args.orderedCacheBehaviors = [
					{
						pathPattern: "/api/*",
						targetOriginId: "apiOrigin",
						viewerProtocolPolicy: "redirect-to-https",
						allowedMethods: [
							"GET",
							"HEAD",
							"OPTIONS",
							"PUT",
							"POST",
							"PATCH",
							"DELETE",
						],
						cachedMethods: ["GET", "HEAD"],
						// CachingDisabled
						cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
						// AllViewerExceptHostHeader
						originRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
					},
				];
			},
		},
	});
	return site;
};

const createAppTable = () => {
	return new sst.aws.Dynamo("AppTable", {
		fields: {
			pk: "string",
			sk: "string",
			GSI1PK: "string",
			GSI1SK: "string",
			GSI2PK: "string",
			GSI2SK: "string",
			GSI3PK: "string",
			GSI3SK: "string",
		},
		primaryIndex: { hashKey: "pk", rangeKey: "sk" },
		globalIndexes: {
			GSI1: { hashKey: "GSI1PK", rangeKey: "GSI1SK" },
			GSI2: { hashKey: "GSI2PK", rangeKey: "GSI2SK" },
			GSI3: { hashKey: "GSI3PK", rangeKey: "GSI3SK" },
		},
	});
};

const createSlackSecrets = () => {
	return {
		botToken: new sst.Secret("SlackBotToken"),
		signingSecret: new sst.Secret("SlackSigningSecret"),
	};
};

const addRoutes = (
	api: sst.aws.ApiGatewayV2,
	cognitoAuthorizer: ReturnType<typeof api.addAuthorizer>,
	originAuthorizer: ReturnType<typeof api.addAuthorizer>,
	userPool: sst.aws.CognitoUserPool,
	client: CognitoUserPoolClient,
	site: sst.aws.StaticSite,
	appTable: sst.aws.Dynamo,
	slackSecrets: { botToken: sst.Secret; signingSecret: sst.Secret },
	slackTasks: sst.aws.Queue,
	autoStartToken: sst.Secret,
) => {
	const defaultLink = [userPool, client, site, appTable];

	const authOption = $dev ? {} : { auth: { lambda: originAuthorizer.id } };

	// Slack イベントは API Gateway を直接叩く（CloudFront 非経由）
	// 認証は AwsLambdaReceiver の Slack 署名検証（signingSecret）で保護される
	// モーダル送信の重い後処理は SlackTasks キュー経由で slack.worker に逃がす
	api.route("POST /slack/events", {
		handler: "src/slack/slack.handler.handler",
		link: [
			appTable,
			site,
			slackSecrets.botToken,
			slackSecrets.signingSecret,
			slackTasks,
		],
	});

	// 監視アラート等からの自動起票（P0-1）。JWT ではなく共有トークン認証で保護。
	// 検証後は SlackTasks キュー経由でワーカーが起票する。
	api.route("POST /incidents/auto-start", {
		handler: "src/incident/auto-start.handler.handler",
		link: [appTable, site, slackTasks, autoStartToken],
	});

	api.route(
		"POST /api/auth/signin",
		{
			handler: "src/index.handler",
			link: defaultLink,
		},
		authOption,
	);

	api.route(
		"POST /api/auth/refresh",
		{
			handler: "src/index.handler",
			link: defaultLink,
		},
		authOption,
	);

	api.route(
		"GET /api",
		{
			handler: "src/index.handler",
			link: defaultLink,
		},
		authOption,
	);

	api.route(
		"OPTIONS /api/{proxy+}",
		{
			handler: "src/index.handler",
			link: defaultLink,
		},
		authOption,
	);

	api.route(
		"$default",
		{
			handler: "src/index.handler",
			link: defaultLink,
			permissions: [
				{
					actions: ["bedrock:InvokeModel"],
					resources: ["*"],
				},
			],
		},
		{
			auth: {
				jwt: { authorizer: cognitoAuthorizer.id },
			},
		},
	);
};

export default $config({
	app(input) {
		return {
			name: "generosity-incident-management",
			removal: input?.stage === "production" ? "retain" : "remove",
			protect: ["production"].includes(input?.stage),
			home: "aws",
		};
	},

	async run() {
		const originVerifyToken = new sst.Secret("OriginVerifyToken");
		const { userPool, client } = createUserPool();
		const rotationSecret = createRotationSecret(originVerifyToken);
		const { api, cognitoAuthorizer, originAuthorizer } = createApi(
			userPool,
			client,
			rotationSecret,
		);
		const site = createSite(api, originVerifyToken); // 初期シークレットは固定なので originVerifyToken を渡す
		const appTable = createAppTable();
		const slackSecrets = createSlackSecrets();
		// 自動起票エンドポイントの共有トークン（監視側と共有する）
		const autoStartToken = new sst.Secret("AutoStartToken");
		// 重大度別の周知通知先（JSON, P0-2）。未設定なら通知なし。
		const incidentNotifyConfig = new sst.Secret("IncidentNotifyConfig");
		// Backlog API キー（P1-3）。起票時に TroubleReport プロジェクトへ課題作成。
		const backlogApiKey = new sst.Secret("BacklogApiKey");

		// Slack モーダル送信の重い後処理を非同期化するキュー + ワーカー
		// 可視性タイムアウトはワーカーの timeout(60秒) 以上が必須。
		// AWS 推奨に従い関数タイムアウトの 6 倍(360秒)を設定する。
		// DLQ を付け、3 回失敗したら DLQ に退避させる（無限再配信＝チャンネル
		// 量産の暴走を防ぐ）。
		const slackTasksDlq = new sst.aws.Queue("SlackTasksDLQ");
		const slackTasks = new sst.aws.Queue("SlackTasks", {
			dlq: { queue: slackTasksDlq.arn, retry: 3 },
			transform: {
				queue: {
					visibilityTimeoutSeconds: 360,
				},
			},
		});
		slackTasks.subscribe(
			{
				handler: "src/slack/slack.worker.handler",
				runtime: "nodejs22.x",
				link: [
					appTable,
					site,
					slackSecrets.botToken,
					incidentNotifyConfig,
					backlogApiKey,
				],
				timeout: "60 seconds",
			},
			// 1 メッセージ = 1 実行にして、失敗時の再処理で他タスクを
			// 巻き込まない（チャンネル二重作成などの副作用を防ぐ）
			{ batch: { size: 1 } },
		);

		addRoutes(
			api,
			cognitoAuthorizer,
			originAuthorizer,
			userPool,
			client,
			site,
			appTable,
			slackSecrets,
			slackTasks,
			autoStartToken,
		);
		// ローテーション設定（本番・dev共通）
		if (!$dev) {
			createTokenRotation(
				rotationSecret,
				site.nodes.cdn?.nodes.distribution.id!,
			);
		}

		// 放置インシデントのリマインド + エスカレーション（15分ごと）
		// エスカレーション（P0-3）を分単位で効かせるため 1時間→15分に短縮。
		// 2h/24h リマインドと escalation はいずれも重複送信を DynamoDB で防止。
		new sst.aws.CronV2("IncidentReminderCron", {
			schedule: "rate(15 minutes)",
			function: {
				handler: "src/incident/incident.reminder.handler",
				runtime: "nodejs22.x",
				link: [appTable, slackSecrets.botToken, incidentNotifyConfig],
				timeout: "60 seconds",
			},
		});
	},
});
