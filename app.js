const {
  DynamoDBClient,
  ListTablesCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/client-dynamodb");
const express = require("express");
const app = express();
const port = 3000;

app.use(express.json());

/** DynamoInit */
const client = new DynamoDBClient({ region: "us-east-2" });

// (async () => {
//   const command = new ListTablesCommand({});
//   console.log("attempting to send command to client");
//   try {
//     const results = await client.send(command);
//     console.log(results.TableNames.join("\n"));
//   } catch (err) {
//     console.error(err);
//   }
// })();

/** Express endpoints */

app.get("/", async (req, res) => {
  res.send("Hello World!");
});

app.get("/items", async (req, res) => {
  const listItemsCommand = new ScanCommand({
    TableName: "hacky-skills-data",
  });
  try {
    const results = await client.send(listItemsCommand);
    results.Items.forEach((item) => {
      console.log({ item, keys: Object.keys(item) });
    });
  } catch (err) {
    console.error(err);
  }

  res.send("Items!");
});

app.post("/createEntry", (req, res) => {
  const { title, description, tags, date } = req.body;
  console.log({ title, description, tags, date });

  res.send("new Entry , ...");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
