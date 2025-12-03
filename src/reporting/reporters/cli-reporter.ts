import { RunSummary } from '../../core/types/reporting'
import { TaskResult } from '../report-collector'
import pc from 'picocolors'

export interface CLIReporterOptions {
  showColors?: boolean
  showMetrics?: string[]
  maxUrlLength?: number
}

/**
 * CLI Reporter that displays performance results in a human-readable table format
 */
export class CLIReporter {
  private options: Required<CLIReporterOptions>

  constructor(options: CLIReporterOptions = {}) {
    this.options = {
      showColors: options.showColors ?? true,
      showMetrics: options.showMetrics ?? ['lcp', 'cls', 'performanceScore'],
      maxUrlLength: options.maxUrlLength ?? 60,
    }
  }

  /**
   * Generate CLI report from run summary
   */
  generate(summary: RunSummary): string {
    const lines: string[] = []

    // Header
    lines.push(this.formatHeader(summary))
    lines.push('')

    if (summary.taskResults.length > 0) {
      const taskResults = summary.taskResults.map((result) => ({
        ...result,
        startTime: new Date(),
      }))
      lines.push(this.formatTable(taskResults))
      lines.push('')
    }

    lines.push(this.formatSummary(summary))

    return lines.join('\n')
  }

  print(summary: RunSummary): void {
    // eslint-disable-next-line no-console
    console.log(this.generate(summary))
  }

  private formatHeader(summary: RunSummary): string {
    const status = summary.passed ? this.colorize('✓ PASSED', 'green') : this.colorize('✗ FAILED', 'red')

    const duration = `${(summary.duration / 1000).toFixed(1)}s`

    return `${status} Performance Test Results (${duration})`
  }

  private formatTable(taskResults: TaskResult[]): string {
    // Table headers
    const headers = ['URL', 'Status', ...this.options.showMetrics.map(this.formatMetricHeader)]

    const colWidths = this.calculateColumnWidths(headers, taskResults)

    const lines: string[] = []

    lines.push(this.formatRow(headers, colWidths))
    lines.push(this.formatSeparator(colWidths))

    for (const result of taskResults) {
      const row = this.formatDataRow(result)
      lines.push(this.formatRow(row, colWidths))
    }

    return lines.join('\n')
  }

  private formatDataRow(result: TaskResult): string[] {
    const target = this.truncateUrl(result.task.target.url)
    const status = this.formatStatus(result)

    const metrics = this.options.showMetrics.map((metric) => {
      if (!result.lighthouseResult?.metrics) {
        return '-'
      }
      return this.formatMetricValue(
        metric,
        result.lighthouseResult.metrics[metric as keyof typeof result.lighthouseResult.metrics],
      )
    })

    return [target, status, ...metrics]
  }

  private formatStatus(result: TaskResult): string {
    if (result.error) {
      return this.colorize('ERROR', 'red')
    }

    if (!result.lighthouseResult) {
      return this.colorize('PENDING', 'yellow')
    }

    if (result.assertionReport) {
      return result.assertionReport.passed ? this.colorize('PASS', 'green') : this.colorize('FAIL', 'red')
    }

    // No assertions configured - consider it passed if lighthouse completed successfully
    return this.colorize('PASS', 'green')
  }

  private formatMetricValue(metric: string, value: number | undefined): string {
    if (value === undefined) return '-'

    switch (metric) {
      case 'lcp':
      case 'fcp':
      case 'fid':
      case 'tbt':
        return `${Math.round(value)}ms`
      case 'cls':
        return value.toFixed(3)
      case 'performanceScore':
        return Math.round(value).toString()
      default:
        return value.toString()
    }
  }

  private formatMetricHeader(metric: string): string {
    switch (metric) {
      case 'lcp':
        return 'LCP'
      case 'cls':
        return 'CLS'
      case 'fcp':
        return 'FCP'
      case 'fid':
        return 'FID'
      case 'tbt':
        return 'TBT'
      case 'performanceScore':
        return 'Score'
      default:
        return metric.toUpperCase()
    }
  }

  private calculateColumnWidths(headers: string[], taskResults: TaskResult[]): number[] {
    const widths = headers.map((header) => header.length)

    // Calculate minimum widths based on data
    for (const result of taskResults) {
      const row = this.formatDataRow(result)
      row.forEach((cell, index) => {
        // Strip ANSI colors for width calculation
        const cleanCell = this.stripColors(cell)
        widths[index] = Math.max(widths[index] || 0, cleanCell.length)
      })
    }

    return widths.map((width) => Math.max(width, 6)) // Minimum 6 chars
  }

  private formatRow(cells: string[], widths: number[]): string {
    return cells
      .map((cell, index) => {
        const cleanCell = this.stripColors(cell)
        const width = widths[index] || 0
        const padding = width - cleanCell.length
        return cell + ' '.repeat(Math.max(0, padding))
      })
      .join(' | ')
  }

  private formatSeparator(widths: number[]): string {
    return widths.map((width) => '-'.repeat(width)).join('-+-')
  }

  private formatSummary(summary: RunSummary): string {
    const lines: string[] = []

    lines.push(`Tasks: ${summary.totalTasks} total, ${summary.completedTasks} completed, ${summary.failedTasks} failed`)

    if (summary.failedTasks > 0) {
      lines.push('')
      lines.push(this.colorize('Failed Tasks:', 'red'))

      const failedTasks = summary.taskResults.filter(
        (result) => result.error || (result.assertionReport && !result.assertionReport.passed),
      )

      for (const task of failedTasks) {
        if (task.error) {
          lines.push(`  • ${task.task.target.url}: ${task.error}`)
        } else if (task.assertionReport && !task.assertionReport.passed) {
          const failedAssertions = task.assertionReport.results
            .filter((r) => !r.passed)
            .map((r) => `${r.metric}: ${r.actual} > ${r.expected?.max || r.expected?.min}`)
          lines.push(`  • ${task.task.target.url}: ${failedAssertions.join(', ')}`)
        }
      }
    }

    return lines.join('\n')
  }

  private truncateUrl(url: string): string {
    if (url.length <= this.options.maxUrlLength) {
      return url
    }
    return url.slice(0, this.options.maxUrlLength - 3) + '...'
  }

  private colorize(text: string, color: string): string {
    if (!this.options.showColors) {
      return text
    }

    switch (color) {
      case 'green':
        return pc.green(text)
      case 'red':
        return pc.red(text)
      case 'yellow':
        return pc.yellow(text)
      case 'blue':
        return pc.blue(text)
      default:
        return text
    }
  }

  private stripColors(text: string): string {
    // Simple ANSI escape sequence removal
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '')
  }
}
