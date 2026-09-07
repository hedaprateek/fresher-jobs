# Fresher Jobs

Entry-level roles and internships in India, read from each employer's own
hiring system.

**Live:** https://hedaprateek.github.io/fresher-jobs/

## The idea

Aggregating job listings is easy. The hard word in "genuine fresher job
openings" is *genuine* — fresher hiring in India is thick with listings that
exist to collect a registration fee, a training fee or a security deposit.

So this site does not judge listings one at a time. It only reads employers'
own applicant-tracking systems, and a listing is published only if its apply
link goes back to one:

| Rule | Why |
|---|---|
| Came from the employer's own ATS | Almost every fresher scam depends on routing the applicant somewhere the company does not control. Refusing every other source removes them by construction. |
| Located in India | The audience. |
| The title says entry-level | Intern, trainee, graduate, campus, apprentice, junior — and not senior, lead, staff, or anything with a years-of-experience number. |

`scripts/check-jobs.js` runs those rules again against the finished file and
fails the build rather than publish something that breaks them. The page checks
a third time in the browser before it renders a link, because that promise is
the only thing this site is offering.

## The honest problem: volume

On the first run, across **4,573 openings from 24 company boards, 426 of them in
India, exactly 4 were fresher roles.**

That is not a bug in the filter. The companies that hire Indian freshers in
volume — TCS, Infosys, Wipro, Cognizant, Accenture, Capgemini, LTIMindtree —
do not use Greenhouse, Lever or Ashby. They run their own portals (TCS NextStep
and the rest), and each needs a connector written for it. The same is true of
the government and PSU notifications that matter enormously to this audience:
NCS, SSC, banking, railways.

So the honest state of this project: the trust model works and the pipeline
works, and the list is nearly empty until those sources are added. Two ways
forward, and both are worth doing:

1. **More companies.** The cheapest win. Add board tokens to `sources.json`; a
   dead one is skipped with a note rather than breaking the run.
2. **The mass recruiters and government boards.** The real answer, and real
   work — one connector each, none of them a tidy JSON feed.

## Adding a company

Find the employer's board and take the token out of the URL:

```
boards.greenhouse.io/postman     ->  { "ats": "greenhouse", "token": "postman" }
jobs.ashbyhq.com/sarvam          ->  { "ats": "ashby",      "token": "sarvam"  }
jobs.lever.co/example            ->  { "ats": "lever",      "token": "example" }
```

Add it to `companies` in `sources.json`. If that employer sends applicants to
its own careers page instead of the board — Stripe does — add its domain so the
link is still recognised as the employer's:

```json
{ "ats": "greenhouse", "token": "stripe", "name": "Stripe", "site": "stripe.com" }
```

Then either push, or run **Actions → Refresh openings → Run workflow**.

## How it runs

`.github/workflows/refresh.yml` rebuilds `jobs.json` every morning and on any
change to the sources or the script, and commits it only if something actually
changed. GitHub Pages serves the result.

To run it locally you need to be able to reach the boards:

```sh
node scripts/fetch-jobs.js          # read every board, write jobs.json
node scripts/check-jobs.js          # refuse a bad file
node scripts/fetch-jobs.js --from <dir>   # rebuild from saved feeds, offline
```

## What this deliberately does not do

- **No scraping of Naukri, LinkedIn or Indeed.** It breaks their terms, their
  anti-bot measures are serious, and a site whose whole pitch is
  trustworthiness should not start by breaking somebody's terms of service.
- **No auto-apply.** It violates ATS terms, buries recruiters in junk, and the
  person whose name is on the application is the one who wears it.
- **No accounts, no personal data.** Nothing here collects anything about the
  people using it, which keeps it clear of the DPDP Act entirely.
- **No paid placement.** The moment a listing can be bought, the ordering stops
  meaning anything, and the ordering is the product.

## Files

```
index.html            the page
jobs.json             generated — the current openings
sources.json          the employers to read, and the only file you normally edit
scripts/fetch-jobs.js reads every board, applies the rules, writes jobs.json
scripts/check-jobs.js refuses to publish a file that breaks them
```

No dependencies, no build step, no npm install.
