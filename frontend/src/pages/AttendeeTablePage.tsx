import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../admin.css";
import { useAdminAuth } from "../context/AdminAuthContext";
import type { RegistrationItem, RegistrationStatus } from "../components/admin/RegistrationList";
import { getCategory } from "../utils/pricing";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

const CATEGORY_SHORT: Record<ReturnType<typeof getCategory>, string> = {
  baby: "Baby",
  kid: "Kid",
  adult: "Adult",
};

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  new: "New",
  wait_for_payment: "Wait for Payment",
  paid: "Paid",
  accepted: "Accepted",
  rejected: "Rejected",
};

// ── Flattened attendee row ───────────────────────────────────────────────────

interface AttendeeRow {
  name: string;
  surname: string;
  age: number;
  category: string;
  // Contact = the registrant of the group this attendee belongs to
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  note: string;
  status: RegistrationStatus;
  groupId: string;
  isContact: boolean;
}

type SortKey = keyof Pick<
  AttendeeRow,
  "name" | "surname" | "age" | "category" | "contactName" | "contactEmail" | "contactPhone" | "note" | "status"
>;

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "surname", label: "Surname" },
  { key: "age", label: "Age", numeric: true },
  { key: "category", label: "Category" },
  { key: "contactName", label: "Contact" },
  { key: "contactEmail", label: "Email" },
  { key: "contactPhone", label: "Phone" },
  { key: "note", label: "Note" },
  { key: "status", label: "Status" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Flatten registrations into one row per attending person. */
function toRows(items: RegistrationItem[]): AttendeeRow[] {
  const rows: AttendeeRow[] = [];
  for (const item of items) {
    // "Who will come" – skip rejected registrations.
    if (item.status === "rejected") continue;

    const reg = item.registrant;
    const contactName = `${reg.name} ${reg.surname}`.trim();
    const note = item.note ?? "";

    const base = {
      contactName,
      contactEmail: reg.email,
      contactPhone: reg.phone,
      note,
      status: item.status,
      groupId: item.id,
    };

    // The registrant attends themselves for both "me_and_others" and "only_me"
    // registrations (both set is_attendee); "just_others" registrants don't attend.
    if (reg.is_attendee && reg.age != null) {
      rows.push({
        ...base,
        name: reg.name,
        surname: reg.surname,
        age: reg.age,
        category: CATEGORY_SHORT[getCategory(reg.age)],
        isContact: true,
      });
    }

    for (const a of item.attendees) {
      rows.push({
        ...base,
        name: a.name,
        surname: a.surname,
        age: a.age,
        category: CATEGORY_SHORT[getCategory(a.age)],
        isContact: false,
      });
    }
  }
  return rows;
}

function compareRows(a: AttendeeRow, b: AttendeeRow, key: SortKey, numeric: boolean): number {
  if (numeric) return (a[key] as number) - (b[key] as number);
  return String(a[key]).localeCompare(String(b[key]), "sk", { sensitivity: "base" });
}

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AttendeeTablePage() {
  const { token, logout } = useAdminAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<RegistrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("surname");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

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

  const rows = useMemo(() => toRows(items), [items]);

  const sortedRows = useMemo(() => {
    const numeric = COLUMNS.find((c) => c.key === sortKey)?.numeric ?? false;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const primary = compareRows(a, b, sortKey, numeric);
      if (primary !== 0) return primary * dir;
      // Stable tiebreak: surname → name → age so groups read naturally.
      return compareRows(a, b, "surname", false) || compareRows(a, b, "name", false) || compareRows(a, b, "age", true);
    });
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleExportCsv() {
    const header = COLUMNS.map((c) => c.label);
    const lines = [header.map(csvCell).join(",")];
    for (const r of sortedRows) {
      lines.push(COLUMNS.map((c) => csvCell(c.key === "status" ? STATUS_LABELS[r.status] : r[c.key])).join(","));
    }
    // Prepend BOM so Excel reads UTF-8 (Slovak diacritics) correctly.
    const bom = "﻿";
    const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendees-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleLogout() {
    logout();
    navigate("/admin/login");
  }

  const groupCount = new Set(sortedRows.map((r) => r.groupId)).size;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-green-800 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm text-white/70 hover:text-white transition-colors">
            ← Camp Admin
          </Link>
          <h1 className="text-lg font-bold tracking-wide">Attendees</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
        >
          Log out
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            <span>
              <span className="font-semibold text-gray-900">{sortedRows.length}</span> attendees
            </span>
            <span>
              <span className="font-semibold text-gray-900">{groupCount}</span> groups
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRegistrations}
              disabled={loading}
              className="text-xs text-green-700 hover:underline disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
            <button
              onClick={handleExportCsv}
              disabled={sortedRows.length === 0}
              className="text-sm font-medium bg-green-700 hover:bg-green-800 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
        )}

        {loading && items.length === 0 ? (
          <p className="text-center text-gray-400 py-16">Loading…</p>
        ) : sortedRows.length === 0 ? (
          <p className="text-center text-gray-400 py-16">No attendees found.</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  {COLUMNS.map((col) => {
                    const active = col.key === sortKey;
                    return (
                      <th key={col.key} className="px-4 py-2.5 text-left whitespace-nowrap">
                        <button
                          onClick={() => handleSort(col.key)}
                          className={`flex items-center gap-1 hover:text-green-700 transition-colors ${
                            active ? "text-green-700 font-semibold" : ""
                          }`}
                        >
                          {col.label}
                          <span className="text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.map((r, idx) => (
                  <tr key={`${r.groupId}-${idx}`} className="text-gray-700 hover:bg-gray-50 align-top">
                    <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{r.name}</td>
                    <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{r.surname}</td>
                    <td className="px-4 py-2">{r.age}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{r.category}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.contactName}</td>
                    <td className="px-4 py-2">
                      <a href={`mailto:${r.contactEmail}`} className="text-green-700 hover:underline">
                        {r.contactEmail}
                      </a>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <a href={`tel:${r.contactPhone}`} className="text-green-700 hover:underline">
                        {r.contactPhone}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      <div className="max-w-xs truncate" title={r.note}>
                        {r.note}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{STATUS_LABELS[r.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
