import { describe, expect, it } from "vitest";
import type { Offering } from "@/catalog/types";
import { accessShort, costLabel, effortShort, forClient, pickState, skipLine, startsInOrder, vendorShort, whenLine } from "./cardCopy";

const offering = (over: { access?: Partial<Offering["access"]>; cost?: Partial<Offering["cost"]>; identity?: Partial<Offering["identity"]> } = {}) =>
  ({
    identity: { display_name: "Find out when your app crashes, and why", vendor: "Sentry", ...over.identity },
    access: { auth: "oauth", read_write: "read_write", access_plain: "Can see your crash reports. Can change settings if you allow it.", effort_plain: "About 20 minutes. Needs a free Sentry account.", ...over.access },
    cost: { model: "free", source_url: "https://example.com", as_of: "2026-10-06", ...over.cost },
  }) as Offering;

describe("pick card copy", () => {
  it("turns need and confidence into one decision", () => {
    expect(pickState({ confidence_band: "high", do_you_need_it: "needed_now" })).toBe("now");
    expect(pickState({ confidence_band: "medium", do_you_need_it: "useful_later" })).toBe("later");
    expect(pickState({ confidence_band: "low", do_you_need_it: "needed_now" })).toBe("maybe");
    expect(pickState({ confidence_band: "high", do_you_need_it: "probably_not" })).toBe("maybe");
  });

  it("starts only Add now picks in the order", () => {
    expect(startsInOrder({ confidence_band: "high", do_you_need_it: "needed_now" })).toBe(true);
    expect(startsInOrder({ confidence_band: "high", do_you_need_it: "useful_later" })).toBe(false);
    expect(startsInOrder({ confidence_band: "low", do_you_need_it: "needed_now" })).toBe(false);
  });

  it("names the person's AI tool only when they named exactly one", () => {
    expect(forClient("Your AI reads it and lets your AI tool fix it.", ["Claude Code"])).toBe("Claude Code reads it and lets Claude Code fix it.");
    expect(forClient("Your AI reads it.", [])).toBe("Your AI reads it.");
    expect(forClient("Your AI reads it.", ["Claude Code", "Cursor"])).toBe("Your AI reads it.");
    expect(forClient("Your AIs differ.", ["Cursor"])).toBe("Your AIs differ.");
  });

  it("drops the old prefixes the labels now say", () => {
    expect(whenLine("Add it later, once you share your app with testers.")).toBe("Later, once you share your app with testers.");
    expect(whenLine("Add it now if your report stays in Google Sheets.")).toBe("Now if your report stays in Google Sheets.");
    expect(whenLine("Once you share your app with testers.")).toBe("Once you share your app with testers.");
    expect(skipLine("Skip it if you already get crash reports.")).toBe("You already get crash reports.");
    expect(skipLine("Skip it if: SAMPLE skip condition")).toBe("SAMPLE skip condition");
    expect(skipLine("You already chose Firebase.")).toBe("You already chose Firebase.");
  });

  it("builds the facts line from the short fields, falling back for older snapshots", () => {
    const old = offering();
    expect([vendorShort(old), costLabel(old), effortShort(old)]).toEqual(["Sentry", "Free", "About 20 min"]);
    // An older Shopify entry is free on top of a paid plan, so the fallback never guesses "Free plan".
    expect(costLabel(offering({ cost: { plan_required: "Your usual Shopify plan; nothing extra for the connector" } }))).toBe("Free");
    expect(costLabel(offering({ cost: { model: "paid" } }))).toBe("Paid");
    expect(effortShort(offering({ access: { effort_plain: "No sign-up needed." } }))).toBe("");
    const now = offering({
      identity: { vendor: "U.S. Department of Agriculture (USDA)", vendor_short: "USDA" },
      access: { effort_short: "About 5 min", access_short: "Only public food data." },
      cost: { label: "Free" },
    });
    expect([vendorShort(now), costLabel(now), effortShort(now), accessShort(now)]).toEqual(["USDA", "Free", "About 5 min", "Only public food data."]);
    expect(accessShort(old)).toBe(old.access.access_plain);
  });
});
