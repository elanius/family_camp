import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../admin.css";
import { useAdminAuth } from "../context/AdminAuthContext";
import RegistrationList, { type RegistrationItem, type RegistrationStatus } from "../components/admin/RegistrationList";
import { calculatePrice } from "../utils/pricing";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const ALL_STATUSES: RegistrationStatus[] = ["new", "wait_for_payment", "paid", "accepted", "rejected"];

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  new: "New",
  wait_for_payment: "Wait for Payment",
  paid: "Paid",
  accepted: "Accepted",
  rejected: "Rejected",
};

export default function AdminPage() {
  const { token, logout } = useAdminAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<RegistrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<RegistrationStatus | "all">("all");

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/registrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        logout();
        navigate("/admin/login");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch registrations.");
      setItems(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setLoading(false);
    }
  }, [token, logout, navigate]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  function handleUpdate(updated: RegistrationItem) {
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleLogout() {
    logout();
    navigate("/admin/login");
  }

  const filtered = filterStatus === "all" ? items : items.filter((i) => i.status === filterStatus);

  const countByStatus = (s: RegistrationStatus) => items.filter((i) => i.status === s).length;

  const { totalPeople, totalAmount } = useMemo(() => {
    let people = 0;
    let amount = 0;
    for (const item of items) {
      if (item.status === "rejected") continue;
      people += (item.registrant.is_attendee ? 1 : 0) + item.attendees.length;
      const campers: { name: string; surname: string; age: number }[] = [];
      if (item.registrant.is_attendee && item.registrant.age != null) {
        campers.push({ name: item.registrant.name, surname: item.registrant.surname, age: item.registrant.age });
      }
      for (const a of item.attendees) {
        campers.push({ name: a.name, surname: a.surname, age: a.age });
      }
      if (campers.length > 0) amount += calculatePrice(campers).total;
    }
    return { totalPeople: people, totalAmount: amount };
  }, [items]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-green-800 text-white px-6 py-4 flex items-center justify-between shadow">
        <h1 className="text-lg font-bold tracking-wide">Camp Admin</h1>
        <button
          onClick={handleLogout}
          className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
        >
          Log out
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Summary badges */}
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => setFilterStatus("all")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filterStatus === "all"
                ? "bg-green-700 text-white border-green-700"
                : "bg-white text-gray-600 border-gray-300 hover:border-green-600"
            }`}
          >
            All ({items.length})
          </button>
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                filterStatus === s
                  ? "bg-green-700 text-white border-green-700"
                  : "bg-white text-gray-600 border-gray-300 hover:border-green-600"
              }`}
            >
              {STATUS_LABELS[s]} ({countByStatus(s)})
            </button>
          ))}
        </div>

        {/* Global stats */}
        {items.length > 0 && (
          <div className="flex flex-wrap gap-4 mb-6 text-sm">
            <span className="text-gray-600">
              <span className="font-semibold text-gray-900">{totalPeople}</span> people attending
            </span>
            <span className="text-gray-600">
              Expected: <span className="font-semibold text-green-800">€{totalAmount}</span>
            </span>
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Registrations
            {filterStatus !== "all" && ` · ${STATUS_LABELS[filterStatus]}`}
          </h2>
          <button
            onClick={fetchRegistrations}
            disabled={loading}
            className="text-xs text-green-700 hover:underline disabled:opacity-50"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {/* Content */}
        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        )}

        {loading && items.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Loading…</p>
        ) : (
          <RegistrationList items={filtered} token={token!} onUpdate={handleUpdate} />
        )}
      </main>
    </div>
  );
}
