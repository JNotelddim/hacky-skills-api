import {
  AttributeValue,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { uid } from "uid";
import {
  ENTRIES_KEY,
  ENTRIES_TABLE,
  EntryType,
  TAGS_KEY,
  TAGS_TABLE,
} from "../config/const";

import { client } from "../index";

/**
 * When creating tags in the db, we want to let existing tags
 * take precendence over new ones.
 */
export const createOrUpdateTag = async (tag: string, entryId: string) => {
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
export const createEntry = async (body: Record<string, any>) => {
  const { title, description, tags, startDate, endDate, userId } = body;

  const newItem: Record<string, AttributeValue> = {
    [ENTRIES_KEY]: { S: uid() },
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
