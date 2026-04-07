import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { useAdminAuth } from "../context/AdminAuthContext";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

interface PaymentInfo {
  iban: string;
  bank_name: string;
  amount: number;
  variable_symbol: string;
  recipient_note: string;
  registrant_name: string;
  registrant_email: string;
  attendee_count: number;
  qr_string: string;
}

const DEBOUNCE_MS = 600;

export default function PaymentInfoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAdminAuth();

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [registrantName, setRegistrantName] = useState("");
  const [registrantEmail, setRegistrantEmail] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [amount, setAmount] = useState(0);
  const [variableSymbol, setVariableSymbol] = useState("");
  const [recipientNote, setRecipientNote] = useState("");
  const [qrString, setQrString] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch payment info on load
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/api/admin/registrations/${id}/payment-info`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load payment info.");
        return res.json();
      })
      .then((data: PaymentInfo) => {
        setRegistrantName(data.registrant_name);
        setRegistrantEmail(data.registrant_email);
        setIban(data.iban);
        setBankName(data.bank_name);
        setAmount(data.amount);
        setVariableSymbol(data.variable_symbol);
        setRecipientNote(data.recipient_note);
        setQrString(data.qr_string);
      })
      .catch((e: unknown) => setFetchError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, token]);

  // Re-fetch QR string from backend (debounced) when payment fields change
  useEffect(() => {
    if (!iban || !variableSymbol) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/api/admin/payment-qr-string`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ iban, amount, variable_symbol: variableSymbol, note: recipientNote }),
      })
        .then((res) => res.json())
        .then((data: { qr_string: string }) => setQrString(data.qr_string))
        .catch(() => {
          /* keep previous QR string */
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [iban, amount, variableSymbol, recipientNote, token]);

  async function handleSend() {
    if (!id) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/registrations/${id}/send-payment-info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          iban,
          bank_name: bankName,
          amount,
          variable_symbol: variableSymbol,
          recipient_note: recipientNote,
          bysquare_string: qrString,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSendError((body as { detail?: string }).detail ?? "Send failed.");
        return;
      }
      navigate("/admin");
    } catch {
      setSendError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-gray-500 text-sm">Loading…</div>;
  }

  if (fetchError) {
    return (
      <div className="p-8">
        <p className="text-red-600 text-sm">{fetchError}</p>
        <button onClick={() => navigate("/admin")} className="mt-4 text-sm text-green-700 hover:underline">
          ← Back to admin
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/admin")} className="text-sm text-gray-500 hover:text-gray-800">
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Send Payment Info</h1>
        </div>

        {/* Recipient */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Recipient</p>
          <p className="font-semibold text-gray-900">{registrantName}</p>
          <p className="text-sm text-gray-500">{registrantEmail}</p>
        </div>

        {/* Payment details form */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Payment Details</p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (€)</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Variable Symbol</label>
            <input
              type="text"
              value={variableSymbol}
              onChange={(e) => setVariableSymbol(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note for recipient</label>
            <input
              type="text"
              value={recipientNote}
              onChange={(e) => setRecipientNote(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>

        {/* Pay by Square QR */}
        {qrString ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col items-center gap-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide self-start">Pay by Square QR Code</p>
            <QRCodeCanvas value={qrString} size={256} level="M" bgColor="#ffffff" fgColor="#000000" />
            <p className="text-xs text-gray-400">Scan with your Slovak banking app</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-dashed border-gray-200 p-5 text-center text-gray-400 text-sm">
            QR code will appear once IBAN and variable symbol are filled in.
          </div>
        )}

        {sendError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{sendError}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            onClick={() => navigate("/admin")}
            className="px-5 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !qrString}
            className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
