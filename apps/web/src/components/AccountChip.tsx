import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { fetchNonce, linkGuest, verifySignIn } from "@/lib/api";
import {
  clearSession,
  getSession,
  linkAlreadyOffered,
  markLinkOffered,
  storeSession,
  truncateAddress,
} from "@/lib/auth";
import { getUserId } from "@/lib/user";
import { cn } from "@/lib/utils";

export function AccountChip({ onIdentityChange }: { onIdentityChange: () => void }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();
  const [linkOffer, setLinkOffer] = useState(false);

  const session = getSession();

  const signIn = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage) throw new Error("wallet not ready");
      const { nonce, message } = await fetchNonce();
      const signature = await signMessage(new TextEncoder().encode(message));
      return verifySignIn({
        pubkey: publicKey.toBase58(),
        signature: btoa(String.fromCharCode(...signature)),
        nonce,
      });
    },
    onSuccess: ({ token, pubkey }) => {
      storeSession(token, pubkey);
      if (!linkAlreadyOffered()) setLinkOffer(true);
      onIdentityChange();
      queryClient.invalidateQueries();
    },
  });

  const link = useMutation({
    mutationFn: () => linkGuest(getUserId()),
    onSettled: () => {
      markLinkOffered();
      setLinkOffer(false);
      queryClient.invalidateQueries();
    },
  });

  const signOut = () => {
    clearSession();
    void disconnect();
    onIdentityChange();
    queryClient.invalidateQueries();
  };

  const chipClass =
    "rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-line-bright";

  return (
    <div className="flex flex-col items-end gap-2">
      {session ? (
        <button onClick={signOut} className={cn(chipClass, "text-gold")}>
          {truncateAddress(session.pubkey)}
        </button>
      ) : connected && publicKey ? (
        <button
          onClick={() => signIn.mutate()}
          disabled={signIn.isPending}
          className={cn(chipClass, "border-gold/50 text-gold")}
        >
          {signIn.isPending ? "Check wallet…" : "Sign in"}
        </button>
      ) : (
        <button onClick={() => setVisible(true)} className={cn(chipClass, "text-ink-muted")}>
          Connect wallet
        </button>
      )}

      {signIn.isError && (
        <p className="text-[10px] text-loss">{(signIn.error as Error).message}</p>
      )}

      {linkOffer && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-muted">
          Keep your guest picks on this wallet?
          <button
            onClick={() => link.mutate()}
            disabled={link.isPending}
            className="font-semibold text-gold"
          >
            Link
          </button>
          <button
            onClick={() => {
              markLinkOffered();
              setLinkOffer(false);
            }}
            className="text-ink-faint"
          >
            No
          </button>
        </div>
      )}
    </div>
  );
}
