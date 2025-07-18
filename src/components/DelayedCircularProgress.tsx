import { useEffect, useRef, useState } from 'react';

import CircularProgress, { type CircularProgressProps } from '@mui/material/CircularProgress';

type Props = {
  isLoading: boolean;
} & CircularProgressProps;

const DELAY_TIME = 500;
const MIN_SHOW_TIME = 1500;

/**
 * Delays the display of a circular progress indicator until a minimum show time has passed.
 * Avoids flickering of the spinner when the data is loaded quickly.
 */
export function DelayedCircularProgress({ isLoading, ...rest }: Props) {
  const [showSpinner, setShowSpinner] = useState(false);
  const delayTimer = useRef<NodeJS.Timeout | null>(null);
  const minShowTimer = useRef<NodeJS.Timeout | null>(null);
  const minShowUntil = useRef<number>(0);

  useEffect(() => {
    if (isLoading) {
      // Start 500ms delay before showing spinner
      if (!showSpinner && !delayTimer.current) {
        delayTimer.current = setTimeout(() => {
          setShowSpinner(true);
          minShowUntil.current = Date.now() + MIN_SHOW_TIME;
          delayTimer.current = null;
        }, DELAY_TIME);
      }
    } else {
      // If spinner is not yet shown, cancel the delay
      if (delayTimer.current) {
        clearTimeout(delayTimer.current);
        delayTimer.current = null;
      }

      // If spinner is shown, keep it for at least 1.5s
      if (showSpinner) {
        const remaining = minShowUntil.current - Date.now();

        if (remaining > 0) {
          minShowTimer.current = setTimeout(() => {
            setShowSpinner(false);
            minShowTimer.current = null;
          }, remaining);
        } else {
          setShowSpinner(false);
        }
      }
    }

    return () => {
      if (delayTimer.current) {
        clearTimeout(delayTimer.current);
        delayTimer.current = null;
      }

      if (minShowTimer.current) {
        clearTimeout(minShowTimer.current);
        minShowTimer.current = null;
      }
    };
  }, [isLoading, showSpinner]);

  return showSpinner ? <CircularProgress size={16} {...rest} /> : null;
}
