import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  AttributeValue,
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
const client = new DynamoDBClient({ region: "us-east-2" });

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
  console.log("authenticating jwt", { authHeader });

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
      // console.log({ payload });

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
  const listItemsCommand = new ScanCommand({
    TableName: "hacky-skills-data",
  });
  let results: Array<Record<string, AttributeValueValue>> = [];

  try {
    const queryResult = await client.send(listItemsCommand);

    if (!queryResult.Items) {
      return [];
    }

    results = queryResult.Items.map(convertAttributeValueToPlainObject);
  } catch (err) {
    console.error(err);
  }

  res.send({
    message: `${results.length} items.`,
    data: results,
  });
});

app.post(
  "/createEntry",
  authenticateJWT,
  async (req: Request, res: Response) => {
    const { title, description, tags, createdAt, startDate, endDate, userId } =
      req.body;

    const newItem: Record<string, AttributeValue> = {
      "skill-entry-key": { S: nanoid() },
      title: { S: title },
      description: { S: description },
      tags: { SS: tags },
      startDate: { S: startDate },
      endDate: { S: endDate },
      createdAt: { S: createdAt },
      type: { S: "log_entry" },
      userId: { S: userId },
    };

    const putItemCommand = new PutItemCommand({
      TableName: "hacky-skills-data",
      Item: newItem,
    });

    try {
      const response = await client.send(putItemCommand);
    } catch (err) {
      console.error(err);
    }

    res.send(convertAttributeValueToPlainObject(newItem));
  }
);

app.listen(port, () => {
  console.log(`Hacky Skills Tracker API, listening on port ${port}`);
});
