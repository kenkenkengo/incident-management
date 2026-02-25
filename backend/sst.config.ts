/// <reference path="./.sst/platform/config.d.ts" />

import { CognitoUserPoolClient } from "./.sst/platform/src/components/aws/cognito-user-pool-client";

const createSite = () => {
  return new sst.aws.StaticSite("Site", {
    path: "../frontend",
    build: {
      command: "npm run build",
      output: "dist",
    },
  });
};

const createUserPool = () => {
  const userPool = new sst.aws.CognitoUserPool("UserPool", {
    usernames: ["email"],
  })

  const client = userPool.addClient("Web", {
    transform: {
      client: {
        explicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
          "ALLOW_USER_SRP_AUTH",
        ]
      }
    }
  })

  return { userPool, client }
}

const createApi = (userPool: sst.aws.CognitoUserPool, client: CognitoUserPoolClient) => {
  const api = new sst.aws.ApiGatewayV2("Api");
  const authorizer = api.addAuthorizer({
    name: "CognitoAuthorizer",
    jwt: {
      issuer: $interpolate`https://cognito-idp.${aws.getRegionOutput().region}.amazonaws.com/${userPool.id}`,
      audiences: [client.id],
    }
  })

  api.route("POST /auth/signin", {
    handler: "src/index.handler",
    link: [userPool, client],
  })

  api.route("POST /auth/refresh", {
    handler: "src/index.handler",
    link: [userPool, client],
  })

  api.route("GET /", {
    handler: "src/index.handler",
    link: [userPool, client],
  })

  api.route("$default", {
    handler: "src/index.handler",
    link: [userPool, client],
  }, {
    auth: {
      jwt: { authorizer: authorizer.id }
    }
  });
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
    createSite();
    const { userPool, client } = createUserPool();
    createApi(userPool, client)
  },
});