import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import express, { Express, Request, Response } from "express";
import { nanoid } from "nanoid";
import { config } from "dotenv";

// Load in Env Vars
config();

// Init app instance
const app: Express = express();
const port = process.env.PORT;
app.use(express.json());

/** DynamoInit */
const client = new DynamoDBClient({ region: "us-east-2" });

/** Express endpoints **/
app.get("/", async (req: Request, res: Response) => {
  res.send("Hello World!");
});

app.get("/items", async (req: Request, res: Response) => {
  const listItemsCommand = new ScanCommand({
    TableName: "hacky-skills-data",
  });
  try {
    const results = await client.send(listItemsCommand);
    results.Items?.forEach((item) => {
      console.log({ item, keys: Object.keys(item) });
    });
  } catch (err) {
    console.error(err);
  }

  res.send("Items!");
});

app.post("/createEntry", async (req: Request, res: Response) => {
  const { title, description, tags, date } = req.body;

  const newItem: Record<string, AttributeValue> = {
    "skill-entry-key": { S: nanoid() },
    title: { S: title },
    description: { S: description },
    tags: { SS: tags },
    date: { S: date },
  };

  const putItemCommand = new PutItemCommand({
    TableName: "hacky-skills-data",
    Item: newItem,
  });

  try {
    const response = await client.send(putItemCommand);
    console.log({ response });
  } catch (err) {
    console.error(err);
  }

  res.send("new Entry , ...");
});

app.listen(port, () => {
  console.log(`Hacky Skills Tracker API, listening on port ${port}`);
});
