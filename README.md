# Faros

A Modern frontend performance testing framework for Node.js, powered by Lighthouse with comprehensive configuration management and flexible reporting.

## Features

- **Comprehensive Core Web Vitals** - Track LCP, CLS, FCP, FID, INP, and TBT
- **Concurrent Performance Testing** - Test multiple URLs simultaneously with configurable concurrency
- **Assertions-first:** Define budgets and change limits (LCP, CLS, perf score, etc.) and fail builds when they’re broken.
- **Multiple Report Formats** - CLI and JSON output formats

## Installation

```bash
npm install -g faros
```

or if you want to use the API or as a dependency:

```bash
npm i faros --save
```

## Usage

### Command Line

**Create a configuration JSON file:**

```json
{
  "targets": [
    {
      "id": "home",
      "url": "https://example.com",
      "name": "Homepage",
      "tags": ["critical"]
    }
  ],
  "defaultProfile": "mobileSlow3G",
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "cls": { "max": 0.1 },
      "performanceScore": { "min": 90 }
    }
  }
}
```

#### `run` - Performance Testing

Executes Lighthouse performance tests on configured targets with specified profiles.

```bash
# Run all targets with all profiles
faros run

# Run specific target only
faros run --target homepage

# Run with specific profile only
faros run --profile mobile

# Run specific target with specific profile
faros run --target homepage --profile desktop

# Load custom config file
faros run --config custom.config.json

# Quiet mode - JSON output only
faros run --format json --quiet
```

**Output examples:**

**Single Profile (CLI Reporter):**

```
ℹ Loading configuration...
ℹ Loaded config with 2 targets and 0 custom profiles
ℹ Running 1 targets with concurrency 2...
ℹ Starting performance test run with 1 task(s) across 1 profile(s)
ℹ 🚀 Starting 1 performance test(s)
ℹ 🔧 Starting profile: mobileSlow3G (1 task(s))
ℹ ⏳ Running: Homepage (mobileSlow3G)
ℹ ✅ Completed: Homepage 🟢 Score: 99
ℹ ✅ Completed profile: mobileSlow3G
ℹ 🏁 Performance test run completed. 1 task(s) processed
✓ PASSED Performance Test Results (8.7s)

id   | URL                      | Status | LCP   | CLS   | FID   | TBT   | FCP   | INP | Score
-----+--------------------------+--------+-------+-------+-------+-------+-------+-----+-------
Profile: mobileSlow3G
-----+--------------------------+--------+-------+-------+-------+-------+-------+-----+-------
home | https://richiemccoll.com | PASS   | 932ms | 0.000 | 146ms | 127ms | 932ms | -   | 99

Tasks: 1 total, 1 completed, 0 failed
```

**Single Profile (JSON Reporter):**

```json
{
  "run": {
    "id": "run-1765277548885",
    "startTime": "2025-12-09T10:52:28.885Z",
    "endTime": "2025-12-09T10:52:38.637Z",
    "duration": 9752,
    "passed": true,
    "totalTasks": 2,
    "completedTasks": 2,
    "failedTasks": 0
  },
  "targets": [
    {
      "id": "home_default_1765277548885_8xej0btn7",
      "url": "https://richiemccoll.com",
      "name": "Homepage",
      "tags": ["critical"],
      "profile": "default",
      "status": "passed",
      "metrics": {
        "lcp": 360.733,
        "cls": 0,
        "fid": 45,
        "tbt": 0,
        "fcp": 360.733,
        "performanceScore": 100
      },
      "assertions": {
        "passed": true,
        "failureCount": 0,
        "results": [
          {
            "metric": "lcp",
            "passed": true,
            "actual": 360.733,
            "expected": {
              "max": 2500
            }
          },
          {
            "metric": "cls",
            "passed": true,
            "actual": 0,
            "expected": {
              "max": 0.1
            }
          },
          {
            "metric": "performanceScore",
            "passed": true,
            "actual": 100,
            "expected": {
              "min": 90
            }
          }
        ]
      }
    }
  ],
  "journeys": [],
  "environments": [],
  "meta": {
    "version": "1.0.0",
    "generatedAt": "2025-12-09T10:52:38.638Z",
    "generator": "faros-json-reporter"
  }
}
```

