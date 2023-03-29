import express, { Express, Request, Response } from "express";
import cors from "cors";
import { config } from "dotenv";
import bodyParser from "body-parser";
import helmet from "helmet";

import { initClient } from "./database";
import {
  searchRoute,
  getTagsRoute,
  getItemsRoute,
  createEntryRoute,
} from "./routes";

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

// TODO: implement custom 404 & 500 handlers
app.get("/", async (_req: Request, res: Response) => {
  res.send("Hello World!");
});

app.use(searchRoute);
app.use(getTagsRoute);
app.use(getItemsRoute);
app.use(createEntryRoute);

app.listen(port, () => {
  console.log(`Hacky Skills Tracker API, listening on port ${port}`);
});
