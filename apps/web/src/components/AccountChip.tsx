import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { fetchNonce, fetchPicks, linkGuest, verifySignIn } from "@/lib/api";
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
  const [guestPickCount, setGuestPickCount] = useState<number | null>(null);
  const autoSignAttempted = useRef(false);

  const session = getSession();

  const signIn = useMutation({
    mutationFn: async () => {
      if (!publicKey || !signMessage) throw new Error("wallet not ready");
      const { nonce, message } = await fetchNonce();
      const signature = await signMessage(new TextEncoder().encode(message));
      const auth = await verifySignIn({
        pubkey: publicKey.toBase58(),
        signature: btoa(String.fromCharCode(...signature)),
        nonce,
      });
      // Counted before the session token exists, so the request runs as the
      // guest identity rather than the freshly signed-in wallet.
      const guestPicks = linkAlreadyOffered() ? [] : await fetchPicks(getUserId());
      return { ...auth, guestPickCount: guestPicks.length };
    },
    onSuccess: ({ token, pubkey, guestPickCount: count }) => {
      storeSession(token, pubkey);
      if (count > 0) setGuestPickCount(count);
      onIdentityChange();
      void queryClient.invalidateQueries();
    },
  });

  // Connect and sign-in are one continuous flow: the signature request
  // opens as soon as the wallet connects.
  useEffect(() => {
    if (connected && signMessage && !session && !signIn.isPending && !autoSignAttempted.current) {
      autoSignAttempted.current = true;
      signIn.mutate();
    }
  }, [connected, signMessage, session, signIn]);

  const link = useMutation({
    mutationFn: () => linkGuest(getUserId()),
    onSettled: () => {
      markLinkOffered();
      setGuestPickCount(null);
      void queryClient.invalidateQueries();
    },
  });

  const signOut = () => {
    clearSession();
    autoSignAttempted.current = false;
    void disconnect();
    onIdentityChange();
    void queryClient.invalidateQueries();
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
          {signIn.isPending ? "Check your wallet…" : "Retry sign-in"}
        </button>
      ) : (
        <button onClick={() => setVisible(true)} className={cn(chipClass, "text-ink-muted")}>
          Connect wallet
        </button>
      )}

      {signIn.isError && (
        <p className="text-[10px] text-loss">{(signIn.error as Error).message}</p>
      )}

      {guestPickCount !== null && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-ink-muted">
          You made {guestPickCount} pick{guestPickCount === 1 ? "" : "s"} as a guest — bring
          {guestPickCount === 1 ? " it" : " them"} to this wallet?
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
              setGuestPickCount(null);
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
