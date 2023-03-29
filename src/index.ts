import { ScanCommand } from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response } from "express";
import cors from "cors";
import { config } from "dotenv";
import bodyParser from "body-parser";
import helmet from "helmet";

import { authenticateJWT } from "./middleware/authenticateJWT";
import { splitTags } from "./util/splitTags";
import {
  ENTRIES_KEY,
  ENTRIES_TABLE,
  TAGS_KEY,
  TAGS_TABLE,
} from "./config/const";
import { createEntry, createOrUpdateTag } from "./database/helpers";
import { initClient } from "./database/client";
import {
  AttributeValueValue,
  convertAttributeValueToPlainObject,
} from "./util/convertAttributeValueToPlainObject";

// Load in Env Vars
config();

// Init AWS DynamoDb Client
export const client = initClient();

// Init app instance
const app: Express = express();
const port = process.env.PORT;
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
// Some basic security measures - see docs for more info http://expressjs.com/en/advanced/best-practice-security.html
app.use(helmet());
app.disable("x-powered-by");

/** Express endpoints **/

// 404
// app.use((req: Request, res: Response, next: NextFunction) => {
//   res.status(404).send("Sorry can't find that!");
// });

// // 500
// app.use((err: any, req: Request, res: Response, next: NextFunction) => {
//   console.error(err.stack);
//   res.status(500).send("Something broke!");
// });

// 2xx
app.get("/", async (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.get("/tags", authenticateJWT, async (req: Request, res: Response) => {
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
});

app.get("/items", authenticateJWT, async (req: Request, res: Response) => {
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
});

/**
 * Endpoint allowing for the creation of entries.
 * Importantly, the tags submitted with the entries are separated
 * and inserted into their own table, and then the entries here are
 * inserted with just
 */
app.post(
  "/createEntry",
  authenticateJWT,
  async (req: Request, res: Response) => {
    console.log("handling /createEntry post request", { body: req.body });
    const { title, description, tags, userId } = req.body;

    if (!title || !description || !tags || !userId) {
      console.log("req body missing crucial key", { body: req.body });
      res.status(400).send({
        message: "Failed to create new entry.",
      });
      return;
    }

    /* Convert the comma-separated tags in one string, to individual strings in an array */
    const individualTags = splitTags(tags);

    /* Once we have the individual tag values, we can create our new entry */
    let newEntryId: string | undefined;
    try {
      const { id, response } = await createEntry({
        ...req.body,
        tags: individualTags.map((tag) => tag.toLocaleLowerCase()),
      });
      newEntryId = id;

      if (response.$metadata.httpStatusCode === 200) {
        res.send({
          message: "One item successfully created.",
        });
      }
    } catch (err) {
      console.error(err);
      res.status(500).send({
        message: "Failed to create new entry.",
      });
    }

    /* And once the entry is created, we can create/update the tag items with the new entry's key */

    // If the entry id doesn't exist, then something went wrong and we shouldn't move forward
    if (!newEntryId) {
      return;
    }

    try {
      console.log("creating/updating tags", individualTags);
      await Promise.all(
        individualTags.map(async (tag) => {
          await createOrUpdateTag(tag, newEntryId as string);
          // TODO: handle failures?
          return tag.toLocaleLowerCase();
        })
      );
    } catch (err) {
      console.log("something went wrong creating the tags", err);
    }

    // TODO: final follow-up:
    // - compare new tags to existing ones for similarity and
    //    if there are matches, offer user to update their tags
    //    to pre-existing similar ones.
    //    (https://www.npmjs.com/package/string-similarity),
  }
);

app.listen(port, () => {
  console.log(`Hacky Skills Tracker API, listening on port ${port}`);
});
