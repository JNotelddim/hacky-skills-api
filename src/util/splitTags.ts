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
