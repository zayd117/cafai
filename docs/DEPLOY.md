# Deploy

Caf.ai runs live on free plans: **Vercel Hobby** hosts the Next.js app and **Neon Free** hosts Postgres. GitHub Actions
(free for public repos) sets up the database and runs the hourly retention purge. Decided 2026-10-06 (REGISTER A-039).
Live at **https://cafai-xi.vercel.app**.

After the one-time setup below, every merge to `main` goes live by itself, and every pull request gets a Vercel
preview link.

## One-time setup (about 10 minutes)

Only the account owner can do steps 1 to 4. They create accounts and secrets in your name.

1. **Database.** Sign up at [neon.tech](https://neon.tech) with GitHub, on the Free plan. Create a project named `cafai`,
   keep the default Postgres version and pick the region *AWS US East (N. Virginia)*, which is closest to Vercel's
   default region. Click **Connect** and copy the connection string (it starts with `postgresql://`).
2. **Hosting.** Sign up at [vercel.com](https://vercel.com) with GitHub, on the Hobby plan. Click **Add New → Project**,
   import `zayd117/cafai` and click **Deploy**. The first deploy can't reach a database yet; step 5 fixes that.
3. **Vercel token.** In Vercel, open **Account Settings → Tokens**, create a token named `cafai-setup` and copy it.
4. **GitHub secrets.** In this repo, open **Settings → Secrets and variables → Actions** and add two repository secrets:
   - `DATABASE_ADMIN_URL`: the Neon connection string from step 1
   - `VERCEL_TOKEN`: the token from step 3

   If you named the Vercel project something other than `cafai`, also add a repository *variable* `VERCEL_PROJECT`
   with that name.
5. **Go live.** Open **Actions → set up production → Run workflow**, or ask Claude to run it. When it finishes, its
   summary shows the live address. Vercel adds a suffix such as `-xi` when `cafai.vercel.app` is taken; you can
   pick another free `.vercel.app` name under **Project → Settings → Domains**.

## What setup does

`scripts/deploy-db.ts setup` signs in with the Neon admin login and does the following:

- creates the three roles from plan §14: `cafai_owner` and `cafai_catalog` without logins, and `cafai_app` with one
- creates the `cafai` database, owned by `cafai_owner`
- applies the migrations as the owner
- publishes both catalog snapshots as the catalog role
- gives `cafai_app` a fresh random password

`scripts/deploy-vercel.ts apply` does the following:

- puts the app's connection string into Vercel as `DATABASE_URL`
- adds `CAFAI_CATALOG=fixture` and a random `QUOTA_SALT` if they are missing
- deploys `main` and checks that the site renders and reaches its database

The admin login stays in GitHub secrets. The running app only ever has `cafai_app`, which row-level security applies
to, the same as in development.

Setup is safe to run again. Each run gives the app a new database password and redeploys it with that password.

## Day to day

| What changes | What happens |
|---|---|
| Any merge to `main` | Vercel builds and deploys it (its GitHub integration) |
| A pull request | Vercel posts a preview link on the PR |
| `db/migrations/` or `catalog/` on `main` | The **deploy database** workflow applies migrations and publishes the catalog |
| Every hour | The **retention purge** workflow deletes expired runs, raw text and quota windows (plan §12) |

Migrations should only add things, such as new tables or nullable columns. Vercel can finish deploying the new code
a moment before the migration has run.

## Later: your own API key

Until a key is set, the site runs on the mock model and says so in the Sample mode banner. Model calls only cost money
once you add a key.

### First, test your keys cheaply

1. In Anthropic's console, buy a small amount of **prepaid credit** and leave **auto-reload off**. Calls stop when the
   credit runs out, so this is the hard limit on what a mistake can cost.
2. In this repo, open **Settings → Secrets and variables → Actions** and add the repository secret `ANTHROPIC_API_KEY`.
   Add `TYPESAFE_API_KEY` too if you have a Jev key.
3. Open **Actions → check AI → Run workflow**, or ask Claude to run it. It runs `npm run ai:check`:
   - First it checks each key with a lookup that is not billed. A bad key stops the run before anything is spent.
   - Then it runs 2 test searches (at most 4) on the sample tool list, through the same model settings as the site.
     It starts no new search once **max_usd** is spent (default $0.25, at most $1).
   - It prints each model call's tokens, time and cost, and how many searches $1 and the daily budget cover.
   - With a Jev key it also runs `npm run jev:smoke`, one Jev call that costs well under a cent.

The site's searches never use Jev yet; it is only checked here (REGISTER A-040).

### Then turn it on for the site

1. In Vercel, open **Project → Settings → Environment Variables** and add `ANTHROPIC_API_KEY` for Production.
2. Optionally change `CAFAI_DAILY_AI_BUDGET_USD` (default 1). The app turns AI off for the rest of the day once that
   much is spent (plan §14); calls whose model has no known price count at the highest known price.
3. Open **Deployments**, then **Redeploy** the latest production deployment.

Each search makes three Claude calls (understanding, judgment, explanation). They think at effort `medium`, `medium`
and `low` by default. `CAFAI_EFFORT_UNDERSTANDING`, `CAFAI_EFFORT_JUDGMENT` and `CAFAI_EFFORT_EXPLANATION` change that
(`low`, `medium`, `high`, `xhigh` or `max`; REGISTER A-025). Lower effort costs less, and check AI shows by how much.

When real catalog data exists (REGISTER A-006), change `CAFAI_CATALOG` from `fixture` to `real` and redeploy.

## Limits worth knowing

- Vercel Hobby is for personal, non-commercial use. Move to a paid plan once Caf.ai earns money.
- Neon Free pauses the database when nobody uses it. The first request after a quiet spell takes a moment longer.
- Previews use the same database as production.
- GitHub pauses scheduled workflows in public repos after 60 days without commits. If that happens, re-enable
  **retention purge** on the Actions tab.
- Terms and Privacy still say "Not written yet" (REGISTER A-038).
