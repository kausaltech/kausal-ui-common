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
/** A keystroke typed ahead of an early Enter or Tab, to replay on the next cell. */
type HeldKey = { readonly key: string; readonly shiftKey: boolean };
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
        // This key opens the editor. Glide hands it over as `initialValue` too, but
        // the buffer keeps it as well, so a Backspace before focus can take it back.
        if (printable && event.location) {
          const cell = getCellContent(event.location);
          if (cell.kind === GridCellKind.Number && cell.allowOverlay && cell.readonly !== true) {
            buffer.start(event.key);
          }
        }
        return false;
      }

      if (event.key === 'Escape') {
        buffer.reset();
        return false;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        buffer.finish(event.key, event.shiftKey);
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
 *
 * Holds the whole text for the opening cell — the key that opened the editor
 * included, so Backspace can remove it — and, once Enter or Tab has been pressed
 * early, the keys typed after it, which belong to the next cell and are replayed
 * there after the commit.
 */
class TypeaheadBuffer {
  /** Longer than any plausible chunk load; past it, a stuck buffer resets. */
  private static readonly TIMEOUT_MS = 3000;

  private held: string | null = null;
  private commit: Movement | null = null;
  private after: HeldKey[] = [];
  private startedAt = 0;

  isOpening(): boolean {
    if (this.held !== null && Date.now() - this.startedAt > TypeaheadBuffer.TIMEOUT_MS) {
      this.reset();
    }
    return this.held !== null;
  }

  start(openingKey: string): void {
    this.held = openingKey;
    this.commit = null;
    this.after = [];
    this.startedAt = Date.now();
  }

  push(key: string): void {
    if (this.commit === null) this.held = (this.held ?? '') + key;
    else this.after.push({ key, shiftKey: false });
  }

  backspace(): void {
    if (this.commit === null) this.held = this.held?.slice(0, -1) ?? null;
    else this.after.pop();
  }

  finish(key: 'Enter' | 'Tab', shiftKey: boolean): void {
    // Enter or Tab after the first one belongs to the next cell.
    if (this.commit !== null) this.after.push({ key, shiftKey });
    else this.commit = key === 'Tab' ? [shiftKey ? -1 : 1, 0] : [0, 1];
  }

  reset(): void {
    this.held = null;
    this.commit = null;
    this.after = [];
  }

  take(): { text: string | null; commit: Movement | null; after: readonly HeldKey[] } {
    const taken = { text: this.held, commit: this.commit, after: this.after };
    this.reset();
    return taken;
  }
}

/**
 * Replays keys typed ahead of an early Enter or Tab onto the grid, once the
 * commit has moved the selection to the next cell. They arrive as ordinary
 * keydowns, so the next cell opens its editor with the first and buffers the
 * rest — the same path as if the user had typed them there.
 */
function replayKeys(keys: readonly HeldKey[]) {
  if (keys.length === 0) return;
  // Two frames: Glide closes the overlay and refocuses the grid asynchronously.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = document.activeElement;
      if (!target) return;
      for (const { key, shiftKey } of keys) {
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })
        );
      }
    })
  );
}

/**
 * The number as text to edit, losslessly: `String` gives the shortest string that
 * reads back as exactly this number (exponent included, e.g. "1.2345e-11"), and
 * only the decimal point is localised. Rounding here would let an edit to one
 * digit silently overwrite the digits that were not shown.
 */
function formatForEditing(value: number | undefined, locale: string): string {
  if (value === undefined) return '';
  const decimal =
    new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === 'decimal')
      ?.value ?? '.';
  return String(value).replace('.', decimal);
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
          const { text: typed, commit, after } = buffer.take();
          // The whole typed text, opening key included, replaces what the input
          // started with ("7" then Enter saves 7). Without a buffer, an opening key
          // from Glide is still an edit.
          const next = typed ?? (initialValue !== undefined ? current : null);
          const edited = next === null ? undefined : apply(next);
          if (commit && edited) {
            onFinishedEditing(edited, commit);
            replayKeys(after);
            return;
          }
          const end = (next ?? current).length;
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
