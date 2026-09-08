#!/usr/bin/env node
/**
 * Transform GitLab format linter diagnostics to reviewdog RDJSONL format.
 * Reads GitLab format JSON from stdin and outputs RDJSONL to stdout.
 */

/**
 * @typedef {object} GitLabLines
 * @property {number} begin
 * @property {number} [end]
 * @property {number} [column]
 * @property {number} [end_column]
 */

/**
 * @typedef {object} GitLabLocation
 * @property {string} path
 * @property {GitLabLines} lines
 */

/**
 * @typedef {object} GitLabDiagnostic
 * @property {string} description
 * @property {string} severity
 * @property {GitLabLocation} location
 */

/**
 * @typedef {object} RdPosition
 * @property {number} line
 * @property {number} column
 */

/**
 * @typedef {object} RdRange
 * @property {RdPosition} start
 * @property {RdPosition} [end]
 */

/**
 * @typedef {object} RdDiagnostic
 * @property {string} message
 * @property {{ path: string, range: RdRange }} location
 * @property {string} severity
 */

/** @type {Record<string, string>} */
const SEVERITY_MAP = {
  info: 'INFO',
  minor: 'WARNING',
  major: 'ERROR',
  critical: 'ERROR',
  blocker: 'ERROR',
};

/**
 * Map GitLab severity to RDJSONL severity
 * @param {string} gitlabSeverity - GitLab severity level
 * @returns {string} RDJSONL severity level
 */
function mapSeverity(gitlabSeverity) {
  return SEVERITY_MAP[gitlabSeverity] ?? 'WARNING';
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Transform a single GitLab diagnostic to RDJSONL format
 * @param {GitLabDiagnostic} gitlabDiagnostic - GitLab format diagnostic
 * @returns {RdDiagnostic} RDJSONL format diagnostic
 */
function transformDiagnostic(gitlabDiagnostic) {
  const { description, severity, location } = gitlabDiagnostic;
  const { lines } = location;

  /** @type {RdDiagnostic} */
  const rdjsonlDiagnostic = {
    message: description,
    location: {
      path: location.path,
      range: {
        start: {
          line: lines.begin,
          column: lines.column ?? 1,
        },
      },
    },
    severity: mapSeverity(severity),
  };

  // Add end position if available
  if (lines.end) {
    rdjsonlDiagnostic.location.range.end = {
      line: lines.end,
      column: lines.end_column ?? lines.column ?? 1,
    };
  }

  return rdjsonlDiagnostic;
}

/**
 * Main function to process input and output transformed diagnostics
 */
async function main() {
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
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (parseError) {
    console.error('Error: Invalid JSON input');
    console.error(getErrorMessage(parseError));
    process.exit(1);
  }

  // Ensure input is an array
  if (!Array.isArray(parsed)) {
    console.error('Error: Input must be an array of diagnostics');
    process.exit(1);
  }

  const gitlabDiagnostics = /** @type {GitLabDiagnostic[]} */ (parsed);

  // Transform each diagnostic and output as RDJSONL
  for (const diagnostic of gitlabDiagnostics) {
    try {
      const rdjsonlDiagnostic = transformDiagnostic(diagnostic);
      console.log(JSON.stringify(rdjsonlDiagnostic));
    } catch (transformError) {
      console.error(`Error transforming diagnostic: ${getErrorMessage(transformError)}`);
      console.error(`Diagnostic: ${JSON.stringify(diagnostic)}`);
    }
  }
}

// Run the main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((/** @type {unknown} */ error) => {
    console.error(`Error: ${getErrorMessage(error)}`);
    process.exit(1);
  });
}
