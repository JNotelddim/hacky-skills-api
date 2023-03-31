import { QueryCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response } from "express";

import { client } from "..";
import { TAGS_KEY, TAGS_TABLE } from "../config";
import { authenticateJWT } from "../middleware";
import { convertAttributeValueToPlainObject } from "../util";

export const getTagsRoute: Express = express();

/**
 * This `tags` endpoint is aiming towards a cursor-paginated list response,
 * but it's still a work-in-progress.
 * It currently supports moving forward from one page to the next, but moving
 * backword is trickier than I expected with dynamodb, so for now if the user
 * wanted to go backwards they'd have to just go back to the beginning and start
 * paging through again :grimace:
 */
getTagsRoute.get(
  "/tags",
  authenticateJWT,
  async (req: Request, res: Response) => {
    const { before, after, size } = req.query;
    // TODO: How to handle "before" for getting previous page?

    let limit = parseInt(size?.toString() || "");
    if (isNaN(limit)) {
      // TODO: update default size to be >5
      limit = 5;
    }

    const listTagsCommand = new ScanCommand({
      TableName: TAGS_TABLE,
      Limit: limit,
      ProjectionExpression: "#k, originalTag, createdAt",
      ExpressionAttributeNames: { "#k": TAGS_KEY },
    });
    // Is this going to be a terrible idea which racks up a huge amount of charges?
    const tagsTotalCountCommand = new ScanCommand({
      TableName: TAGS_TABLE,
      Select: "COUNT",
    });

    if (after) {
      listTagsCommand.input.ExclusiveStartKey = {
        [TAGS_KEY]: { S: after.toString() },
      };
    }

    const tagsResults = await client.send(listTagsCommand);
    const tagsCountResults = await client.send(tagsTotalCountCommand);

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
        count: tagsCountResults.Count,
      },
    });
  }
);
