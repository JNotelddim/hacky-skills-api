import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  AttributeValue,
  GetItemCommand,
  UpdateItemCommand,
  QueryCommand,
  BatchGetItemCommand,
} from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { config } from "dotenv";
import bodyParser from "body-parser";
import helmet from "helmet";

const TAGS_TABLE = "hacky-skills-tags";
const TAGS_KEY = "skill-tag-key";
const ENTRIES_TABLE = "hacky-skills-data";
const ENTRIES_KEY = "skill-entry-key";
enum EntryType {
  LogEntry = "log_entry",
}

// Load in Env Vars
config();

// Init app instance
const app: Express = express();
const port = process.env.PORT;
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
// Some basic security measures - see docs for more info http://expressjs.com/en/advanced/best-practice-security.html
app.use(helmet());
app.disable("x-powered-by");

/** DynamoInit */
const client = new DynamoDBClient({
  region: "us-east-2",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

/**
 * `authenticateJWT` is needed for ensuring that the client making the
 * requests is the BoltJS app.
 * We're using time-limited HMAC SHA256 signing with JWT tokens on all requests
 * from the BoltJS app, and then this API validates the tokens.
 * This way we know fairly confidently that it's the bolt app making the requests.
 */
export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  try {
    if (!authHeader) {
      console.log("missing authheader");
      res.sendStatus(400);
      return;
    }

    if (!process.env.BOLT_KEY) {
      console.log("missing bolt key");
      res.sendStatus(500);
      return;
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, process.env.BOLT_KEY, (err, payload) => {
      if (err) {
        console.log({ err });
        return res.sendStatus(403);
      }

      (req as any).authPayload = payload;

      next();
    });
  } catch (e) {
    console.log(e);
  }
};

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

// Helpers, TODO move to util folder
export type AttributeValueValue = string | boolean | number | string[];
export const convertAttributeValueToPlainObject = (
  item: Record<string, AttributeValue>
) => {
  let result: Record<string, AttributeValueValue> = {};
  Object.keys(item).map((key) => {
    result[key] = Object.values(item[key])[0];
  });

  return result;
};

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

app.get("/search", authenticateJWT, async (req: Request, res: Response) => {
  const { tags } = req.query;

  console.log({ tags });

  if (!tags) {
    res.status(400).send("Bad Request");
    return;
  }

  // res.send("This feature is a WIP, check back later.");

  const individualTags = splitTags(tags.toString());

  console.log({ individualTags });

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
  if (!allEntryIds) {
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
    message: `X results found matching at least one of the tags provided`,
    data: {
      tags: foundTags.map(convertAttributeValueToPlainObject),
      entries: foundEntries?.map(convertAttributeValueToPlainObject),
    },
  });

  // for any matching entry ids, fetch the entry.

  // return the tag-entry maps
});

const splitTags = (input: string) => {
  if (!input || !input.length) {
    return [];
  }

  const splitItems = input.split(",");
  const escapeCharsRegex = /\W/;
  const trimmedItems = splitItems.map((item) =>
    item.replace(escapeCharsRegex, "")
  );

  return trimmedItems;
};

/**
 * When creating tags in the db, we want to let existing tags
 * take precendence over new ones.
 */
const createOrUpdateTag = async (tag: string, entryId: string) => {
  // Tag key is the lower-case version of the tag string to keep it consistent across casings
  const tagKey = tag.toLocaleLowerCase();

  /* Check if it already exists */
  const tagCheckCommand = new GetItemCommand({
    TableName: TAGS_TABLE,
    Key: { [TAGS_KEY]: { S: tagKey } },
  });
  const existingItem = await client.send(tagCheckCommand);

  /* Updating the existing tag or create a new one, ensuring the entry is tracked on the tag's entries array */
  if (existingItem.Item) {
    console.log("updating existing tag,", tagKey);
    const updateTagCommand = new UpdateItemCommand({
      TableName: TAGS_TABLE,
      Key: { [TAGS_KEY]: { S: tagKey } },
      AttributeUpdates: {
        entries: {
          Value: {
            SS: [...(existingItem.Item["entries"].SS || []), entryId],
          },
        },
      },
    });
    await client.send(updateTagCommand);
    // TODO: handle errors?
  } else {
    console.log("inserting new tag,", tagKey);
    const newItem: Record<string, AttributeValue> = {
      [TAGS_KEY]: { S: tagKey },
      originalTag: { S: tag },
      createdAt: { S: new Date().toISOString() },
      entries: entryId ? { SS: [entryId] } : { NULL: true },
    };
    const putTagCommand = new PutItemCommand({
      TableName: TAGS_TABLE,
      Item: newItem,
    });
    await client.send(putTagCommand);
    // TODO: handle errors?
  }
};

/**
 * Creatinng entry items in the db.
 */
const createEntry = async (body: Record<string, any>) => {
  const { title, description, tags, startDate, endDate, userId } = body;

  const newItem: Record<string, AttributeValue> = {
    [ENTRIES_KEY]: { S: nanoid() },
    title: { S: title },
    description: { S: description },
    tags: { SS: tags },
    startDate: { S: startDate },
    endDate: { S: endDate },
    createdAt: { S: new Date().toISOString() },
    type: { S: EntryType.LogEntry },
    userId: { S: userId },
  };

  const putItemCommand = new PutItemCommand({
    TableName: ENTRIES_TABLE,
    Item: newItem,
  });

  const response = await client.send(putItemCommand);
  return {
    id: newItem[ENTRIES_KEY].S,
    response,
  };
};

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
