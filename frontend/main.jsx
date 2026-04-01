import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { LocaleProvider } from "./context/LocaleContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LocaleProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </LocaleProvider>
  </React.StrictMode>
);
