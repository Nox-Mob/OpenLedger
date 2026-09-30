import { describe, expect, it } from "vitest";
import { addDays, daysBetween, fiscalYearEnd, fiscalYearStart, isISODate, todayISO } from "./dates";

describe("dates", () => {
  it("todayISO uses local time, not UTC", () => {
    // 11:30pm on March 31 local time must still be March 31.
    const lateNight = new Date(2026, 2, 31, 23, 30);
    expect(todayISO(lateNight)).toBe("2026-03-31");
    const justAfterMidnight = new Date(2026, 3, 1, 0, 5);
    expect(todayISO(justAfterMidnight)).toBe("2026-04-01");
  });

  it("addDays crosses month, year and leap day", () => {
    expect(addDays("2026-03-31", 1)).toBe("2026-04-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09"); // US DST change
  });

  it("daysBetween ignores DST", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-11-02", "2026-10-31")).toBe(-2);
  });

  it("fiscal year boundaries", () => {
    expect(fiscalYearStart("2026-06-30", 7)).toBe("2025-07-01");
    expect(fiscalYearStart("2026-07-01", 7)).toBe("2026-07-01");
    expect(fiscalYearStart("2026-03-31", 1)).toBe("2026-01-01");
    expect(fiscalYearEnd("2026-07-01", 7)).toBe("2027-06-30");
    expect(fiscalYearEnd("2026-05-01", 1)).toBe("2026-12-31");
  });

  it("validates real calendar dates", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-3-1")).toBe(false);
  });
});
