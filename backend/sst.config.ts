/// <reference path="./.sst/platform/config.d.ts" />

const createSite = () => {
  return new sst.aws.StaticSite("Site", {
    path: "../frontend",
    build: {
      command: "npm run build",
      output: "dist",
    },
  });
};

const userPool = new sst.aws.CognitoUserPool("UserPool")

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
    new sst.aws.Function("Hono", {
      url: true,
      handler: "src/index.handler",
    });
  },
});
