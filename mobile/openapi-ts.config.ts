import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../api/openapi/openapi.json",
  output: {
    path: "./lib/api/generated",
    postProcess: ["prettier"],
  },
  plugins: [
    {
      name: "@hey-api/client-axios",
      runtimeConfigPath: "./lib/api/hey-api.config",
    },
    {
      name: "@hey-api/sdk",
      auth: false,
    },
    "@hey-api/typescript",
    {
      name: "@tanstack/react-query",
      queryOptions: true,
      queryKeys: true,
      mutationOptions: true,
    },
  ],
});
