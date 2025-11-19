"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@crossmint/client-sdk-react-ui";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

const USDC_TOKEN = "usdc";
const MOCK_UP_ADDRESS = process.env.NEXT_PUBLIC_MOCK_UP_ADDRESS || "";

type TransferStatus = "idle" | "processing" | "success" | "error";

interface Agent {
  id: string;
  name: string;
  address: string;
  distance: string;
  hours: string;
  isOpen: boolean;
  lat: number;
  lng: number;
}

interface CashPickupRequest {
  id: string;
  agent: Agent;
  amount: number;
  transactionHash: string;
  timestamp: number;
  qrCodeData: string;
}

const MOCK_AGENTS: Agent[] = [
  {
    id: "1",
    name: "MoneyMart Financial Center",
    address: "241 W 37th St, New York, NY 10018",
    distance: "0.3 mi away",
    hours: "Mon–Fri: 8AM–8PM",
    isOpen: true,
    lat: 40.7128,
    lng: -74.0060,
  },
  {
    id: "2",
    name: "CityCash Services",
    address: "465 Lexington Ave, New York, NY 10017",
    distance: "1.2 mi away",
    hours: "Mon–Sat: 9AM–6PM",
    isOpen: true,
    lat: 40.7589,
    lng: -73.9851,
  },
  {
    id: "3",
    name: "ExpressPay Market",
    address: "89 Flatbush Ave, Brooklyn, NY 11217",
    distance: "2.5 mi away",
    hours: "Daily: 10AM–9PM",
    isOpen: false,
    lat: 40.6782,
    lng: -73.9442,
  },
];

