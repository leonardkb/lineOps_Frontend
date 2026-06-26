import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PlannerPage from "./pages/PlannerPage";
import LoginPage from "./components/LoginPage";
import LineInfo from "./pages/LineInfo";
import AdminDashboard from "./pages/AdminDashboard";
import LineLeaderPage from "./pages/LineLeaderPage";
import Dashboard from "./pages/Dashboard";
import LineBalancing from "./pages/LineBalancing";
import LineTvDashboard from "./pages/LineTvDashboard";
import SkyrinaDashboard from "./pages/SkyrinaDashboard";
import Overview from "./pages/Overview";
import ActualEfficiency from "./pages/ActualEfficiency";
import QualityInspectorPage from "./pages/QualityInspectorPage";
import QualityAnalytics from "./pages/QualityAnalytics";
import EditOperationPlanner from "./pages/EditOperationPlanner";


export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/planner" element={<PlannerPage />} /> {/* changed from /home */}
        <Route path="/line_info" element={<LineInfo />} />
        <Route path="/" element={<LoginPage />} />
        <Route path="/admin-dashboard" element={<AdminDashboard />} />
        <Route path="/admin" element={<Dashboard />} />
        <Route path="/lineleader" element={<LineLeaderPage />} />
        <Route path="/line-balancing" element={<LineBalancing />} />
        <Route path="/line-tv" element={<LineTvDashboard />} />
        <Route path="/skyrina" element={<SkyrinaDashboard />}/> 
        <Route path="/overview" element ={<Overview />}/>
        <Route path="/actual-efficiency" element={<ActualEfficiency />} />
        <Route path="/quality-inspector" element={<QualityInspectorPage />} />  {/* ← ADD THIS */}
        <Route path="/quality-monitor" element={<QualityAnalytics/>} />  {/*quality monitor route, same component as quality inspector */}
         <Route path="/edit-operation" element={<EditOperationPlanner />} />  {/*edit operation route */}
      </Routes>
    </Router>
  );
}
