#!/usr/bin/env node
/**
 * Builds jobs.json from the employers listed in sources.json.
 *
 *   node scripts/fetch-jobs.js
 *   node scripts/fetch-jobs.js --from <dir>   read saved feeds instead of the network
 *
 * No dependencies, on purpose: this project has no npm install, and the
 * machine it was written on cannot reach the npm registry anyway.
 *
 * Three rules decide what gets published, and the first is the whole point:
 *
 *   1. It came from the employer's own applicant-tracking system. Not a form,
 *      not a WhatsApp number, not a Gmail address. Almost every fresher scam
 *      in India depends on routing the applicant somewhere the company does
 *      not control, so refusing every other source removes them by
 *      construction rather than by judgement.
 *   2. It is in India.
 *   3. The title says it is for someone starting out, and does not say
 *      otherwise. Deliberately narrow: missing a job wastes nobody's evening,
 *      and sending a fresher to a role wanting eight years wastes theirs.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const UA = "fresher-jobs/1.0 (+https://github.com/hedaprateek/fresher-jobs)";

/* ---------------------------------------------------------------- feeds */

const FEED = {
  greenhouse: t => "https://boards-api.greenhouse.io/v1/boards/" + t + "/jobs",
  ashby: t => "https://api.ashbyhq.com/posting-api/job-board/" + t,
  lever: t => "https://api.lever.co/v0/postings/" + t + "?mode=json"
};

/** Every ATS answers in its own shape; this is the only place that knows. */
const READ = {
  greenhouse: (j, c) => (j.jobs || []).map(o => ({
    title: o.title || "",
    place: ((o.location || {}).name || "").trim(),
    url: o.absolute_url || "",
    posted: (o.first_published || o.updated_at || "").slice(0, 10),
    company: c.name, site: c.site || ""
  })),
  ashby: (j, c) => (j.jobs || []).filter(o => o.isListed !== false).map(o => ({
    title: o.title || "",
    place: [o.location, ((o.address || {}).postalAddress || {}).addressCountry]
      .filter(Boolean).join(", ").trim(),
    url: o.applyUrl || o.jobUrl || "",
    posted: (o.publishedAt || "").slice(0, 10),
    company: c.name, site: c.site || ""
  })),
  lever: (j, c) => (Array.isArray(j) ? j : []).map(o => ({
    title: o.text || "",
    place: ((o.categories || {}).location || "").trim(),
    url: o.hostedUrl || o.applyUrl || "",
    posted: o.createdAt ? new Date(o.createdAt).toISOString().slice(0, 10) : "",
    company: c.name, site: c.site || ""
  }))
};

/* ---------------------------------------------------------------- rules */

const INDIA = /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|chennai|delhi|gurgaon|gurugram|noida|kolkata|ahmedabad|jaipur|indore|kochi|coimbatore|thiruvananthapuram|trivandrum|nagpur|vadodara|surat|chandigarh|bhubaneswar|mysuru|mysore)\b/i;

const FRESHER = /\b(intern|internship|trainee|graduate|new ?grad|campus|fresher|apprentice|entry[ -]level|associate engineer|engineer\s*(i|1)\b|analyst\s*(i|1)\b|junior|jr\.?)\b/i;

/* Whatever the rest of the title claims, these words win. "Senior Graduate
   Engineer Trainee" is not a fresher role. */
const SENIOR = /\b(senior|staff|principal|lead|manager|director|head of|vp|architect|sr\.?|ii|iii|iv|[3-9]\+? ?years)\b/i;

/* Only ever an address the employer's own hiring system serves. Greenhouse and
   Lever both run EU hosts as well as the main ones, which a first version of
   this missed - Groww's listings are on job-boards.eu.greenhouse.io and were
   being thrown away as untrusted. */
const TRUSTED = /^https:\/\/((boards|job-boards)(\.eu)?\.greenhouse\.io|jobs\.ashbyhq\.com|jobs(\.eu)?\.lever\.co)\//;

