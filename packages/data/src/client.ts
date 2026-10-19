import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

let _dynamoClient: DynamoDBClient | undefined;
export const dynamoClient = () => {
  _dynamoClient ??= new DynamoDBClient();
  return _dynamoClient;
};

let _documentClient: DynamoDBDocumentClient | undefined;
export const documentClient = () => {
  _documentClient ??= DynamoDBDocumentClient.from(dynamoClient(), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return _documentClient;
};

let _cognitoMappingClient: DynamoDBDocumentClient | undefined;
/** All replicas must use one Region to arbitrate identity creation. */
export const cognitoMappingClient = () => {
  const region = process.env.COGNITO_MAPPING_REGION;
  if (!region) return documentClient();
  _cognitoMappingClient ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({ region }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return _cognitoMappingClient;
};
