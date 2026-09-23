'use client';

import { useCallback, useMemo, useState } from 'react';

import {
  type DataEditorProps,
  type GridCell,
  GridCellKind,
  type Item,
  type NumberCell,
  type ProvideEditorComponent,
} from '@glideapps/glide-data-grid';

import { parseLocaleNumber } from './parse-number';

/**
 * Number editing for Glide grids that does not lose what people type.
 *
 * Glide's stock number editing has two defects that each corrupt a typed value
 * without any sign of it:
 *
 * 1. **The key that opens the editor is dropped.** Typing on a focused cell
 *    opens the overlay with that key as `initialValue`, which the built-in
 *    number editor never reads.
 * 2. **Keys typed before the editor has focus re-open it.** The overlay's input
 *    takes focus a moment after it opens — longer on the first edit after a page
 *    load, when Glide lazy-loads it. Until then keys still reach the grid, and
 *    each one re-opens the overlay with that key alone. Typed briskly, "158809"
 *    saves as "9"; an early Enter is lost altogether.
 *
 * This replaces the number editor, and holds keys typed while it is opening —
 * Enter and Tab included — until its input has focus. It also parses typed and
 * pasted numbers by the UI locale (see `parseLocaleNumber`), so "1.500" is
 * fifteen hundred to a German user and one and a half to a Swiss one, whether
 * typed or pasted from Excel — and a pasted value it cannot read leaves the cell
 * unchanged rather than falling through to Glide's `parseFloat`, which turns
 * "1'234.5" into 1.
 *
 * ```tsx
 * const numbers = useGlideNumberEditing({ locale, getCellContent });
 * <DataEditor
 *   provideEditor={numbers.provideEditor}
 *   onKeyDown={numbers.onKeyDown}
 *   coercePasteValue={numbers.coercePasteValue}
 *   …
 * />
 * ```
 *
 * Grids with their own `onKeyDown` call `numbers.onKeyDown(event)` first and
 * return if `event` was cancelled by it — the returned handler reports that.
 */

type Movement = readonly [-1 | 0 | 1, -1 | 0 | 1];
type KeyDownHandler = NonNullable<DataEditorProps['onKeyDown']>;

type Options = {
  /** BCP 47 locale of the UI; decides what "," and "." mean. */
  readonly locale: string;
  /** The grid's own cell accessor, to tell which cells are editable numbers. */
  readonly getCellContent: (cell: Item) => GridCell;
  /** How a number is displayed in a cell. Defaults to the locale's grouping. */
  readonly formatNumber?: (value: number) => string;
};

export type GlideNumberEditing = {
  readonly provideEditor: NonNullable<DataEditorProps['provideEditor']>;
  /** Returns true when it consumed the key; the caller should then do nothing else. */
  readonly onKeyDown: (event: Parameters<KeyDownHandler>[0]) => boolean;
  readonly coercePasteValue: NonNullable<DataEditorProps['coercePasteValue']>;
};

export function useGlideNumberEditing({
  locale,
  getCellContent,
  formatNumber,
}: Options): GlideNumberEditing {
  const [buffer] = useState(() => new TypeaheadBuffer());

  const format = useMemo(
    () => formatNumber ?? ((value: number) => new Intl.NumberFormat(locale).format(value)),
    [formatNumber, locale]
  );

  // One component per grid and locale: a stable identity, so Glide does not
  // remount the editor on every render.
  const NumberEditor = useMemo(() => createNumberEditor(buffer, locale), [buffer, locale]);

  const provideEditor = useCallback<GlideNumberEditing['provideEditor']>(
    (cell) =>
      cell.kind === GridCellKind.Number && cell.readonly !== true
        ? (NumberEditor as ReturnType<GlideNumberEditing['provideEditor']>)
        : undefined,
    [NumberEditor]
  );

  const onKeyDown = useCallback<GlideNumberEditing['onKeyDown']>(
    (event) => {
      const printable = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

      if (!buffer.isOpening()) {
        // This key opens the editor, and Glide hands it over as `initialValue`.
        if (printable && event.location) {
          const cell = getCellContent(event.location);
          if (cell.kind === GridCellKind.Number && cell.allowOverlay && cell.readonly !== true) {
            buffer.start();
          }
        }
        return false;
      }

      if (event.key === 'Escape') {
        buffer.reset();
        return false;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        buffer.finish(event.key === 'Tab' ? [event.shiftKey ? -1 : 1, 0] : [0, 1]);
      } else if (printable) {
        buffer.push(event.key);
      } else if (event.key === 'Backspace') {
        buffer.backspace();
      } else {
        return false;
      }
      event.cancel();
      return true;
    },
    [buffer, getCellContent]
  );

  const coercePasteValue = useCallback<GlideNumberEditing['coercePasteValue']>(
    (text, target) => {
      if (target.kind !== GridCellKind.Number) return undefined;
      const value = parseLocaleNumber(text, locale);
      // Not a number: keep the cell as it is. Returning `undefined` would hand
      // the text to Glide's own paste, whose `parseFloat` reads "1'234.5" as 1.
      if (value === undefined) return target;
      return {
        ...target,
        data: value ?? undefined,
        displayData: value === null ? '' : format(value),
      };
    },
    [locale, format]
  );

  return { provideEditor, onKeyDown, coercePasteValue };
}

