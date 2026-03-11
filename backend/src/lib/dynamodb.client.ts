import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

export const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const TABLE_NAME = Resource.AppTable.name;
