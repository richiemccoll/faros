# Faros, modern frontend performance testing

> Faros comes from the Greek word (Φάρος) which means "lighthouse".

## Introduction

Faros is a Node.js native performance testing library built on top of Lighthouse.

The context for why I've build this library: it's something that has been in the back of my head since my time at DAZN (~2019-ish). Performance is one of the areas in software engineering that I find the most interesting. Even now in 2025, I see the same problems on different client projects with performance tooling/performance maturity again and again.

The main principle behind the library is to treat **web performance like tests, not one-off audits**.

I've been using Lighthouse for a long time, and while it's a great tool for ad-hoc audits, I see time and time again, that it's only really used in "fire fighting" situations when stakeholders notice that the "website is too slow".

Using Lighthouse on it's own in the lab, just doesn't work for repeatable budgets and CI. for example it's difficult to encode “don’t regress more than 10% on LCP vs this previous baseline”.

So I wanted to build something that is

- **Assertions-first**: budgets and regressions as code.
- **Node.js native**: programmatic API first, CLI second.
- **Composable**: can integrate with other tools at any stage of the development process (local / CI).
- **Industry Standards**: Lean on the industry default metrics - i.e Core Web Vitals

---

## Getting Started

### CLI

#### Basic Configuration

The easiest way to get started is to set up the configuration file. Let's call it `perf.config.json`.

```json
{
  "targets": [
    {
      "id": "home",
      "url": "https://richiemccoll.com",
      "name": "Homepage"
    }
  ],
  "defaultProfile": "mobileSlow3G",
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "cls": { "max": 0.1 },
      "fid": { "max": 500 },
      "tbt": { "max": 300 },
      "fcp": { "max:": 2500 },
      "performanceScore": { "min": 90 }
    }
  }
}
```

This config is relatively straight forward, it will run against the target URL and assert that the Lighthouse result metrics for **Page Load** pass the assertions defined.

There are two ways that we could run this, via the CLI or in a Node.js script.

- `faros run --config perf.config.json`

```
✓ PASSED Performance Test Results (15.6s)

id     | URL                      | Status | LCP    | CLS    | FID    | TBT    | FCP    | INP    | Score
-------+--------------------------+--------+--------+--------+--------+--------+--------+--------+-------
Profile: mobileSlow3G
-------+--------------------------+--------+--------+--------+--------+--------+--------+--------+-------
home   | https://richiemccoll.com | PASS   | 1149ms | 0.000  | 225ms  | 207ms  | 1149ms | -      | 96

Tasks: 1 total, 1 completed, 0 failed
```

By default, this will use the CLI reporter. You can override this if you prefer the output in a JSON file that can be consumed by other tools.

- `faros run --config perf.config.json --format json --quiet > output.json`

#### Multiple Targets

Okay, so that's a basic how to get started. Let's make it a bit more interesting.

Let's imagine that we have a set of URL's that we want to test against, let's add some more targets.

```json
{
  "targets": [
    {
      "id": "home",
      "url": "https://richiemccoll.com",
      "name": "Homepage"
    },
    {
      "id": "blog-post",
      "url": "https://richiemccoll.com/on-demand-code-review-with-chatgpt/",
      "name": "Blog Post"
    },
    {
      "id": "about",
      "url": "https://richiemccoll.com/about/",
      "name": "About"
    }
  ],
  "defaultProfile": "mobileSlow3G",
  "concurrency": 1,
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "cls": { "max": 0.1 },
      "performanceScore": { "min": 90 }
    }
  }
}
```

```
✓ PASSED Performance Test Results (290.8s)

id        | URL                                                          | Status | LCP    | CLS    | FID    | TBT    | FCP    | INP    | Score
----------+--------------------------------------------------------------+--------+--------+--------+--------+--------+--------+--------+-------
Profile: mobileSlow3G
----------+--------------------------------------------------------------+--------+--------+--------+--------+--------+--------+--------+-------
about     | https://richiemccoll.com/about/                              | PASS   | 1129ms | 0.000  | 195ms  | 164ms  | 1129ms | -      | 98
home      | https://richiemccoll.com                                     | PASS   | 1137ms | 0.000  | 150ms  | 136ms  | 1137ms | -      | 99
blog-post | https://richiemccoll.com/on-demand-code-review-with-chatgpt/ | PASS   | 1144ms | 0.000  | 196ms  | 179ms  | 1144ms | -      | 98

Tasks: 3 total, 3 completed, 0 failed
```

Okay, so now with these new targets and the `concurrency` setting, we've managed to get a test run across all of the targets in ~12 seconds.

We could have left the concurrency setting out, and each test would run sequentially. That may be a valid configuration for certain circumstances. However, in this case we've run all 3 Page Load tests in parrallel for quick feedback.

There are some other top-level configuration options to be aware of, for example: `maxRetries` and `timeout`. These let you configure how many times a Task can be retried, and how long a Task should run for, before failing the test.

#### Authenticated Targets

#### Profiles

Also, you may have noticed that these performance tests are using a `Profile` called `mobileSlow3G`.

This is one of several built-in Profiles that Faros includes. The others are:

- `Default Desktop`
- `Desktop Fast`

Of course, if the built-in profiles don't fit your needs, you can set up a custom `Profile`.

For example, let's update the config to include a slow 3g mobile profile with 6x CPU slowdown.

