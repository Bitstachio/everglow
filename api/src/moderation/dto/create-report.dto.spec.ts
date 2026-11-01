import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ReportReason } from "generated/prisma/client";
import { REPORT_NOTE_MAX_LENGTH } from "../moderation.constants";
import { CreateReportDto } from "./create-report.dto";

const parse = (note: unknown) => {
  const dto = plainToInstance(CreateReportDto, { reason: ReportReason.OTHER, note });
  return { dto, errors: validateSync(dto).flatMap((error) => Object.keys(error.constraints ?? {})) };
};

describe("CreateReportDto.note", () => {
  it("is trimmed", () => {
    const { dto, errors } = parse("  Not okay for a family album \n");

    expect(errors).toEqual([]);
    expect(dto.note).toBe("Not okay for a family album");
  });

  it("keeps newlines inside the note", () => {
    const { dto, errors } = parse("First line\nSecond line");

    expect(errors).toEqual([]);
    expect(dto.note).toBe("First line\nSecond line");
  });

  it("may be left out", () => {
    expect(parse(undefined).errors).toEqual([]);
  });

  it.each([
    ["empty", ""],
    ["only spaces", "   "],
    ["only whitespace and newlines", " \n\t \n "],
  ])("is refused when %s", (_label, note) => {
    expect(parse(note).errors).toContain("isNotEmpty");
  });

  it.each([
    ["a NUL", "a\u0000b"],
    ["a tab", "a\tb"],
    ["a carriage return", "a\rb"],
    ["an escape", "a\u001bb"],
    ["a DEL", "a\u007fb"],
    ["a C1 control", "a\u0085b"],
  ])("is refused with %s inside", (_label, note) => {
    expect(parse(note).errors).toContain("matches");
  });

  it("accepts emoji and accented letters", () => {
    expect(parse("Très déplacé 🙁").errors).toEqual([]);
  });

  it("is measured after trimming", () => {
    expect(parse(` ${"x".repeat(REPORT_NOTE_MAX_LENGTH)} `).errors).toEqual([]);
    expect(parse("x".repeat(REPORT_NOTE_MAX_LENGTH + 1)).errors).toContain("maxLength");
  });

  it("is refused when it is not a string", () => {
    expect(parse(42).errors).toContain("isString");
  });
});
