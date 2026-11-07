import { cn } from "./cn";

test("keeps a type-scale size beside a colour", () => {
  expect(cn("font-sans text-body", "text-pencil")).toBe("font-sans text-body text-pencil");
  expect(cn("text-text-button", "text-edge")).toBe("text-text-button text-edge");
});

test("a later size or colour still wins", () => {
  expect(cn("text-body", "text-name")).toBe("text-name");
  expect(cn("text-text", "text-edge")).toBe("text-edge");
});
