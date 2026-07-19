import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"

import App from "./App"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster richColors closeButton position="top-right" />
  </StrictMode>
)