```json
{
  "targets": [
    {
      "id": "home",
      "url": "https://richiemccoll.com",
      "name": "Homepage"
    },
    {
      "id": "blog-post",
      "url": "https://richiemccoll.com/on-demand-code-review-with-chatgpt/",
      "name": "Blog Post"
    },
    {
      "id": "about",
      "url": "https://richiemccoll.com/about/",
      "name": "About"
    }
  ],
  "profiles": {
    "mobile6xSlow3G": {
      "id": "mobile6xSlow3G",
      "name": "Mobile 6x CPU Slow 3G",
      "lighthouseConfig": {
        "settings": {
          "emulatedFormFactor": "mobile",
          "throttling": {
            "rttMs": 150,
            "throughputKbps": 1638.4,
            "cpuSlowdownMultiplier": 6
          },
          "onlyCategories": ["performance"]
        }
      }
    }
  },
  "defaultProfile": "mobile6xSlow3G",
  "concurrency": 1,
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "cls": { "max": 0.1 },
      "fid": { "max": 500 },
      "tbt": { "max": 300 },
      "fcp": { "max:": 2500 },
      "performanceScore": { "min": 90 }
    }
  },
  "output": {
    "dir": "perf-results",
    "formats": ["json"],
    "includeRawLighthouse": true
  }
}
```

```
✗ FAILED Performance Test Results (290.8s)

id        | URL                                                          | Status | LCP    | CLS    | FID    | TBT    | FCP    | INP    | Score
----------+--------------------------------------------------------------+--------+--------+--------+--------+--------+--------+--------+-------
Profile: mobile6xSlow3G
----------+--------------------------------------------------------------+--------+--------+--------+--------+--------+--------+--------+-------
about     | https://richiemccoll.com/about/                              | PASS   | 938ms  | 0.000  | 252ms  | 254ms  | 938ms  | -      | 95
home      | https://richiemccoll.com                                     | PASS   | 940ms  | 0.000  | 230ms  | 209ms  | 940ms  | -      | 97
blog-post | https://richiemccoll.com/on-demand-code-review-with-chatgpt/ | FAIL   | 5111ms | 0.000  | 275ms  | 373ms  | 1957ms | -      | 71

Tasks: 3 total, 3 completed, 1 failed

Failed Tasks:
  • https://richiemccoll.com/on-demand-code-review-with-chatgpt/: lcp: 5110.653 > 2500, tbt: 373 > 300, performanceScore: 71 > 90
```

Interesting, we can see now actually that with the CPU slowdown, some of the Page load tests have failed because the Largest Contentful Paint and Total Blocking TIme have not passed the thresholds.

Maybe that is one worth digging into...

#### Report Output

We can update the config to include the output directory for the raw Lighthouse information.

```json
{
  "targets": [
    {
      "id": "home",
      "url": "https://richiemccoll.com",
      "name": "Homepage"
    },
    {
      "id": "blog-post",
      "url": "https://richiemccoll.com/on-demand-code-review-with-chatgpt/",
      "name": "Blog Post"
    },
    {
      "id": "about",
      "url": "https://richiemccoll.com/about/",
      "name": "About"
    }
  ],
  "profiles": {
    "mobile6xSlow3G": {
      "id": "mobile6xSlow3G",
      "name": "Mobile 6x CPU Slow 3G",
      "lighthouseConfig": {
        "settings": {
          "emulatedFormFactor": "mobile",
          "throttling": {
            "rttMs": 150,
            "throughputKbps": 1638.4,
            "cpuSlowdownMultiplier": 6
          },
          "onlyCategories": ["performance"]
        }
      }
    }
  },
  "defaultProfile": "mobile6xSlow3G",
  "concurrency": 1,
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "cls": { "max": 0.1 },
      "fid": { "max": 500 },
      "tbt": { "max": 300 },
      "fcp": { "max:": 2500 },
      "performanceScore": { "min": 90 }
    }
  },
  "output": {
    "dir": "perf-results",
    "formats": ["json"],
    "includeRawLighthouse": true
  }
}
```

If we want to isolate that test, we can do that with the `targets` flag.

- `faros run --config perf.config.json --target blog-post`

---

### Node.js `run` API

The Faros runner is intended to be flexible enough to operate as a stand-alone CLI, or composable within existing workflows.

All of the scenarios and configuration for the CLI above will also work with the programmatic `run` API. There are a few common use-cases where using this may be better suited.

#### Baselines & regression testing

- Baseline as “previous RunSummary” (file or inline JSON).
- `deltaMaxPct` / `deltaMin` for “don’t regress by more than X%”.
- Simple CI patterns:
  - Main branch writes baseline.
  - PR branches compare against it.

#### Notification on Failure

- Example run with slack API

---

### Node.js `auditFlow` API

#### Authenticated Targets

#### User Journeys

---

---

## CI/CD and environments

- Execution modes:
  - Native Chrome (dev machines, some CI runners).
  - Docker image with Node + Chrome for CI.
- Example GitHub Actions / GitLab CI snippets.

---

## Getting started

- Install:
  - `npm install --save-dev faros` (or whatever the package name is).
- Minimal `perf.config.ts` example:
  - One target, one profile, simple budgets.
- First run:
  - `npx faros run --config perf.config.ts`.
- How to enable baselines in 2–3 steps.

---

## Closing

- Reiterate goal: make performance a first-class **test**, not an afterthought.
- Invite people to:
  - Try it on a critical flow.
  - Open issues / PRs.
  - Share how they’re using it with their stack.
- Call for feedback / contributions.
