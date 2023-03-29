import { BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response } from "express";

import { client } from "..";
import {
  ENTRIES_KEY,
  ENTRIES_TABLE,
  TAGS_KEY,
  TAGS_TABLE,
} from "../config/const";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { convertAttributeValueToPlainObject } from "../util/convertAttributeValueToPlainObject";
import { splitTags } from "../util/splitTags";

const app: Express = express();

app.get("/search", authenticateJWT, async (req: Request, res: Response) => {
  const { tags } = req.query;

  if (!tags) {
    res.status(400).send("Bad Request");
    return;
  }

  // TODO: fix individualTags going too hard with escaping characters (ie, 'new-tag' is becoming 'newtag')
  const individualTags = splitTags(tags.toString());

  /* Gathering tags which match the queryString. */
  const tagsSearchCommand = new BatchGetItemCommand({
    RequestItems: {
      [TAGS_TABLE]: {
        Keys: individualTags.map((tag) => ({ [TAGS_KEY]: { S: tag } })),
      },
    },
  });
  const results = await client.send(tagsSearchCommand);
  if (!results.Responses) {
    res.send({ message: "No matches found", data: [] });
    return;
  }
  const foundTags = results.Responses[TAGS_TABLE];

  /* For all entries on each tag, get the full entry item and create a list of unique entries. */
  const allEntryIds = foundTags.flatMap((tag) => tag["entries"].SS);
  if (!allEntryIds || !allEntryIds.length) {
    res.status(404).send("No entries found");
    return;
  }

  // Look up actual entries based on entry ids;
  const uniqueEntryIds = allEntryIds.reduce((entryIds, next) => {
    return !!next && !entryIds.includes(next) ? [...entryIds, next] : entryIds;
  }, [] as string[]);

  const entriesSearchCommand = new BatchGetItemCommand({
    RequestItems: {
      [ENTRIES_TABLE]: {
        Keys: uniqueEntryIds.map((entryId) => ({
          [ENTRIES_KEY]: { S: entryId },
        })),
        // Only get relevant attributes
        ProjectionExpression: "title, createdAt, userId, #k",
        ExpressionAttributeNames: {
          "#k": ENTRIES_KEY,
        },
      },
    },
  });

  const entriesResults = await client.send(entriesSearchCommand);
  const foundEntries = entriesResults.Responses?.[ENTRIES_TABLE];

  res.send({
    message: `Found ${
      foundEntries?.length || 0
    } results matching at least one of the tags provided`,
    data: {
      tags: foundTags.map(convertAttributeValueToPlainObject),
      entries: foundEntries?.map(convertAttributeValueToPlainObject),
    },
  });

  // for any matching entry ids, fetch the entry.

  // return the tag-entry maps
});
