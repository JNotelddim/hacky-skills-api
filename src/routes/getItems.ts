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

/**
 * This endpoint is intended to generally be filtering by userId, though it also
 * supports getting the items without the user filtering.
 *
 * Theoretically, it'd be a good ideal to paginate this endpoint, but for now it's
 * alright as is.
 *
 * TODOs:
 * - escape userId input to prevent injection attacks,
 * - replace tag ids with friendly-string tag values.
 */
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
      listItemsCommand.input.FilterExpression = `userId = :userId`;
      listItemsCommand.input.ExpressionAttributeValues = {
        ":userId": { S: userId.toString() },
      };
    }

    let results: Array<Record<string, AttributeValueValue>> = [];

    try {
      const queryResult = await client.send(listItemsCommand);

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
