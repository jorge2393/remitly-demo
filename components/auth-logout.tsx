"use client";

import { useAuth } from "@crossmint/client-sdk-react-ui";
import Image from "next/image";

export function AuthLogout() {
  const { logout } = useAuth();

  return (
    <button
      className="flex items-center gap-2 py-2 px-3 rounded-full text-sm font-medium text-[#2b415a] bg-white hover:bg-gray-100 transition-colors border border-gray-200"
      onClick={logout}
    >
      Log out
      <Image src="/log-out.svg" alt="Logout" width={16} height={16} style={{ filter: 'brightness(0) saturate(100%) invert(25%) sepia(15%) saturate(1200%) hue-rotate(190deg) brightness(95%) contrast(90%)' }} />
    </button>
  );
}
