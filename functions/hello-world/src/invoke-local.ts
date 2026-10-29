import { handler } from "./index.js";

const main = async () => {
  const result = await handler({}, {} as never, () => undefined);
  console.log("result:", JSON.stringify(result, null, 2));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
