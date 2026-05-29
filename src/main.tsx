import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initAuth } from "./stores/authStore";

initAuth(); // start Firebase auth listener before React renders

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);
