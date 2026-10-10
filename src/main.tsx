// First: settles which collective the window is in before anything reads storage.
import { app } from "./edition";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./host/App";
import { IdentityProvider } from "./identity/useIdentity";
import { SkinProvider } from "./host/useSkin";
import "./styles.css";

document.title = app.productName;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SkinProvider>
      <IdentityProvider>
        <App />
      </IdentityProvider>
    </SkinProvider>
  </StrictMode>,
);
