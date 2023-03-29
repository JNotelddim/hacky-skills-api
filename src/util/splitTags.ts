/**
 * Splits a string of tags ex/ "test,rest,best" into an array
 * of strings ["test", "rest", "best"]. Also perform some basic escape characters.
 *
 * TODO:
 * - fix overly-aggressive escaping: ex/ `New-Tag` gets stripped down to `newtag`,
 *   but I'd like to support dashes :thinking:
 */
export const splitTags = (input: string) => {
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