/**
 * Keystrokes typed while the editor is opening. Mutable on purpose: written from
 * key handlers, read once when the editor's input takes focus, never rendered.
 */
class TypeaheadBuffer {
  /** Longer than any plausible chunk load; past it, a stuck buffer resets. */
  private static readonly TIMEOUT_MS = 3000;

  private held: string | null = null;
  private commit: Movement | null = null;
  private startedAt = 0;

  isOpening(): boolean {
    if (this.held !== null && Date.now() - this.startedAt > TypeaheadBuffer.TIMEOUT_MS) {
      this.reset();
    }
    return this.held !== null;
  }

  start(): void {
    this.held = '';
    this.commit = null;
    this.startedAt = Date.now();
  }

  push(key: string): void {
    // Keys after an early Enter belong to the next cell, not this one.
    if (this.commit === null) this.held = (this.held ?? '') + key;
  }

  backspace(): void {
    if (this.commit === null) this.held = this.held?.slice(0, -1) ?? null;
  }

  finish(movement: Movement): void {
    this.commit = movement;
  }

  reset(): void {
    this.held = null;
    this.commit = null;
  }

  take(): { text: string; commit: Movement | null } {
    const taken = { text: this.held ?? '', commit: this.commit };
    this.reset();
    return taken;
  }
}

function formatForEditing(value: number | undefined, locale: string): string {
  if (value === undefined) return '';
  return new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 10 }).format(
    value
  );
}

type EditorProps = Parameters<ProvideEditorComponent<NumberCell>>[0];

function createNumberEditor(buffer: TypeaheadBuffer, locale: string) {
  /**
   * Enter, Tab and Escape are handled by Glide's overlay around this input. An
   * unparseable entry is held back: Enter is swallowed and the field marked,
   * rather than committing whatever was last valid.
   */
  function NumberEditor({
    value,
    initialValue,
    isHighlighted,
    onChange,
    onFinishedEditing,
  }: EditorProps) {
    const [text, setText] = useState(() => initialValue ?? formatForEditing(value.data, locale));
    const [invalid, setInvalid] = useState(
      () => initialValue !== undefined && parseLocaleNumber(initialValue, locale) === undefined
    );

    const apply = (next: string) => {
      const parsed = parseLocaleNumber(next, locale);
      setText(next);
      setInvalid(parsed === undefined);
      if (parsed === undefined) return undefined;
      const edited = { ...value, data: parsed ?? undefined };
      onChange(edited);
      return edited;
    };

    return (
      <input
        className="gdg-input"
        // An overlay editor opens because the user is already typing into it.
        autoFocus
        inputMode="decimal"
        aria-invalid={invalid}
        value={text}
        style={{
          textAlign: 'right',
          width: '100%',
          outline: invalid ? '2px solid #B72136' : undefined,
        }}
        onFocus={(event) => {
          const current = event.target.value;
          const { text: ahead, commit } = buffer.take();
          // The opening key is already an edit ("7" then Enter saves 7), and so
          // is anything typed while the editor was opening.
          const edited = initialValue !== undefined || ahead ? apply(current + ahead) : undefined;
          if (commit && edited) {
            onFinishedEditing(edited, commit);
            return;
          }
          const end = current.length + ahead.length;
          // Opened by typing: caret after the typed keys. Opened by Enter or
          // double-click: select all, so typing replaces.
          event.target.setSelectionRange(
            isHighlighted && initialValue === undefined ? 0 : end,
            end
          );
        }}
        onChange={(event) => apply(event.target.value)}
        onKeyDown={(event) => {
          if ((event.key === 'Enter' || event.key === 'Tab') && invalid) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      />
    );
  }
  return NumberEditor;
}
