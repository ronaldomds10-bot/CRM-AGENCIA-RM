import { expect, test } from "@playwright/test";
import { calculateEaster, opportunityFor } from "../src/lib/holidays";

test("calcula a Páscoa de 2026 e 2027", () => {
  expect(calculateEaster(2026)).toBe("2026-04-05");
  expect(calculateEaster(2027)).toBe("2027-03-28");
});

test("detecta feriadão e possível emenda", () => {
  expect(opportunityFor("2026-12-25")).toMatchObject({ kind: "LONG_WEEKEND", days: 3 });
  expect(opportunityFor("2027-04-21")).toBeNull();
  expect(opportunityFor("2027-09-07")).toMatchObject({ kind: "POSSIBLE_BRIDGE", days: 4 });
});
