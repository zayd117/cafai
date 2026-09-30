// Labelling sheet: export layout, CSV round trip, strict import, case-file formatting (no network).
import { describe, expect, it } from "vitest";
import type { DiscoverCase } from "./bakeoff";
import { formatCase, parseCsv, readLabels, sheetCsv } from "./labels";
import type { Listing } from "./types";

const listing = (slug: string, description = `${slug} description`): Listing => ({ slug, name: slug, title: null, description, grade: null, grade_score: null, certified: false, category: null, price_micros: 0, url: `https://mcp.market/server/${slug}` });
const cases: DiscoverCase[] = [{ id: "c1", text: "my app" }, { id: "c2", text: "other", relevant: ["a"], irrelevant: ["b"] }];

describe("sheet export", () => {
  it("lists listings by slug with no rank, fills existing labels and neutralises formulas", () => {
    const csv = sheetCsv([{ c: cases[1]!, listings: [listing("b"), listing("a", '=HYPERLINK("x")'), listing("c")] }]);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["case_id", "need", "slug", "title", "description", "url", "label", "note"]);
    expect(rows.slice(1).map((r) => [r[2], r[6]])).toEqual([["a", "relevant"], ["b", "irrelevant"], ["c", ""]]);
    expect(rows[1]![4]).toBe(`'=HYPERLINK("x")`);
  });

  it("round-trips commas, quotes, newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,"b,""q""\nx",c\r\n1,2,3\r\n')).toEqual([["a", 'b,"q"\nx', "c"], ["1", "2", "3"]]);
    expect(() => parseCsv('a,"open')).toThrow();
  });
});

describe("sheet import", () => {
  const head = "case_id,slug,label\n";
  it("adds, moves and clears labels; blank changes nothing; other columns and order do not matter", () => {
    const r = readLabels(`label,Slug,extra,case_id\nrelevant,x,,c1\nIrrelevant,a,,c2\nunsure,b,,c2\n,z,,c2\n`, cases);
    expect(r.errors).toEqual([]);
    expect(r.changes.get("c1")).toEqual({ relevant: ["x"], irrelevant: [] });
    expect(r.changes.get("c2")).toEqual({ relevant: [], irrelevant: ["a"] });
    expect(r.counts).toEqual({ relevant: 1, irrelevant: 1, unsure: 1, blank: 1 });
  });

  it("rejects typos, unknown cases, bad slugs and conflicts, and applies nothing", () => {
    const r = readLabels(`${head}c1,ok,relevant\nc1,y,relvant\nnope,y,relevant\nc1,bad slug,relevant\nc1,d,relevant\nc1,d,irrelevant\n`, cases);
    expect(r.errors).toHaveLength(4);
    expect(r.errors[0]).toContain("line 3");
    expect(r.changes.size).toBe(0);
  });

  it("needs case_id, slug and label columns", () => {
    expect(readLabels("case_id,slug\nc1,x\n", cases).errors[0]).toContain("label");
  });
});

describe("case file layout", () => {
  it("matches the shipped style so importing labels does not rewrite the rest of the file", () => {
    const text = `{
  "id": "x",
  "interpretation": {
    "items": [
      { "id": "i0", "text": "A need" }
    ],
    "queries": [
      { "id": "q0", "item_id": "i0", "text": "words" }
    ]
  },
  "good_queries": ["a", "b"],
  "relevant": [],
  "irrelevant": ["s-1"]
}`;
    expect(formatCase(JSON.parse(text))).toBe(text);
  });
});
