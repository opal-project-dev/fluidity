import { Box, Flex, Text } from "theme-ui";

import { Icon } from "./Icon";

export const ErrorDescription = ({ children }: {children: React.ReactNode}) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-around",

      mb: [2, 3],
      p: 3,

      border: 1,
      borderRadius: 16,
      borderColor: "danger",
      boxShadow: 1,
      bg: "rgba(220, 44, 16, 0.05)"
    }}
  >
    <Flex sx={{ alignItems: "center" }}>
      <Icon name="exclamation-triangle" size="lg" />
      <Text sx={{ ml: 2 }}>{children}</Text>
    </Flex>
  </Box>
);