function inIndia(j) { return INDIA.test(j.place); }
function forFreshers(j) { return FRESHER.test(j.title) && !SENIOR.test(j.title); }

/* Some boards hand the applicant back to the company's own careers page -
   Stripe's Greenhouse listings point at stripe.com. That is still the employer
   itself, so a company may name its own domain in sources.json and links to it
   are accepted. Nothing else is. */
function fromEmployer(j) {
  if (TRUSTED.test(j.url)) return true;
  if (!j.site) return false;
  const m = /^https:\/\/([^/]+)\//.exec(j.url);
  if (!m) return false;
  const host = m[1].toLowerCase().replace(/^www\./, "");
  const site = String(j.site).toLowerCase().replace(/^www\./, "");
  return host === site || host.endsWith("." + site);
}

/* ---------------------------------------------------------------- fetch */

function get(url) {
  return new Promise(resolve => {
    const req = https.get(url, { timeout: 20000, headers: { "user-agent": UA } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location));
      }
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => resolve({ code: res.statusCode, body: d }));
    });
    req.on("error", e => resolve({ code: 0, body: "", err: e.code || e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ code: -1, body: "", err: "timeout" }); });
  });
}

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "sources.json"), "utf8"));
  const fromDir = (() => {
    const i = process.argv.indexOf("--from");
    return i > -1 ? process.argv[i + 1] : null;
  })();

  const all = [];
  const live = [];
  const dead = [];

  for (const c of cfg.companies) {
    let body = null;
    if (fromDir) {
      const f = path.join(fromDir, c.ats + "-" + c.token + ".json");
      if (fs.existsSync(f)) body = fs.readFileSync(f, "utf8");
    } else {
      const r = await get(FEED[c.ats](c.token));
      if (r.code === 200) body = r.body;
      else dead.push(c.name + " (" + c.ats + "/" + c.token + ") " + (r.err || "HTTP " + r.code));
      // Polite: these are somebody else's servers and nothing here is urgent.
      await new Promise(r2 => setTimeout(r2, 250));
    }
    if (!body) { if (fromDir) dead.push(c.name + " (no saved feed)"); continue; }

    let rows;
    try { rows = READ[c.ats](JSON.parse(body), c); }
    catch (e) { dead.push(c.name + " (unreadable feed)"); continue; }

    live.push(c.name);
    rows.forEach(j => all.push(j));
  }

  const india = all.filter(inIndia);
  const fresher = india.filter(forFreshers);
  const refused = fresher.filter(j => !fromEmployer(j));
  const kept = fresher.filter(fromEmployer)
    .sort((a, b) => (b.posted || "").localeCompare(a.posted || "") ||
                    a.company.localeCompare(b.company));

  /* Nothing that failed the address rule may ever reach the file. Checked
     again here rather than trusted, because this is the one rule the whole
     thing rests on. */
  const bad = kept.filter(j => !fromEmployer(j));
  if (bad.length) throw new Error(bad.length + " listing(s) not from an employer's own system");

  const out = {
    updated: new Date().toISOString().slice(0, 10),
    checked: live.length,
    scanned: all.length,
    inIndia: india.length,
    jobs: kept
  };
  fs.writeFileSync(path.join(ROOT, "jobs.json"), JSON.stringify(out, null, 1) + "\n");

  console.log("read " + live.length + " of " + cfg.companies.length + " boards");
  console.log("  " + all.length + " openings, " + india.length + " in India, " +
              kept.length + " for freshers");
  if (refused.length) {
    console.log("  " + refused.length + " refused - the apply link is not the employer's:");
    refused.forEach(j => console.log("    " + j.company + ": " + j.url));
  }
  if (dead.length) {
    console.log("  skipped " + dead.length + " board(s): " +
      dead.map(d => d.split(" (")[0]).join(", "));
  }
  console.log("wrote jobs.json");
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { inIndia, forFreshers, fromEmployer, READ, INDIA, FRESHER, SENIOR, TRUSTED };
