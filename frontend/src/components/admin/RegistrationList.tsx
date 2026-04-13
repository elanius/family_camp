import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { calculatePrice, CATEGORY_LABEL } from "../../utils/pricing";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// ── Types ────────────────────────────────────────────────────────────────────

export type RegistrationStatus =
  | "new"
  | "wait_for_payment"
  | "paid"
  | "accepted"
  | "rejected";

export interface AttendeeData {
  name: string;
  surname: string;
  age: number;
  phone?: string;
  email?: string;
}

export interface RegistrantData {
  name: string;
  surname: string;
  age?: number;
  phone: string;
  email: string;
  is_attendee: boolean;
  transportation: "individual" | "train_with_organizer";
}

export interface RegistrationItem {
  id: string;
  registration_type: "me_and_others" | "just_others";
  registrant: RegistrantData;
  attendees: AttendeeData[];
  note?: string;
  status: RegistrationStatus;
  registered_at: string;
  update_token: string;
}

// ── Status display helpers ───────────────────────────────────────────────────

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  new: "New",
  wait_for_payment: "Wait for Payment",
  paid: "Paid",
  accepted: "Accepted",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<RegistrationStatus, string> = {
  new: "bg-gray-100 text-gray-700",
  wait_for_payment: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

// ── Action buttons per status ────────────────────────────────────────────────

type Action = "send_payment_info" | "payment_received" | "accept" | "reject";

const STATUS_ACTIONS: Record<RegistrationStatus, Action[]> = {
  new: ["send_payment_info", "reject"],
  wait_for_payment: ["payment_received", "reject"],
  paid: ["accept", "reject"],
  accepted: [],
  rejected: [],
};

const ACTION_LABELS: Record<Action, string> = {
  send_payment_info: "Send Payment Info",
  payment_received: "Payment Received",
  accept: "Accept",
  reject: "Reject",
};

const ACTION_STYLES: Record<Action, string> = {
  send_payment_info: "bg-yellow-500 hover:bg-yellow-600 text-white",
  payment_received: "bg-blue-600 hover:bg-blue-700 text-white",
  accept: "bg-green-600 hover:bg-green-700 text-white",
  reject: "bg-red-500 hover:bg-red-600 text-white",
};

// ── RegistrationRow ──────────────────────────────────────────────────────────

interface RegistrationRowProps {
  item: RegistrationItem;
  token: string;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updated: RegistrationItem) => void;
}

function RegistrationRow({
  item,
  token,
  expanded,
  onToggle,
  onUpdate,
}: RegistrationRowProps) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions = STATUS_ACTIONS[item.status];
  const reg = item.registrant;

  // All people attending (for headcount)
  const totalPeople = (reg.is_attendee ? 1 : 0) + item.attendees.length;

  // Campers with known age (for pricing)
  const campers: { name: string; surname: string; age: number }[] = [];
  if (reg.is_attendee && reg.age != null) {
    campers.push({ name: reg.name, surname: reg.surname, age: reg.age });
  }
  for (const a of item.attendees) {
    campers.push({ name: a.name, surname: a.surname, age: a.age });
  }

  const pricing = calculatePrice(campers);

  async function handleAction(action: Action) {
    if (action === "send_payment_info") {
      navigate(`/admin/payment/${item.id}`);
      return;
    }

    if (
      action === "reject" &&
      !window.confirm(
        `Reject registration for ${item.registrant.name} ${item.registrant.surname}?`,
      )
    ) {
      return;
    }

    setBusy(action);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/admin/registrations/${item.id}/action/${action}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? "Action failed.");
        return;
      }

      const updated: RegistrationItem = await res.json();
      onUpdate(updated);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const regDate = new Date(item.registered_at).toLocaleString("sk-SK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* ── Header ── */}
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">
                {reg.name} {reg.surname}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status]}`}
              >
                {STATUS_LABELS[item.status]}
              </span>
            </div>
            <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              <span>{reg.email}</span>
              <span>{reg.phone}</span>
              <span>
                {reg.transportation === "individual"
                  ? "🚗 Individual"
                  : "🚂 Train w/ organizer"}
              </span>
              <span className="font-medium text-gray-700">
                {totalPeople} {totalPeople === 1 ? "person" : "people"}
              </span>
              <span className="font-semibold text-green-800">
                €{pricing.total}
              </span>
              <span className="text-gray-400">{regDate}</span>
              {item.update_token && (
                <a
                  href={`/update/${item.update_token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-green-700 hover:underline"
                >
                  Update form ↗
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          {actions.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {actions.map((action) => (
                <button
                  key={action}
                  onClick={() => handleAction(action)}
                  disabled={busy !== null}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${ACTION_STYLES[action]}`}
                >
                  {busy === action ? "…" : ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
            {error}
          </p>
        )}

        {campers.length > 0 && (
          <button
            onClick={onToggle}
            className="mt-2 text-xs text-green-700 hover:underline"
          >
            {expanded ? "Hide" : "Show"} members ({totalPeople})
          </button>
        )}
      </div>

      {/* ── Members table ── */}
      {expanded && campers.length > 0 && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-2 text-left w-8">#</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Age</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Base</th>
                <th className="px-4 py-2 text-right">Discount</th>
                <th className="px-4 py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pricing.items.map((p, idx) => (
                <tr key={idx} className="text-gray-700 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{p.age}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {CATEGORY_LABEL[p.category]}
                  </td>
                  <td className="px-4 py-2 text-right">
                    €{p.basePrice + p.lateFee}
                  </td>
                  <td className="px-4 py-2 text-right text-green-700">
                    {p.discount > 0 ? `-€${p.discount}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold">
                    {p.finalPrice === 0 ? (
                      <span className="text-gray-400">free</span>
                    ) : (
                      `€${p.finalPrice}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td
                  colSpan={6}
                  className="px-4 py-2.5 text-right text-sm font-semibold text-gray-600"
                >
                  Total
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-green-800">
                  €{pricing.total}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Note ── */}
      {item.note && (
        <div className="border-t border-gray-100 px-4 py-3 bg-yellow-50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Note
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {item.note}
          </p>
        </div>
      )}
    </div>
  );
}

// ── RegistrationList ─────────────────────────────────────────────────────────

interface RegistrationListProps {
  items: RegistrationItem[];
  token: string;
  onUpdate: (updated: RegistrationItem) => void;
}

export default function RegistrationList({
  items,
  token,
  onUpdate,
}: RegistrationListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // When item list changes (filter/refresh), collapse all by default
  useEffect(() => {
    setExpandedIds(new Set());
  }, [items]);

  function toggleOne(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allExpanded = items.length > 0 && expandedIds.size === items.length;
  const allCollapsed = expandedIds.size === 0;

  if (items.length === 0) {
    return (
      <p className="text-center text-gray-400 py-16">No registrations found.</p>
    );
  }

  return (
    <div>
      <div className="flex gap-3 justify-end mb-2">
        <button
          onClick={() => setExpandedIds(new Set(items.map((i) => i.id)))}
          disabled={allExpanded}
          className="text-xs text-green-700 hover:underline disabled:opacity-30"
        >
          Expand all
        </button>
        <button
          onClick={() => setExpandedIds(new Set())}
          disabled={allCollapsed}
          className="text-xs text-green-700 hover:underline disabled:opacity-30"
        >
          Collapse all
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <RegistrationRow
            key={item.id}
            item={item}
            token={token}
            expanded={expandedIds.has(item.id)}
            onToggle={() => toggleOne(item.id)}
            onUpdate={onUpdate}
          />
        ))}
      </div>
    </div>
  );
}
