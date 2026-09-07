#!/usr/bin/env node
/**
 * Refuses to let a bad jobs.json through.
 *
 *   node scripts/check-jobs.js
 *
 * The builder already applies these rules. This runs them again on the file
 * that is about to be published, because "every link goes to the company" is
 * the only promise this site makes, and a promise nothing checks is a wish.
 */
const fs = require("fs");
const path = require("path");
const { inIndia, forFreshers, fromEmployer } = require("./fetch-jobs.js");

const file = path.join(__dirname, "..", "jobs.json");
const j = JSON.parse(fs.readFileSync(file, "utf8"));

let bad = 0;
const fail = m => { console.error("  " + m); bad++; };

if (!Array.isArray(j.jobs)) fail("jobs is not a list");
if (!/^\d{4}-\d{2}-\d{2}$/.test(j.updated || "")) fail("no sensible updated date");

(j.jobs || []).forEach((row, i) => {
  const at = "job " + (i + 1) + " (" + (row.company || "?") + " — " + (row.title || "?") + "): ";
  if (!row.title) fail(at + "no title");
  if (!row.company) fail(at + "no company");
  if (!/^https:\/\//.test(row.url || "")) fail(at + "the link is not https");
  if (!fromEmployer(row)) fail(at + "the link is not the employer's own: " + row.url);
  if (!inIndia(row)) fail(at + "not in India: " + row.place);
  if (!forFreshers(row)) fail(at + "not a fresher role");
});

/* The same opening twice reads as a broken site. */
const seen = {};
(j.jobs || []).forEach(row => {
  if (seen[row.url]) fail("the same link twice: " + row.url);
  seen[row.url] = 1;
});

if (bad) {
  console.error("\n" + bad + " problem(s) — not publishing this.");
  process.exit(1);
}
console.log("jobs.json is clean: " + (j.jobs || []).length +
  " opening(s), every link the employer's own.");
