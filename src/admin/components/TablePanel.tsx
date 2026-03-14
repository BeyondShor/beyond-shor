import * as React from 'react';
import { Box, Button, Typography } from '@strapi/design-system';

const TABLE_TEMPLATE = `| Spalte 1 | Spalte 2 | Spalte 3 |
|----------|----------|----------|
| Wert 1   | Wert 2   | Wert 3   |
| Wert 4   | Wert 5   | Wert 6   |`;

function TablePanelContent() {
  const [copied, setCopied] = React.useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(TABLE_TEMPLATE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <Box padding={4} paddingTop={2}>
      <Button variant="secondary" onClick={handleCopy} style={{ width: '100%' }}>
        {copied ? '✓ Kopiert!' : '+ Tabelle kopieren'}
      </Button>
      <Box paddingTop={3}>
        <Typography variant="pi" textColor="neutral600">
          Vorlage in die Zwischenablage kopieren, dann im Editor mit Strg+V einfügen.
        </Typography>
      </Box>
    </Box>
  );
}

export function TablePanel() {
  return {
    title: 'Markdown',
    content: <TablePanelContent />,
  };
}
