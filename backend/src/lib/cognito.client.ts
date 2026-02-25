// cognitoを呼び出すクライアントをシングルトンで管理するためのモジュール

import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

let clientInstance: CognitoIdentityProviderClient | undefined;

export const getCognitoClient = (): CognitoIdentityProviderClient => {
  if (!clientInstance) {
    clientInstance = new CognitoIdentityProviderClient({})
  }
  return clientInstance
}