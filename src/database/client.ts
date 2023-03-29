import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

/** DynamoInit */
export const initClient = () =>
  new DynamoDBClient({
    region: "us-east-2",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });
