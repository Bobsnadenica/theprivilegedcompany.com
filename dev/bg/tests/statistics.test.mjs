import assert from "node:assert/strict";
import test from "node:test";
import { chartScale, periodChange } from "../app/statistics.ts";

test("процентни пунктове, относителна промяна и нулева база", () => {
  assert.equal(periodChange(50, 75, "п.п."), 25);
  assert.equal(periodChange(50, 75, "%"), 50);
  assert.equal(periodChange(-2, 3, "п.п."), 5);
  assert.equal(periodChange(0, 3, "%"), null);
  assert.equal(periodChange(70, 75, "години"), 5);
});

test("скалата побира спадове, константи и една година без измислени връзки", () => {
  for (const values of [[-3, 0, 5], [70, 70], [0], [6_400_000]]) {
    const rows = values.map((value, i) => ({ year: String(2020 + i), value }));
    for (const zero of [false, true]) {
      const scale = chartScale(rows, zero);
      assert.ok(scale.max > scale.min);
      assert.ok(scale.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.y >= 32 && point.y <= 222));
      if (zero) assert.ok(scale.min <= 0 && scale.max >= 0);
    }
  }
  const gaps = chartScale([{ year: "2020", value: 1 }, { year: "2022", value: 2 }], false);
  assert.equal(gaps.path.split("M").length - 1, 2);
  assert.ok(!gaps.path.includes("L"));
});
