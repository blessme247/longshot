import { QueryClientProvider } from "@tanstack/react-query";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import { MotionConfig } from "framer-motion";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { queryClient } from "./lib/query-client";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

// Connection is only used by the adapter plumbing — sign-in is message-only,
// no transactions are ever sent from the user's wallet.
const endpoint = clusterApiUrl(WalletAdapterNetwork.Mainnet);
const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <MotionConfig reducedMotion="user">
              <App />
            </MotionConfig>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
