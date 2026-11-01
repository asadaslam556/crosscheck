import { describe, expect, it } from "vitest";

import { snapshotPath } from "./api";
import { dec, interval, month, pct, pp, pValue, signed } from "./format";

describe("snapshotPath", () => {
  // Must stay in step with snapshot_name() in backend/scripts/export_snapshot.py.
  it("is the bare endpoint without parameters", () => {
    expect(snapshotPath("overview")).toBe("overview.json");
  });

  it("sorts parameters by name", () => {
    expect(snapshotPath("segments", { dimension: "country", by: "model_version" })).toBe(
      "segments__by-model_version__dimension-country.json",
    );
  });

  it("drops parameters that are not set", () => {
    expect(snapshotPath("agreement", { exclude_family: undefined })).toBe("agreement.json");
  });
});

describe("format", () => {
  it("formats rates, statistics and differences", () => {
    expect(pct(0.5232)).toBe("52.3%");
    expect(dec(0.68852)).toBe("0.689");
    expect(pp(-0.017)).toBe("−1.7 pp");
    expect(signed(7.75)).toBe("+7.8");
  });

  it("shows a dash for missing values instead of NaN", () => {
    expect(pct(null)).toBe("–");
    expect(dec(undefined)).toBe("–");
    expect(interval(null)).toBe("–");
  });

  it("names months", () => {
    expect(month("2025-09-01")).toBe("Sep 2025");
    expect(month("2026-01", true)).toBe("Jan 26");
  });

  it("does not print a p-value of zero", () => {
    expect(pValue(1e-9)).toBe("p < 0.001");
    expect(pValue(0.0432)).toBe("p = 0.043");
  });
});
