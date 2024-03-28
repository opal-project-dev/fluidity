import React from "react";
import { Flex } from "theme-ui";

export const Badge = ({ children }: {children: React.ReactNode}) => {
  return <Flex variant="badges.primary">{children}</Flex>;
};
