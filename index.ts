import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  AttributeValue,
  PutItemCommandOutput,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { config } from "dotenv";
import bodyParser from "body-parser";
import helmet from "helmet";

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
    TableName: "hacky-skills-data",
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

  // split tags

  // search "tags" table by ids
  // => include (entries) field on any matching "tag" rows.

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
const createTag = async (tag: string, entryId?: string) => {
  // Tag key is the lower-case version of the tag string to keep it consistent across casings
  const tagKey = tag.toLocaleLowerCase();

  /* Check if it already exists */
  const tagCheckCommand = new GetItemCommand({
    TableName: "hacky-skills-tags",
    Key: { "skill-tag-key": { S: tagKey } },
  });
  const existanceResult = await client.send(tagCheckCommand);
  console.log({ existanceResult });

  let tagItem: Record<string, AttributeValue> = {
    "skill-tag-key": { S: tagKey },
  };

  /* Updating the existing tag or create a new one, ensuring the entry is tracked on the tag's entries array */
  if (existanceResult.Item) {
    console.log("UPDATING EXISTING TAG");
    if (existanceResult.Item["entries"] && entryId) {
      console.log({ entries: existanceResult.Item["entries"].SS, entryId });
      console.log("entry values", {
        values: existanceResult.Item["entries"].SS,
      });

      tagItem.entries = {
        SS: [...(existanceResult.Item["entries"].SS || []), entryId],
      };
    } else {
      console.log("issue updating tag entries array", {
        existanceResult,
        entryId,
      });
    }
  } else {
    console.log("CREATING NEW TAG");
    tagItem = {
      "skill-tag-key": { S: tagKey },
      originalTag: { S: tag },
      createdAt: { S: new Date().toISOString() },
      // TODO: link to entries?
      entries: entryId ? { SS: [entryId] } : { NULL: true },
    };
  }

  /* Whether it's a create or an update, we use the Put command. */
  const putTagCommand = new PutItemCommand({
    TableName: "hacky-skills-tags",
    Item: tagItem,
  });
  const result = await client.send(putTagCommand);

  return result;
};

/**
 * Creatinng entry items in the db.
 */
const createEntry = async (body: Record<string, any>) => {
  const { title, description, tags, startDate, endDate, userId } = body;

  const newItem: Record<string, AttributeValue> = {
    "skill-entry-key": { S: nanoid() },
    title: { S: title },
    description: { S: description },
    tags: { SS: tags },
    startDate: { S: startDate },
    endDate: { S: endDate },
    createdAt: { S: new Date().toISOString() },
    type: { S: "log_entry" },
    userId: { S: userId },
  };

  const putItemCommand = new PutItemCommand({
    TableName: "hacky-skills-data",
    Item: newItem,
  });

  const response = await client.send(putItemCommand);
  return {
    id: newItem["skill-entry-key"].S,
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

    const individualTags = splitTags(tags);

    let newEntryId: string | undefined;

    console.log("creating new entry");
    try {
      const { id, response } = await createEntry({
        ...req.body,
        tags: individualTags.map((tag) => tag.toLocaleLowerCase()),
      });
      newEntryId = id;

      console.log("resulting new item id", { newEntryId });

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

    // TODO: final follow-up:
    // - ensure entries are listed on tags
    // - compare new tags to existing ones for similarity and
    //    if there are matches, offer user to update their tags
    //    to pre-existing similar ones.
    //    (https://www.npmjs.com/package/string-similarity),

    try {
      console.log("creating tags", individualTags);
      await Promise.all(
        individualTags.map(async (tag) => {
          // if it's a duplicate, just ignore and let the existing one be used.
          const result = await createTag(tag, newEntryId);

          console.log("tag creation result", { result });

          // TODO: handle failures?
          return tag.toLocaleLowerCase();
        })
      );
    } catch (err) {
      console.log("something went wrong creating the tags", err);
    }
  }
);

app.listen(port, () => {
  console.log(`Hacky Skills Tracker API, listening on port ${port}`);
});
