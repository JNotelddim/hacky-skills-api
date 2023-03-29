import { ScanCommand } from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response } from "express";

import { client } from "..";
import { ENTRIES_TABLE } from "../config";
import { authenticateJWT } from "../middleware";
import {
  AttributeValueValue,
  convertAttributeValueToPlainObject,
} from "../util";

export const getItemsRoute: Express = express();

getItemsRoute.get(
  "/items",
  authenticateJWT,
  async (req: Request, res: Response) => {
    console.log("handling /items get request", req.query);
    const { userId } = req.query;
    const listItemsCommand = new ScanCommand({
      TableName: ENTRIES_TABLE,
    });
    if (userId) {
      // vulnerable to injection attacks?
      listItemsCommand.input.FilterExpression = `userId = :userId`;
      listItemsCommand.input.ExpressionAttributeValues = {
        ":userId": { S: userId.toString() },
      };
    }

    let results: Array<Record<string, AttributeValueValue>> = [];

    try {
      const queryResult = await client.send(listItemsCommand);

      // TODO: swap in read-friendly tag versions.

      if (queryResult.Items) {
        results = queryResult.Items.map(convertAttributeValueToPlainObject);
      }
    } catch (err) {
      console.error(err);
    }

    res.send({
      message: `${results.length} items.`,
      data: results,
    });
  }
);
