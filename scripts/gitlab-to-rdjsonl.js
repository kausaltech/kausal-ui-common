#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Transform GitLab format linter diagnostics to reviewdog RDJSONL format.
 * Reads GitLab format JSON from stdin and outputs RDJSONL to stdout.
 */
import { readFileSync } from 'fs';

/**
 * Map GitLab severity to RDJSONL severity
 * @param {string} gitlabSeverity - GitLab severity level
 * @returns {string} RDJSONL severity level
 */
function mapSeverity(gitlabSeverity) {
  const severityMap = {
    info: 'INFO',
    minor: 'WARNING',
    major: 'ERROR',
    critical: 'ERROR',
    blocker: 'ERROR',
  };

  return severityMap[gitlabSeverity] || 'WARNING';
}

/**
 * Transform a single GitLab diagnostic to RDJSONL format
 * @param {Object} gitlabDiagnostic - GitLab format diagnostic
 * @returns {Object} RDJSONL format diagnostic
 */
function transformDiagnostic(gitlabDiagnostic) {
  const { description, severity, location } = gitlabDiagnostic;

  const rdjsonlDiagnostic = {
    message: description,
    location: {
      path: location.path,
      range: {
        start: {
          line: location.lines.begin,
          column: location.lines.column || 1,
        },
      },
    },
    severity: mapSeverity(severity),
  };

  // Add end position if available
  if (location.lines.end) {
    rdjsonlDiagnostic.location.range.end = {
      line: location.lines.end,
      column: location.lines.end_column || location.lines.column || 1,
    };
  }

  return rdjsonlDiagnostic;
}

/**
 * Main function to process input and output transformed diagnostics
 */
async function main() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const input = chunks.join('');
    if (!input.trim()) {
      console.error('Error: No input provided');
      process.exit(1);
    }

    // Parse GitLab format JSON
    let gitlabDiagnostics;
    try {
      gitlabDiagnostics = JSON.parse(input);
    } catch (parseError) {
      console.error('Error: Invalid JSON input');
      console.error(parseError.message);
      process.exit(1);
    }

    // Ensure input is an array
    if (!Array.isArray(gitlabDiagnostics)) {
      console.error('Error: Input must be an array of diagnostics');
      process.exit(1);
    }

    // Transform each diagnostic and output as RDJSONL
    gitlabDiagnostics.forEach((diagnostic) => {
      try {
        const rdjsonlDiagnostic = transformDiagnostic(diagnostic);
        console.log(JSON.stringify(rdjsonlDiagnostic));
      } catch (transformError) {
        console.error(`Error transforming diagnostic: ${transformError.message}`);
        console.error(`Diagnostic: ${JSON.stringify(diagnostic)}`);
      }
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}
