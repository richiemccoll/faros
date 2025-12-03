# Faros

**Modern performance testing framework** powered by Lighthouse with comprehensive configuration management and flexible reporting.

## Features

- **Comprehensive Core Web Vitals** - Track LCP, CLS, FCP, FID, INP, and TBT
- **Concurrent Performance Testing** - Test multiple URLs simultaneously with configurable concurrency
- **Intelligent Retry Logic** - Automatic retry with exponential backoff for failed tests
- **Multiple Report Formats** - CLI, JSON, HTML, and JUnit output formats
- **Extensible Plugin System** - Custom plugins for notifications, baseline comparison, and more

## Installation

```bash
npm install -g faros
```

## Quick Start

**Create a configuration JSON file:**

```json
{
  "targets": [
    {
      "id": "homepage",
      "url": "https://example.com",
      "name": "Homepage",
      "tags": ["critical"]
    }
  ],
  "assertions": {
    "metrics": {
      "lcp": { "max": 2500 },
      "cls": { "max": 0.1 },
      "performanceScore": { "min": 90 }
    }
  }
}
```

## CLI Commands

### `run` - Performance Testing

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

# Verbose output with detailed logging
faros run --verbose

# Quiet mode - JSON output only
faros run --quiet
```

**Output example:**

```
ℹ Loading configuration...
ℹ Loaded config with 2 targets and 1 custom profiles
ℹ Running 2 targets with concurrency 2...
ℹ Starting performance test run with 2 task(s)
ℹ 🚀 Starting 2 performance test(s)
ℹ ⏳ Running: Homepage (desktop)
ℹ ⏳ Running: Checkout (desktop)
ℹ ✅ Completed: Homepage 🟢 Score: 95
ℹ ✅ Completed: Checkout 🟡 Score: 78
ℹ Performance test run completed. 2 result(s)
ℹ 🏁 Performance tests completed: 2 passed, 0 failed

🎯 Performance Test Summary
   Total tests run: 4

   📊 homepage:
     Profile: desktop
       🟢 Performance: 95
       🟢 LCP: 1825ms
       🟢 CLS: 0.045
       � FCP: 1654ms
       🟢 FID: 12ms
       🟢 TBT: 89ms

     Profile: mobile
       🟡 Performance: 78
       🟡 LCP: 3245ms
       🟢 CLS: 0.087
       🟡 FCP: 2890ms
       🟡 FID: 156ms
       🟡 TBT: 234ms

   📊 checkout:
     Profile: desktop
       🟢 Performance: 92
       🟢 LCP: 2145ms
       🟢 CLS: 0.023
       🟢 FCP: 1923ms
       🟢 FID: 8ms
       � TBT: 45ms

     Profile: mobile
       🔴 Performance: 45
       🔴 LCP: 4567ms
       🟡 CLS: 0.189
       🔴 FCP: 4123ms
       🔴 FID: 389ms
       🔴 TBT: 567ms
```

### `print-config` - Configuration Validation

Shows the resolved and validated configuration after merging all sources (file + environment + CLI overrides).

```bash
# Show resolved configuration with resolved profiles
faros print-config

# Load specific config file
faros print-config --config custom.config.json

# Quiet mode (no success messages)
faros print-config --quiet
```

**Output example:**

```json
{
  "targets": [
    {
      "id": "homepage",
      "url": "https://example.com",
      "tags": ["critical"]
    },
    {
      "id": "mobile-checkout",
      "url": "https://example.com/checkout",
      "profile": "customMobile"
    }
  ],
  "profiles": {
    "customMobile": {
      "id": "customMobile",
      "extends": "mobileSlow3G",
      "lighthouseConfig": {
        "settings": { "onlyCategories": ["performance"] }
      }
    }
  },
  "defaultProfile": "desktop",
  "_resolvedProfiles": {
    "desktop": {
      "id": "desktop",
      "name": "Desktop Fast",
      "lighthouseConfig": {
        "settings": {
          "emulatedFormFactor": "desktop",
          "throttling": { "rttMs": 40, "throughputKbps": 10240 }
        }
      }
    },
    "customMobile": {
      "id": "customMobile",
      "name": "Custom Mobile Profile",
      "lighthouseConfig": {
        "settings": {
          "emulatedFormFactor": "mobile",
          "throttling": { "rttMs": 150, "throughputKbps": 1638.4 },
          "onlyCategories": ["performance"]
        }
      }
    }
  }
}
✅ Configuration is valid
```

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

### Testing

The project includes comprehensive test coverage:

- **Unit Tests** - Core functionality (config loading, validation, types)
- **Integration Tests** - End-to-end CLI workflows with real file I/O
- **Code Coverage** - Enforced minimums (80% branches, functions, lines, statements)

```bash
# Run all tests with coverage report
pnpm test

# Run specific test suite
pnpm test src/core/config.test.ts

# Run integration tests
pnpm test src/cli/cli.integration.test.ts
```

## License

MIT
