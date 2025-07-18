import React from 'react';

import Container from '@mui/material/Container';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';

import { DelayedCircularProgress } from './DelayedCircularProgress';

type Props = {
  title: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isLoading?: boolean;
};

export function SettingsToggleBar({ title, label, value, onChange, isLoading = false }: Props) {
  return (
    <Container disableGutters sx={{ backgroundColor: 'background.paper', px: 2, py: 0.5 }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="h5">{title}</Typography>
        <FormControlLabel
          control={<Switch checked={value} onChange={() => onChange(!value)} />}
          label={label}
        />
        <DelayedCircularProgress isLoading={isLoading} size={16} />
      </Stack>
    </Container>
  );
}
