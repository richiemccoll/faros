# Faros

**Modern performance testing framework** powered by Lighthouse with comprehensive configuration management and flexible reporting.

## Features

- **Multi-target Performance Testing** - Test multiple URLs with different configurations
- **Multiple Report Formats** - CLI, JSON, HTML, and JUnit output formats
- **Extensible Plugin System** - Custom plugins for notifications, baseline comparison, and more

## Installation

```bash
npm install -g faros
```

## Quick Start

1. **Create a configuration JSON file:**

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

2. **Validate your configuration:**

```bash
faros print-config
```

## CLI Commands

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
  concurrency?: number // Default: 1
  maxRetries?: number // Default: 2
  timeout?: number // Default: 30000ms

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

| Profile ID | Description | Use Case |
|------------|-------------|----------|
| `default` | Balanced desktop settings | General purpose testing |
| `desktop` | Fast desktop connection | Desktop optimization |
| `mobileSlow3G` | Mobile with slow 3G throttling | Mobile performance testing |
| `ciMinimal` | Minimal config for CI/CD | Faster automated testing |

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

### Architecture

Faros follows a modular architecture with clear separation of concerns:

```
src/
├── core/           # Core functionality
│   ├── types/      # TypeScript definitions and Zod schemas
│   ├── config.ts   # Configuration loading and validation
│   └── scheduler.ts # Task scheduling (planned)
├── lighthouse/     # Lighthouse integration (planned)
├── assertions/     # Performance assertions (planned)
├── reporting/      # Report generation (planned)
├── plugins/        # Plugin system (planned)
└── cli/           # Command-line interface
    ├── commands.ts # Command exports
    ├── cli.ts     # Main CLI setup
    └── print-config.ts # Configuration validation command
```

## License

MIT
