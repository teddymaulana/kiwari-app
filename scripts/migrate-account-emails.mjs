// One-time migration: rename every warga login from `<unit>@kiwari.local`
// to `<unit>@kiwari.warga` (password unchanged), and for the pengurus
// units give each a brand-new `<unit>@kiwari.warga` resident-facing login
// (with a freshly generated password) while leaving their existing
// `<unit>@kiwari.local` pengurus login untouched.
//
// Run from the project root:
//   node --env-file=.env.local scripts/migrate-account-emails.mjs           (dry run — prints the plan, changes nothing)
//   node --env-file=.env.local scripts/migrate-account-emails.mjs --apply   (actually performs the changes)
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
// .env.local (same as src/lib/supabase/admin.ts).

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const PENGURUS_UNITS = new Set([
  "9r",
  "18g",
  "18x",
  "18z",
  "19b",
  "19j",
  "19k",
  "19n",
  "19p",
]);

const OLD_DOMAIN = "@kiwari.local";
const NEW_DOMAIN = "@kiwari.warga";

const CSV_PATH = path.join(process.cwd(), "warga_credentials.csv");

function genPassword() {
  // Same shape as the existing CSV passwords (6 lowercase letters), so
  // Kirim Info Login messages read consistently with the old ones.
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

async function listAllUsers(admin) {
  const users = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < perPage) break;
    page++;
  }
  return users;
}

// Rewrites one row's email column in-place, keeping every other column
// (including the password) exactly as-is. Matches findCredential's own
// regex in src/app/households/actions.ts.
function updateCsvEmail(csvLines, unitNo, newEmail) {
  const rowRe = /^([^,]+),("[^"]*"),([^,]+),([^,]*),(.+)$/;
  let changed = false;
  const updated = csvLines.map((line) => {
    const m = line.match(rowRe);
    if (!m || m[1].trim().toLowerCase() !== unitNo) return line;
    changed = true;
    return `${m[1]},${m[2]},${newEmail},${m[4]},${m[5]}`;
  });
  return { updated, changed };
}

// Adds a brand-new row for a pengurus unit that has no CSV row yet.
function upsertCsvRow(csvLines, unitNo, name, email, password) {
  const rowRe = /^([^,]+),("[^"]*"),([^,]+),([^,]*),(.+)$/;
  const idx = csvLines.findIndex((line) => {
    const m = line.match(rowRe);
    return m && m[1].trim().toLowerCase() === unitNo;
  });
  const row = `${unitNo.toUpperCase()},"${name}",${email},${password},OK`;
  if (idx === -1) {
    csvLines.push(row);
  } else {
    csvLines[idx] = row;
  }
}

async function main() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  console.log(APPLY ? "Running in APPLY mode.\n" : "Running in DRY RUN mode (pass --apply to actually change anything).\n");

  const users = await listAllUsers(admin);
  const byEmail = new Map(users.map((u) => [u.email?.toLowerCase(), u]));

  const renamePlan = []; // { user, localPart, newEmail }
  const dualLoginPlan = []; // { user, localPart, newEmail }

  for (const u of users) {
    const email = u.email ?? "";
    if (!email.toLowerCase().endsWith(OLD_DOMAIN)) continue;
    const localPart = email.slice(0, -OLD_DOMAIN.length).toLowerCase();
    const newEmail = `${localPart}${NEW_DOMAIN}`;

    if (PENGURUS_UNITS.has(localPart)) {
      if (byEmail.has(newEmail)) {
        console.log(`skip ${localPart}: ${newEmail} already exists`);
        continue;
      }
      dualLoginPlan.push({ user: u, localPart, newEmail });
    } else {
      if (byEmail.has(newEmail)) {
        console.log(`skip ${localPart}: ${newEmail} already exists`);
        continue;
      }
      renamePlan.push({ user: u, localPart, newEmail });
    }
  }

  console.log(`Plan: rename ${renamePlan.length} warga account(s), create ${dualLoginPlan.length} new pengurus dual-login account(s).\n`);

  let csvLines = [];
  try {
    csvLines = fs.readFileSync(CSV_PATH, "utf8").split("\n");
  } catch {
    console.log(`(no ${CSV_PATH} found — CSV won't be updated)`);
  }

  const newCredentials = []; // for the final printed/saved summary

  for (const { user, localPart, newEmail } of renamePlan) {
    console.log(`rename  ${user.email}  ->  ${newEmail}`);
    if (APPLY) {
      const { error } = await admin.auth.admin.updateUserById(user.id, { email: newEmail, email_confirm: true });
      if (error) {
        console.error(`  FAILED: ${error.message}`);
        continue;
      }
      if (csvLines.length) {
        const { updated } = updateCsvEmail(csvLines, localPart, newEmail);
        csvLines = updated;
      }
    }
  }

  for (const { user, localPart, newEmail } of dualLoginPlan) {
    const password = genPassword();
    console.log(`create  ${newEmail}  (new resident login for pengurus unit ${localPart.toUpperCase()})`);
    if (APPLY) {
      const { data, error } = await admin.auth.admin.createUser({
        email: newEmail,
        password,
        email_confirm: true,
      });
      if (error) {
        console.error(`  FAILED: ${error.message}`);
        continue;
      }

      // Link the new account to the same household as the pengurus login.
      const { data: profile } = await admin
        .from("profiles")
        .select("household_id")
        .eq("id", user.id)
        .single();

      if (profile?.household_id) {
        await admin
          .from("profiles")
          .update({ household_id: profile.household_id })
          .eq("id", data.user.id);
      }

      newCredentials.push({ unit: localPart, email: newEmail, password });

      if (csvLines.length) {
        const { data: household } = await admin
          .from("households")
          .select("name")
          .eq("id", profile?.household_id ?? "")
          .maybeSingle();
        upsertCsvRow(csvLines, localPart, household?.name ?? localPart.toUpperCase(), newEmail, password);
      }
    } else {
      newCredentials.push({ unit: localPart, email: newEmail, password: "(generated on apply)" });
    }
  }

  if (APPLY && csvLines.length) {
    fs.writeFileSync(CSV_PATH, csvLines.join("\n"));
    console.log(`\nUpdated ${CSV_PATH}`);
  }

  if (newCredentials.length) {
    console.log("\nNew pengurus dual-login credentials (save these somewhere safe):");
    for (const c of newCredentials) {
      console.log(`  ${c.unit.toUpperCase()}: ${c.email} / ${c.password}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only — nothing was changed. Re-run with --apply to execute.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
