import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./host/App";
import { IdentityProvider } from "./identity/useIdentity";
import { SkinProvider } from "./host/useSkin";
import { edition } from "./edition";
import "./styles.css";

document.title = edition.productName;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SkinProvider>
      <IdentityProvider>
        <App />
      </IdentityProvider>
    </SkinProvider>
  </StrictMode>,
);
