import { describe, it, expect } from "vitest";
import { mondayOf, addWeeks, currentWeekStart } from "@/lib/week";

describe("mondayOf", () => {
  it("returns the same date when given a Monday", () => {
    expect(mondayOf(new Date("2026-04-27T12:00:00Z"))).toBe("2026-04-27");
  });

  it("rolls back to Monday when given a Wednesday", () => {
    expect(mondayOf(new Date("2026-04-29T12:00:00Z"))).toBe("2026-04-27");
  });

  it("rolls back to Monday when given a Sunday", () => {
    expect(mondayOf(new Date("2026-05-03T12:00:00Z"))).toBe("2026-04-27");
  });
});

describe("addWeeks", () => {
  it("advances by one week", () => {
    expect(addWeeks("2026-04-27", 1)).toBe("2026-05-04");
  });

  it("rolls back by two weeks", () => {
    expect(addWeeks("2026-04-27", -2)).toBe("2026-04-13");
  });
});

describe("currentWeekStart", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(currentWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
