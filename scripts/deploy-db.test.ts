// URL handling for the production database steps (scripts/deploy-db.ts). The steps themselves need their own cluster
// with a non-superuser admin login (the shared test cluster's roles already exist), so they are checked by hand there.
import { describe, expect, it } from "vitest";
import { adminUrl, appUrl } from "./deploy-db";

const neon = "postgresql://neondb_owner:npg_secret@ep-cool-dew-a1b2c3-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("adminUrl", () => {
  it("moves a Neon pooled URL to the direct endpoint and keeps its parameters", () => {
    const u = new URL(adminUrl(neon));
    expect(u.hostname).toBe("ep-cool-dew-a1b2c3.us-east-2.aws.neon.tech");
    expect(u.pathname).toBe("/neondb");
    expect(u.searchParams.get("sslmode")).toBe("require");
    expect(u.searchParams.get("channel_binding")).toBe("require");
    expect(u.username).toBe("neondb_owner");
  });
  it("switches database and adds sslmode for remote hosts that lack it", () => {
    const u = new URL(adminUrl("postgres://admin:pw@db.example.com:5432/postgres", "cafai"));
    expect(u.pathname).toBe("/cafai");
    expect(u.port).toBe("5432");
    expect(u.searchParams.get("sslmode")).toBe("require");
  });
  it("leaves local URLs without sslmode", () => {
    expect(new URL(adminUrl("postgres://admin:pw@localhost:5433/sim", "cafai")).search).toBe("");
  });
});

describe("appUrl", () => {
  it("logs in as cafai_app to the cafai database on Neon's pooler", () => {
    const u = new URL(appUrl(neon, "Abc_123-xyz"));
    expect(u.username).toBe("cafai_app");
    expect(u.password).toBe("Abc_123-xyz");
    expect(u.hostname).toBe("ep-cool-dew-a1b2c3-pooler.us-east-2.aws.neon.tech");
    expect(u.pathname).toBe("/cafai");
    expect(u.searchParams.get("sslmode")).toBe("require");
  });
  it("keeps other hosts as they are", () => {
    expect(new URL(appUrl("postgres://admin:pw@localhost:5433/sim", "p")).host).toBe("localhost:5433");
  });
});
