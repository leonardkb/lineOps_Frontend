// NavCeo.jsx - CEO specific navigation bar
import { useState, useEffect, useCallback } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { API_URL } from "../lib/masterCodeCatalog";

export default function NavCeo() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Pending efficiency-change requests waiting for CEO approval → badge on
  // "Plan Analytics". Refreshed on mount, on window focus, every 60s, and
  // whenever the efficiency screens dispatch "efficiency-permissions-updated".
  const [pendingEff, setPendingEff] = useState(0);

  const loadPending = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API_URL}/api/efficiency-change-requests?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (data?.success) {
        setPendingEff(Number(data.pendingCount ?? (data.requests?.length || 0)) || 0);
      }
    } catch {
      /* ignore — badge just won't update */
    }
  }, []);

  useEffect(() => {
    loadPending();
    const id = setInterval(loadPending, 60000);
    const onFocus = () => loadPending();
    window.addEventListener("focus", onFocus);
    window.addEventListener("efficiency-permissions-updated", loadPending);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("efficiency-permissions-updated", loadPending);
    };
  }, [loadPending]);

  const menu = [
    { name: "Production Monitor", path: "/overview" },
    { name: "Actual Efficiency", path: "/actual-efficiency" },
    { name: "Plan Analytics", path: "/planner-analytics", notify: true },
    { name: "Quality Monitor", path: "/quality-monitor" },
    { name: "Mechanics", path: "/mecanics" },
    { name: "Merchant Analytics", path: "/merchant-analytics" },
    { name: "Cut-Analytics", path: "/cut-order-analytics" },
    { name: "FWH-Analytics", path: "/fwh-analytics" },
  ];

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const Badge = ({ className = "" }) =>
    pendingEff > 0 ? (
      <span
        title={`${pendingEff} solicitud(es) de eficiencia pendiente(s)`}
        className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-bold leading-none ${className}`}
      >
        {pendingEff > 99 ? "99+" : pendingEff}
      </span>
    ) : null;

  return (
    <nav className="bg-gradient-to-r from-gray-900 to-gray-800 text-white sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
        
        {/* Title / Brand */}
        <Link to="/overview" className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Skyrina CEO Panel
        </Link>

        {/* Desktop Menu */}
        <ul className="hidden md:flex gap-6 lg:gap-8 font-medium">
          {menu.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `cursor-pointer transition duration-200 ${
                    isActive
                      ? "text-blue-400 border-b-2 border-blue-400 pb-1"
                      : "hover:text-blue-400 hover:border-b-2 hover:border-blue-400 pb-1"
                  }`
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  {item.name}
                  {item.notify && <Badge />}
                </span>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={handleLogout}
              className="cursor-pointer transition duration-200 hover:text-red-400"
            >
              Cerrar sesión
            </button>
          </li>
        </ul>

        {/* Hamburger Menu Button */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden text-2xl cursor-pointer focus:outline-none relative"
          aria-label="Toggle menu"
        >
          {open ? "✕" : "☰"}
          {/* Dot on the hamburger so pending approvals are visible while collapsed */}
          {!open && pendingEff > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500" />
          )}
        </button>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="bg-gray-800 md:hidden border-t border-gray-700">
          <ul className="flex flex-col gap-3 px-6 py-4 font-medium">
            {menu.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block py-2 cursor-pointer transition duration-200 ${
                      isActive
                        ? "text-blue-400 border-l-4 border-blue-400 pl-3"
                        : "hover:text-blue-400 hover:border-l-4 hover:border-blue-400 hover:pl-3"
                    }`
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    {item.name}
                    {item.notify && <Badge />}
                  </span>
                </NavLink>
              </li>
            ))}
            <li className="pt-2 border-t border-gray-700">
              <button
                onClick={() => {
                  setOpen(false);
                  handleLogout();
                }}
                className="block w-full text-left py-2 cursor-pointer transition duration-200 hover:text-red-400"
              >
                Cerrar sesión
              </button>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}