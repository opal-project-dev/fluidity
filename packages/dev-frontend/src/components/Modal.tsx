import React from "react";
import { Container } from "theme-ui";

export const Modal = ({ children }: {children: React.ReactNode}) => (
  <Container variant="modalOverlay">
    <Container variant="modal">{children}</Container>
  </Container>
);
