import express, { Express, Request, Response } from "express";

import { createEntry, createOrUpdateTag } from "../database";
import { authenticateJWT } from "../middleware";
import { splitTags } from "../util";

export const createEntryRoute: Express = express();

/**
 * Endpoint allowing for the creation of entries.
 *
 * Please note that the tags and entries are stored in separate tables.
 * However, since the plain text of the tag (with some escaping and casing changes)
 * is being used as the partition-key of the tags table, we can make an
 * assumption about the tags' keys and create the `entry` item with the list of `tag` ids,
 * and then after the entry is created and we have the new entry id, we can ~safely~
 * create/update all of the tags with their `entries` arrays including this new log entry id.
 *
 * This also means that the tags can be inserted/updated in the database *after* the response
 * is sent back to the client.
 *
 * This is intended to follow a no-sql Two-Way Embedded relationship pattern between
 * "tags" and "entries", where each tag can have many entries, and each entry can have many tags.
 *
 * TODOs:
 * - safer error handling
 * - additional follow-up action of comparing new tags to existing ones
 *   (with something like https://www.npmjs.com/package/string-similarity),
 *   and send off "update prompts" to the user in slack where they can choose to merge
 *   their tag with an existing similar one.
 *   - oh this would actually be an additional request from the boltjs, but you get the point!
 */
createEntryRoute.post(
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
