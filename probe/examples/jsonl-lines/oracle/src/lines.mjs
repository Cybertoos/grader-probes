import { createReadStream } from "node:fs";
import { StringDecoder } from "node:string_decoder";

/**
 * Yield the lines of a JSONL file, split on "\n" only.
 *
 * node:readline also breaks on U+2028 and U+2029, which JSON allows raw inside
 * strings, so it cuts valid records in half.
 */
export async function* jsonlLines(file, { highWaterMark } = {}) {
  const decoder = new StringDecoder("utf8");
  let rest = "";
  for await (const chunk of createReadStream(file, highWaterMark ? { highWaterMark } : {})) {
    rest += decoder.write(chunk);
    let i;
    while ((i = rest.indexOf("\n")) !== -1) {
      yield rest.slice(0, i).replace(/\r$/, "");
      rest = rest.slice(i + 1);
    }
  }
  rest += decoder.end();
  if (rest) yield rest.replace(/\r$/, "");
}
