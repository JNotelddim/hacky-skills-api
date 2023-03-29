import { AttributeValue } from "@aws-sdk/client-dynamodb";

export type AttributeValueValue = string | boolean | number | string[];

/**
 * Takes an object of shape:
 * {
 *      attribName1: { S: "stringValue" },
 *      attribName2: { SS: { "string", "set"} },
 *      attribName3: { B: false },
 * }
 * and converts to a regular key-value object like:
 * {
 *      attribName1: "stringValue",
 *      attribName2: [ "string", "set" ],
 *      attribName3: false,
 * }
 *
 */
export const convertAttributeValueToPlainObject = (
  item: Record<string, AttributeValue>
) => {
  let result: Record<string, AttributeValueValue> = {};
  Object.keys(item).map((key) => {
    result[key] = Object.values(item[key])[0];
  });

  return result;
};
