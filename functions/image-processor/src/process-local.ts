import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createDerivatives } from "./derivatives.js";

const DEFAULT_OUT_DIR = path.join(process.cwd(), "tmp", "derived");

const main = async () => {
  const inputArgument = process.argv[2];
  if (!inputArgument) throw new Error("Usage: pnpm process-local <input-image> [output-directory]");
  const inputPath = path.resolve(inputArgument);
  const outDir = path.resolve(process.argv[3] ?? DEFAULT_OUT_DIR);

  const input = await readFile(inputPath);
  const derivatives = await createDerivatives(input);

  await mkdir(outDir, { recursive: true });
  const thumbPath = path.join(outDir, "thumb.webp");
  const largePath = path.join(outDir, "large.jpg");

  await writeFile(thumbPath, derivatives.thumbWebp);
  await writeFile(largePath, derivatives.largeJpeg);

  console.log("image-processor wrote derivatives", {
    input: inputPath,
    inputBytes: input.byteLength,
    width: derivatives.width,
    height: derivatives.height,
    thumb: { path: thumbPath, bytes: derivatives.thumbWebp.byteLength },
    large: { path: largePath, bytes: derivatives.largeJpeg.byteLength },
  });
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
