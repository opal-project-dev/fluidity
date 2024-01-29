import React from "react";
import { Text, Box } from "theme-ui";

import { WaitingDialog } from "./WaitingDialog";

type ConnectionConfirmationDialogProps = {
  title: string;
  icon?: React.ReactNode;
  onCancel: () => void;
  children?: React.ReactNode;
};

export const ConnectionConfirmationDialog = ({
  title,
  icon,
  onCancel,
  children
}: ConnectionConfirmationDialogProps) => (
  <WaitingDialog
    title={title}
    icon={icon}
    waitReason={
      <>
        <Text sx={{ fontWeight: "bold" }}>Waiting for connection confirmation...</Text>
        <Text>This won’t cost you any NTN</Text>
      </>
    }
    cancelLabel="Cancel connection"
    onCancel={onCancel}
  >
    <Box sx={{ p: [3, 4] }}>{children}</Box>
  </WaitingDialog>
);
