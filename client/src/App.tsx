import { Navigate, Route, Routes } from "react-router-dom";
import { HostPage } from "./pages/HostPage";
import { WatchPage } from "./pages/WatchPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WatchPage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