**Multiple Profiles (CLI Reporter):**

```
ℹ Starting performance test run with 3 task(s) across 2 profile(s)
ℹ 🔧 Starting profile: mobileSlow3G (2 task(s))
ℹ ⏳ Running: Google Mobile (mobileSlow3G)
ℹ ⏳ Running: Example Mobile (mobileSlow3G)
ℹ ✅ Completed: Example Mobile 🟢 Score: 100
ℹ ✅ Completed: Google Mobile 🟡 Score: 82
ℹ ✅ Completed profile: mobileSlow3G
ℹ 🔧 Starting profile: desktop (1 task(s))
ℹ ⏳ Running: Google Desktop (desktop)
ℹ ✅ Completed: Google Desktop 🟢 Score: 96
ℹ ✅ Completed profile: desktop
✓ PASSED Performance Test Results (45.8s)

Profile: mobileSlow3G
---------------+------------------------+--------+-------+-------+-----+-------+-------+-----+-------
id             | URL                    | Status | LCP   | CLS   | FID | TBT   | FCP   | INP | Score
---------------+------------------------+--------+-------+-------+-----+-------+-------+-----+-------
google-mobile  | https://www.google.com | OK     | 4073ms| 0.000 | 30ms| 0ms   | 2275ms| -   | 82
example-mobile | https://example.com    | GOOD   | 794ms | 0.000 | 16ms| 0ms   | 794ms | -   | 100

Profile: desktop
---------------+------------------------+--------+-------+-------+-----+-------+-------+-----+-------
id             | URL                    | Status | LCP   | CLS   | FID | TBT   | FCP   | INP | Score
---------------+------------------------+--------+-------+-------+-----+-------+-------+-----+-------
google-desktop | https://www.google.com | GOOD   | 1082ms| 0.000 | 16ms| 0ms   | 1082ms| -   | 96

Tasks: 3 total, 3 completed, 0 failed
```

---

### Programmatically

```js
import { run } from 'faros'

const result = await run({
  targets: 'https://example.com',
})

console.log(`Performance Score: ${result.metrics?.performanceScore}`)
console.log(`LCP: ${result.metrics?.lcp}ms`)
console.log(`Passed: ${result.passed}`)
```

---

**Status Indicators:**

- `PASS`/`FAIL` (when assertions are configured)
- `GOOD` (90+ performance score)
- `OK` (70-89 performance score)
- `POOR` (<70 performance score)
- `ERROR` (task execution failed)

---

### Global Options

Available across all commands:

- `-c, --config <path>` - Path to configuration file
- `-v, --verbose` - Enable verbose logging
- `-q, --quiet` - Suppress non-essential output
- `-h, --help` - Show help
- `-V, --version` - Show version number

## Configuration

Faros supports multiple configuration file formats and provides a flexible override system.

### Configuration Files

Faros automatically discovers configuration files in this order:

1. `perf.config.js` - JavaScript module (CommonJS)
2. `perf.config.cjs` - Explicit CommonJS module
3. `perf.config.mjs` - ES module
4. `perf.config.ts` - TypeScript configuration
5. `perf.config.json` - JSON configuration

### Configuration Structure

```typescript
interface PerfConfig {
  // Required: URLs to test
  targets: Target[]

  // Optional: Lighthouse profiles (mobile, desktop, etc.)
  profiles?: Record<string, ProfileRef>
  defaultProfile?: string

  // Optional: Execution settings
  concurrency?: number // Default: 1 - Number of parallel tasks
  maxRetries?: number // Default: 2 - Failed task retry attempts
  timeout?: number // Default: 30000ms - Per-task timeout

  // Optional: Performance assertions
  assertions?: AssertionConfig

  // Optional: Output configuration
  output?: {
    dir?: string // Default: './perf-results'
    formats?: Array<'cli' | 'json' | 'html' | 'junit'>
    includeRawLighthouse?: boolean
  }

  // Optional: Plugin system
  plugins?: PluginConfig[]
}
```