export function CashPickup() {
  const { wallet } = useWallet();
  const [amount, setAmount] = useState<number | null>(null);
  const [amountInput, setAmountInput] = useState<string>("");
  const [transferStatus, setTransferStatus] = useState<TransferStatus>("idle");
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [completedRequests, setCompletedRequests] = useState<CashPickupRequest[]>([]);
  const [showQrForRequest, setShowQrForRequest] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('cashPickupRequests');
      if (stored) {
        setCompletedRequests(JSON.parse(stored));
      }
    } catch (e) {
      // Failed to load stored requests
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cashPickupRequests', JSON.stringify(completedRequests));
    } catch (e) {
      // Failed to save requests
    }
  }, [completedRequests]);
  useEffect(() => {
    if (transferStatus !== "processing" || !transactionId || !wallet) return;

    let cancelled = false;
    const intervalMs = 1000;
    const timeoutMs = 60000;

    const poll = async () => {
      try {
        if (typeof wallet.experimental_transaction !== 'function') {
          return;
        }
        const txStatus = await wallet.experimental_transaction(transactionId);
        
        if (!cancelled && txStatus?.status === "success") {
          setTransferStatus("success");
        } else if (!cancelled && txStatus?.status === "failed") {
          setTransferStatus("error");
          setTimeout(() => {
            if (!cancelled) {
              setTransferStatus("idle");
            }
          }, 3000);
        }
      } catch (err) {
        // Non-fatal: keep polling
      }
    };

    const intervalId = setInterval(poll, intervalMs);
    poll();

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setTransferStatus("success");
      }
    }, timeoutMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [transferStatus, transactionId, wallet]);

  useEffect(() => {
    if (transferStatus === "success" && selectedAgent && transactionHash && amount) {
      try {
        window.dispatchEvent(
          new CustomEvent('offramp:success', { detail: { amount } })
        );
      } catch {}

      const qrData = JSON.stringify({
        transactionHash,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        agentAddress: selectedAgent.address,
        amount: amount.toFixed(2),
      });

      const newRequest: CashPickupRequest = {
        id: transactionHash,
        agent: selectedAgent,
        amount,
        transactionHash,
        timestamp: Date.now(),
        qrCodeData: qrData,
      };

      setCompletedRequests((prev) => [newRequest, ...prev]);

      const resetTimeout = setTimeout(() => {
        setAmount(null);
        setAmountInput("");
        setTransferStatus("idle");
        setTransactionHash(null);
        setTransactionId(null);
        setSelectedAgent(null);
        setShowMap(false);
      }, 3000);
      
      return () => clearTimeout(resetTimeout);
    }
  }, [transferStatus, selectedAgent, transactionHash, amount]);

  async function handleCashPickup() {
    if (wallet == null || !amount || amount <= 0) {
      setTransferStatus("error");
      setTimeout(() => setTransferStatus("idle"), 3000);
      return;
    }

    if (!MOCK_UP_ADDRESS) {
      setTransferStatus("error");
      setTimeout(() => setTransferStatus("idle"), 3000);
      return;
    }

    try {
      setTransferStatus("processing");
      setTransactionHash(null);
      setTransactionId(null);

      const txn = await wallet.send(
        MOCK_UP_ADDRESS,
        USDC_TOKEN,
        amount.toString()
      );

      setTransactionHash(txn.hash || "");
      setTransactionId(txn.transactionId || "");
    } catch (err) {
      setTransferStatus("error");
      setTimeout(() => {
        setTransferStatus("idle");
      }, 3000);
    }
  }

  const isLoading = transferStatus === "processing";
  const hasCompletedRequests = completedRequests.length > 0;

  const getQrCodeData = () => {
    if (showQrForRequest) {
      const request = completedRequests.find(r => r.id === showQrForRequest);
      return request?.qrCodeData || "";
    }
    if (transferStatus === "success" && selectedAgent && transactionHash && amount) {
      return JSON.stringify({
        transactionHash,
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
        agentAddress: selectedAgent.address,
        amount: amount.toFixed(2),
      });
    }
    return "";
  };

  const qrCodeData = getQrCodeData();

  if (showMap && !selectedAgent) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm p-5 flex flex-col h-full">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Select an Agent</h3>
            <p className="text-sm text-gray-500 mt-0.5">Choose a location to pick up your cash</p>
          </div>
          <button
            onClick={() => setShowMap(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Agent List */}
        <div className="space-y-3 flex-1 overflow-y-auto -mx-1 px-1">
          {MOCK_AGENTS.map((agent) => (
            <div
              key={agent.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Business Name */}
                  <h4 className="font-semibold text-gray-900 text-base mb-2">{agent.name}</h4>
                  
                  {/* Address */}
                  <div className="flex items-start gap-2 mb-3">
                    <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-sm text-gray-700 leading-relaxed">{agent.address}</span>
                  </div>
                  
                  {/* Divider */}
                  <div className="border-t border-gray-100 my-3"></div>
                  
                  {/* Hours and Distance */}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{agent.hours}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{agent.distance}</span>
                    </div>
                  </div>
                </div>
                
                {/* Right Column: Select Button */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <button
                    onClick={() => setSelectedAgent(agent)}
                    className="px-5 py-2.5 bg-[#FFE327] text-black rounded-lg text-sm font-semibold hover:bg-[#FFD700] transition-colors shadow-sm"
                  >
                    Select
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6 flex flex-col h-full">
      <div className="flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-center gap-3 min-h-[28px]">
          <h3 className="text-lg font-semibold">Cash Pickup</h3>
        </div>

        {/* Main Form - Smaller when there are completed requests */}
        <div className={cn("transition-all", hasCompletedRequests ? "opacity-75 scale-95" : "")}>
          {transferStatus === "success" ? (
          <div className="flex flex-col gap-6 items-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-gray-900 mb-2 text-lg">
                Cash Pickup Request Confirmed
              </h4>
              <p className="text-sm text-gray-600 max-w-sm mb-4">
                Visit the agent location below to collect your cash. Show the QR code to the agent for verification.
              </p>
            </div>

            {/* Agent Location */}
            {selectedAgent && (
              <div className="w-full bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#038de1] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div className="flex-1">
                    <h5 className="font-semibold text-gray-900 text-sm">{selectedAgent.name}</h5>
                    <p className="text-xs text-gray-600 mt-1">{selectedAgent.address}</p>
                    <p className="text-xs text-gray-500 mt-1">{selectedAgent.hours}</p>
                  </div>
                </div>
              </div>
            )}

            {/* QR Code */}
            {qrCodeData && (
              <div className="flex flex-col items-center gap-3 mt-2">
                <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                  <QRCodeSVG value={qrCodeData} size={200} level="M" />
                </div>
                <p className="text-xs text-gray-500 text-center max-w-xs">
                  Show this QR code to the agent to receive your cash
                </p>
              </div>
            )}
          </div>
        ) : transferStatus === "processing" ? (
          <div className="flex flex-col gap-4 items-center py-6">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center animate-spin">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-gray-900 mb-1">
                Processing Request
              </h4>
              <p className="text-sm text-gray-500">
                Please wait while we process your cash pickup request...
              </p>
            </div>
          </div>
        ) : !selectedAgent ? (
          <div className="flex flex-col gap-4 items-center py-8">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[#038de1]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="font-semibold text-gray-900 mb-2">
                Find a Western Union Agent
              </h4>
              <p className="text-sm text-gray-600 mb-6 max-w-sm">
                Select an agent location near you to pick up your cash
              </p>
            </div>
            <button
              onClick={() => setShowMap(true)}
              className="w-full py-3 px-4 rounded-full text-sm font-medium bg-[#FFE327] text-black hover:bg-[#FFD700] transition-colors"
            >
              Find an Agent
            </button>
          </div>
        ) : (
          <>
            {/* Selected Agent Info */}
            <div className="bg-gray-50 rounded-lg p-4 border">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 text-sm">{selectedAgent.name}</h4>
                  <p className="text-xs text-gray-600 mt-1">{selectedAgent.address}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedAgent.distance} · {selectedAgent.hours}</p>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Enter amount to send
              </label>
              <div className="relative">
                <span
                  className={cn(
                    "absolute left-0 top-0 text-4xl font-bold pointer-events-none",
                    amount && amount > 0 ? "text-gray-900" : "text-gray-400"
                  )}
                >
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={amountInput}
                  className={cn(
                    "text-4xl font-bold bg-transparent border-none outline-none w-full pl-8 placeholder-gray-400 placeholder-opacity-100 focus:placeholder-gray-400 focus:placeholder-opacity-100",
                    amount && amount > 0 ? "text-gray-900" : "text-gray-400 focus:text-gray-400"
                  )}
                  placeholder="0.00"
                  onChange={(e) => {
                    const value = e.target.value;
                    setAmountInput(value);

                    if (value === "") {
                      setAmount(null);
                    } else {
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue)) {
                        setAmount(numValue);
                      }
                    }
                  }}
                  style={{
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* Fees Display */}
            {amount && amount > 0 ? (
              <div className="mt-4 mb-6 space-y-1">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>Fee (3%)</span>
                  <span>${(amount * 0.03).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-base font-semibold text-gray-900 pt-1 border-t border-gray-200">
                  <span>You will receive</span>
                  <span>${(amount * 0.97).toFixed(2)} in cash</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 mb-6"></div>
            )}

            {/* Send Cash Request Button */}
            <button
              className={cn(
                "w-full py-3 px-4 rounded-full text-sm font-medium transition-colors",
                isLoading || !amount
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#FFE327] text-black hover:bg-[#FFD700]"
              )}
              onClick={handleCashPickup}
              disabled={isLoading || !amount}
            >
              {isLoading ? "Processing..." : "Send Cash Request"}
            </button>
          </>
          )}
        </div>

        {/* Completed Requests List */}
        {hasCompletedRequests && (
          <div className="mt-6 border-t pt-6">
            <h4 className="text-base font-semibold text-gray-900 mb-4">
              Your Cash Pickup Requests
            </h4>
            <div className="space-y-3">
              {completedRequests.map((request) => (
                <div
                  key={request.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-[#038de1]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <h5 className="font-semibold text-gray-900 text-sm">
                          {request.agent.name}
                        </h5>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">{request.agent.address}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>${request.amount.toFixed(2)}</span>
                        <span>•</span>
                        <span>{formatDate(request.timestamp)}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowQrForRequest(showQrForRequest === request.id ? null : request.id)}
                      className="ml-4 px-3 py-2 text-xs font-medium rounded-lg bg-[#FFE327] text-black hover:bg-[#FFD700] transition-colors"
                    >
                      {showQrForRequest === request.id ? "Hide QR" : "Show QR"}
                    </button>
                  </div>

                  {/* QR Code for this request */}
                  {showQrForRequest === request.id && request.qrCodeData && (
                    <div className="mt-4 pt-4 border-t flex flex-col items-center gap-3">
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-200">
                        <QRCodeSVG value={request.qrCodeData} size={180} level="M" />
                      </div>
                      <p className="text-xs text-gray-500 text-center max-w-xs">
                        Show this QR code to the agent to receive your cash
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

