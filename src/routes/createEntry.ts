import express, { Express, Request, Response } from "express";

import { createEntry, createOrUpdateTag } from "../database";
import { authenticateJWT } from "../middleware";
import { splitTags } from "../util";

export const createEntryRoute: Express = express();

/**
 * Endpoint allowing for the creation of entries.
 * Importantly, the tags submitted with the entries are separated
 * and inserted into their own table, and then the entries here are
 * inserted with just
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
