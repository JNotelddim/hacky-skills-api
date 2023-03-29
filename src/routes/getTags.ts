import { ScanCommand } from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response } from "express";

import { client } from "..";
import { TAGS_KEY, TAGS_TABLE } from "../config";
import { authenticateJWT } from "../middleware";
import { convertAttributeValueToPlainObject } from "../util";

export const getTagsRoute: Express = express();

getTagsRoute.get(
  "/tags",
  authenticateJWT,
  async (req: Request, res: Response) => {
    const { before, after, size } = req.query;
    // TODO: How to handle "before" for getting previous page?

    let limit = parseInt(size?.toString() || "");
    if (isNaN(limit)) {
      limit = 5;
    }

    const listTagsCommand = new ScanCommand({
      TableName: TAGS_TABLE,
      Limit: limit,
      ProjectionExpression: "#k, originalTag, createdAt",
      ExpressionAttributeNames: { "#k": TAGS_KEY },
    });

    // K but how would I support "before"?...
    if (after) {
      listTagsCommand.input.ExclusiveStartKey = {
        [TAGS_KEY]: { S: after.toString() },
      };
    }

    const tagsResults = await client.send(listTagsCommand);

    if (!tagsResults.Count || tagsResults.Count <= 0) {
      res.send({ message: "No tags found", data: [] });
    }

    const reformattedTags = tagsResults.Items?.map(
      convertAttributeValueToPlainObject
    );

    res.send({
      message: `Found ${tagsResults.Count} tags.`,
      data: {
        items: reformattedTags,
        hasMore: !!tagsResults.LastEvaluatedKey,
      },
    });
  }
);
