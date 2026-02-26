/// <reference path="./.sst/platform/config.d.ts" />

import type { CognitoUserPoolClient } from "./.sst/platform/src/components/aws/cognito-user-pool-client";

const createSite = (api: sst.aws.ApiGatewayV2) => {
	return new sst.aws.StaticSite("Site", {
		path: "../frontend",
		build: {
			command: "npm run build",
			output: "dist",
		},
		dev: {
			url: "http://localhost:5173",
		},
		environment: {
			VITE_API_URL: api.url,
		},
	});
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
) => {
	const api = new sst.aws.ApiGatewayV2("Api", {
		cors: false
	});
	const authorizer = api.addAuthorizer({
		name: "CognitoAuthorizer",
		jwt: {
			issuer: $interpolate`https://cognito-idp.${aws.getRegionOutput().region}.amazonaws.com/${userPool.id}`,
			audiences: [client.id],
		},
	});

	return { api, authorizer };
};

const addRoutes = (
	api: sst.aws.ApiGatewayV2,
	authorizer: ReturnType<typeof api.addAuthorizer>,
	userPool: sst.aws.CognitoUserPool,
	client: CognitoUserPoolClient,
	site: sst.aws.StaticSite,
) => {
	const defaultLink = [userPool, client, site];

	api.route("POST /auth/signin", {
		handler: "src/index.handler",
		link: defaultLink,
	});

	api.route("POST /auth/refresh", {
		handler: "src/index.handler",
		link: defaultLink,
	});

	api.route("GET /", {
		handler: "src/index.handler",
		link: defaultLink,
	});

	api.route("OPTIONS /{proxy+}", {
		handler: "src/index.handler",
		link: defaultLink,
	});

	api.route(
		"$default",
		{
			handler: "src/index.handler",
			link: defaultLink,
		},
		{
			auth: {
				jwt: { authorizer: authorizer.id },
			},
		},
	);
}

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
		const { userPool, client } = createUserPool();
		const { api, authorizer } = createApi(userPool, client);
		const site = createSite(api);
		addRoutes(api, authorizer, userPool, client, site);
	},
});
