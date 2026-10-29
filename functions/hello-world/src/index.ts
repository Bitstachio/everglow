import type { Handler } from "aws-lambda";

/** Placeholder Lambda — proves the functions/ package builds and runs. */
export const handler: Handler = async (event) => {
  console.log("hello-world received event", JSON.stringify(event));

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello, World!" }),
  };
};
