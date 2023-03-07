var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { DynamoDBClient, ScanCommand, PutItemCommand, } from "@aws-sdk/client-dynamodb";
import express from "express";
import { nanoid } from "nanoid";
import { config } from "dotenv";
// Load in Env Vars
config();
// Init app instance
const app = express();
const port = 3000;
app.use(express.json());
/** DynamoInit */
const client = new DynamoDBClient({ region: "us-east-2" });
/** Express endpoints **/
app.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.send("Hello World!");
}));
app.get("/items", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const listItemsCommand = new ScanCommand({
        TableName: "hacky-skills-data",
    });
    try {
        const results = yield client.send(listItemsCommand);
        (_a = results.Items) === null || _a === void 0 ? void 0 : _a.forEach((item) => {
            console.log({ item, keys: Object.keys(item) });
        });
    }
    catch (err) {
        console.error(err);
    }
    res.send("Items!");
}));
app.post("/createEntry", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { title, description, tags, date } = req.body;
    const newItem = {
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
        const response = yield client.send(putItemCommand);
        console.log({ response });
    }
    catch (err) {
        console.error(err);
    }
    res.send("new Entry , ...");
}));
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
