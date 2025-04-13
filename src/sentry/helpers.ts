import * as Sentry from '@sentry/nextjs';

/**
 * Configuration options for interaction span tracking
 */
type StartInteractionOptions = {
  /**
   * Name of the interaction/span (defaults to 'unknown' if not provided)
   */
  name: string;
  /**
   * React component name that received the interaction
   */
  componentName?: string;
  /**
   * Operation type (defaults to 'ui.action')
   */
  op?: string;
  /**
   * Additional attributes to attach to the span
   */
  attributes?: Record<string, string>;
};

/**
 * Creates a Sentry span around a user interaction for performance monitoring.
 *
 * @template T The return type of the interaction handler function
 * @param handler - An async function that performs the interaction operation
 * @param options - Configuration options for the span
 * @returns The result of the interaction handler function
 */
export async function startInteraction<T>(handler: () => Promise<T>, options?: StartInteractionOptions) {
  const { name = 'unknown', op, attributes, componentName } = options ?? {};
  const attrs = {
    ...attributes,
    ...(componentName ? { 'react.component': componentName } : {}),
  };
  return Sentry.startSpanManual({
    name,
    op: op ?? 'ui.action',
    attributes: attrs,
    parentSpan: null,
    forceTransaction: true,
  }, async (span, finish) => {
    const result = await handler();
    finish();
    return result;
  });
}