### Environment Variables

Override configuration using environment variables with the `PERF_` prefix:

```bash
# Execution settings
export PERF_CONCURRENCY=4
export PERF_MAX_RETRIES=5
export PERF_TIMEOUT=60000

# Output settings
export PERF_OUTPUT_DIR=./results
export PERF_OUTPUT_FORMATS='["cli","json","html"]'

# Then run with overrides
faros print-config
```

### Configuration Precedence

Configuration is merged in this order (later sources override earlier ones):

1. **Default values** (lowest priority)
2. **Configuration file** (`perf.config.*`)
3. **Environment variables** (`PERF_*`)
4. **CLI arguments** (highest priority)

## Lighthouse Profiles

Faros includes a built-in ProfileRegistry that provides pre-configured Lighthouse profiles and supports custom profile inheritance.

### Built-in Profiles

| Profile ID     | Description                    | Use Case                   |
| -------------- | ------------------------------ | -------------------------- |
| `default`      | Balanced desktop settings      | General purpose testing    |
| `desktop`      | Fast desktop connection        | Desktop optimization       |
| `mobileSlow3G` | Mobile with slow 3G throttling | Mobile performance testing |
| `ciMinimal`    | Minimal config for CI/CD       | Faster automated testing   |

### Profile Inheritance

Custom profiles can extend built-in profiles using the `extends` property:

```json
{
  "profiles": {
    "customMobile": {
      "id": "customMobile",
      "extends": "mobileSlow3G",
      "name": "Custom Mobile Profile",
      "lighthouseConfig": {
        "settings": {
          "onlyCategories": ["performance"],
          "skipAudits": ["unused-css-rules"]
        }
      }
    }
  }
}
```

**Inheritance Rules:**

- Base profile settings are preserved
- Custom settings are deep-merged over base settings
- Arrays are replaced entirely (not merged)
- Circular dependencies are detected and prevented
- Missing base profiles throw validation errors

### Profile Resolution

Use the `print-config` command to see how profiles are resolved:

```bash
faros print-config
```

The `_resolvedProfiles` section shows the final configuration for each profile after inheritance processing.

### Example Configurations

#### Basic Setup

```json
{
  "targets": [
    {
      "id": "homepage",
      "url": "https://example.com",
      "tags": ["critical"]
    }
  ],
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "performanceScore": { "min": 90 }
    }
  }
}
```

#### Advanced Setup with Multiple Targets

```json
{
  "targets": [
    {
      "id": "homepage",
      "url": "https://example.com",
      "name": "Homepage",
      "tags": ["critical", "landing"]
    },
    {
      "id": "checkout",
      "url": "https://example.com/checkout",
      "name": "Checkout Flow",
      "tags": ["critical", "conversion"],
      "profile": "mobile"
    }
  ],
  "profiles": {
    "mobile": {
      "id": "mobile",
      "name": "Mobile Slow 3G",
      "lighthouseConfig": {
        "settings": {
          "emulatedFormFactor": "mobile",
          "throttling": {
            "rttMs": 150,
            "throughputKbps": 1638.4
          }
        }
      }
    }
  },
  "concurrency": 2,
  "maxRetries": 1,
  "timeout": 45000,
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "cls": { "max": 0.1 }
    },
    "tags": {
      "critical": {
        "lcp": { "max": 2000 },
        "performanceScore": { "min": 95 }
      }
    }
  },
  "output": {
    "formats": ["cli", "json", "html"],
    "includeRawLighthouse": true
  }
}
```

## Development

### Prerequisites

- Node.js 20+
- pnpm (recommended) or npm

### Setup

```bash
# Clone and install dependencies
git clone <repository-url>
cd faros
pnpm install

# Build the project
pnpm build

# Run tests with coverage
pnpm test

# Format code
pnpm format:fix

# Lint code
pnpm lint:fix
```

## License

MIT
