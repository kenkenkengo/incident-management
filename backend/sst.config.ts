/// <reference path="./.sst/platform/config.d.ts" />

import type { CognitoUserPoolClient } from "./.sst/platform/src/components/aws/cognito-user-pool-client";

const createRotationSecret = (token: sst.Secret) => {
	const secret = new aws.secretsmanager.Secret("RotationSecret", {
		name: $interpolate`${$app.name}-${$app.stage}-origin-verify-token`,
	})

	// 初期値は sst.Secret と同じ値を設定
	new aws.secretsmanager.SecretVersion("RotationSecretVersion", {
		secretId: secret.id,
		secretString: $jsonStringify({
			current: token.value,
			previous: "",
		}),
	});

	return secret;
}

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
					}
				]
			}
		}
	})

	const cognitoAuthorizer = api.addAuthorizer({
		name: "CognitoAuthorizer",
		jwt: {
			issuer: $interpolate`https://cognito-idp.${aws.getRegionOutput().region}.amazonaws.com/${userPool.id}`,
			audiences: [client.id],
		},
	});

	return { api, cognitoAuthorizer, originAuthorizer };
};

const createTokenRotation = (secret: aws.secretsmanager.Secret, siteDistributionId: $util.Output<string>) => {
	const rotationFn = new sst.aws.Function("TokenRotation", {
		handler: "src/rotation.handler",
		runtime: "nodejs22.x",
		environment: {
			ORIGIN_VERIFY_SECRET_ID: secret.id,
			CLOUDFRONT_DISTRIBUTION_ID: siteDistributionId,
		},
		permissions: [
			{
				actions: ["secretsmanager:GetSecretValue", "secretsmanager:PutSecretValue"],
				resources: [secret.arn],
			},
			{
				actions: ["cloudfront:GetDistribution", "cloudfront:UpdateDistribution", "cloudfront:CreateInvalidation"],
				resources: ["*"],
			}
		]
	})

	const rule = new aws.cloudwatch.EventRule("TokenRotationSchedule", {
		scheduleExpression: "rate(1 day)",
	})

	new aws.cloudwatch.EventTarget("TokenRotationTarget", {
		rule: rule.name,
		arn: rotationFn.arn,
	})

	new aws.lambda.Permission("TokenRotationPermission", {
		action: "lambda:InvokeFunction",
		function: rotationFn.name,
		principal: "events.amazonaws.com",
	})
}

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
						customHeaders: [{
							name: "x-origin-verify",
							value: secret.value,
						}]
					}
				])

				args.orderedCacheBehaviors = [
					{
						pathPattern: "/api/*",
						targetOriginId: "apiOrigin",
						viewerProtocolPolicy: "redirect-to-https",
						allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
						cachedMethods: ["GET", "HEAD"],
						// CachingDisabled
						cachePolicyId: "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
						// AllViewerExceptHostHeader
						originRequestPolicyId: "b689b0a8-53d0-40ab-baf2-68738e2966ac",
					}
				]
			}
		}
	})
	return site
};

const createRunbookTable = () => {
	return new sst.aws.Dynamo("RunbookTable", {
		fields: {
			id: "string",
		},
		primaryIndex: { hashKey: "id" },
	});
};

const createIncidentTable = () => {
	return new sst.aws.Dynamo("IncidentTable", {
		fields: {
			pk: "string",
			sk: "string",
		},
		primaryIndex: { hashKey: "pk", rangeKey: "sk" },
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
	runbookTable: sst.aws.Dynamo,
	incidentTable: sst.aws.Dynamo,
	slackSecrets: { botToken: sst.Secret; signingSecret: sst.Secret },
) => {
	const defaultLink = [userPool, client, site, runbookTable, incidentTable];

	api.route("POST /slack/events", {
		handler: "src/slack/slack.handler.handler",
		link: [
			incidentTable,
			runbookTable,
			slackSecrets.botToken,
			slackSecrets.signingSecret,
		],
	}, {
		auth: {
			lambda: originAuthorizer.id
		}
	});

	api.route("POST /auth/signin", {
		handler: "src/index.handler",
		link: defaultLink,
	}, {
		auth: {
			lambda: originAuthorizer.id,
		},
	});

	api.route("POST /auth/refresh", {
		handler: "src/index.handler",
		link: defaultLink,
	}, {
		auth: {
			lambda: originAuthorizer.id,
		},
	});

	api.route("GET /", {
		handler: "src/index.handler",
		link: defaultLink,
	}, {
		auth: {
			lambda: originAuthorizer.id,
		},
	});

	api.route("OPTIONS /{proxy+}", {
		handler: "src/index.handler",
		link: defaultLink,
	}, {
		auth: {
			lambda: originAuthorizer.id,
		}
	});

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
		const { api, cognitoAuthorizer, originAuthorizer } = createApi(userPool, client, rotationSecret);
		const site = createSite(api, originVerifyToken); // 初期シークレットは固定なので originVerifyToken を渡す
		const runbookTable = createRunbookTable();
		const incidentTable = createIncidentTable();
		const slackSecrets = createSlackSecrets();
		addRoutes(
			api,
			cognitoAuthorizer,
			originAuthorizer,
			userPool,
			client,
			site,
			runbookTable,
			incidentTable,
			slackSecrets,
		);
	},
});
