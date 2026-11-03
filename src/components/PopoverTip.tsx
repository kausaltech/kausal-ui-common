import { useState } from 'react';

import { Box, IconButton, Tooltip } from '@mui/material';

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/* TODO: Use icon from theme */
type PopoverTipProps = {
  content: string;
  /** Accessible name of the tip, e.g. a translated "Definition" */
  label: string;
};

/**
 * An info button with a toggletip. Hovering or focusing it shows the content;
 * pressing it pins the content open and announces it to screen readers.
 * Escape or moving focus away closes it.
 */
const PopoverTip = (props: PopoverTipProps) => {
  const { content, label } = props;
  // Opened by hovering or keyboard focus, as MUI's tooltip decides
  const [autoOpen, setAutoOpen] = useState(false);
  // Opened by pressing the button
  const [pinned, setPinned] = useState(false);

  return (
    <>
      <Tooltip
        title={content}
        placement="top"
        arrow
        describeChild
        open={autoOpen || pinned}
        onOpen={() => setAutoOpen(true)}
        onClose={() => setAutoOpen(false)}
      >
        <IconButton
          size="small"
          aria-label={label}
          onClick={() => setPinned((value) => !value)}
          onBlur={() => setPinned(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setPinned(false);
          }}
          // A 24×24 px target (WCAG 2.5.8); the negative margin keeps the line height
          sx={{ height: '24px', width: '24px', p: 0, my: '-5px', mx: '-3px' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            fill="currentColor"
            className="bi bi-info-circle-fill"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
          </svg>
        </IconButton>
      </Tooltip>
      {/* Announces the content when the button is pressed */}
      <Box component="span" role="status" sx={visuallyHidden}>
        {pinned ? content : null}
      </Box>
    </>
  );
};

export default PopoverTip;
