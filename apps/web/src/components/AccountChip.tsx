import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { fetchFixtures, fetchNonce, fetchPicks, linkGuest, verifySignIn } from "@/lib/api";
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
  // Pubkey the auto sign-in already fired for in THIS connected session —
  // prevents re-firing on unrelated wallet state changes (esp. disconnect,
  // where a stale adapter made signMessage throw and wedged the UI).
  const attemptedFor = useRef<string | null>(null);

  const session = getSession();

  const signIn = useMutation({
    mutationFn: async () => {
      // Re-checked at call time: the adapter can vanish between the effect
      // scheduling this and it actually running.
      if (!connected || !publicKey || typeof signMessage !== "function") {
        throw new Error("wallet not connected");
      }
      const { nonce, message } = await fetchNonce();
      const signature = await signMessage(new TextEncoder().encode(message));
      const auth = await verifySignIn({
        pubkey: publicKey.toBase58(),
        signature: btoa(String.fromCharCode(...signature)),
        nonce,
      });
      let guestPickCount = 0;
      if (!linkAlreadyOffered()) {
        const fixtureIds = (await fetchFixtures()).map((f) => f.fixtureId);
        guestPickCount = (await fetchPicks(getUserId(), fixtureIds)).length;
      }
      return { ...auth, guestPickCount };
    },
    onSuccess: ({ token, pubkey, guestPickCount: count }) => {
      storeSession(token, pubkey);
      if (count > 0) setGuestPickCount(count);
      onIdentityChange();
      void queryClient.invalidateQueries();
    },
  });

  const { mutate: fireSignIn, reset: resetSignIn, isPending, isError } = signIn;

  // The persisted session (localStorage HMAC token) is the source of truth
  // for auth — it survives refresh and tab reopen independently of the
  // wallet adapter's connection state, which starts !connected on every load
  // before autoConnect resolves. We must NOT clear the session just because
  // the adapter reports disconnected; only an explicit user action does that.
  useEffect(() => {
    if (!connected) {
      attemptedFor.current = null;
    }
  }, [connected]);

  // Connect→sign is one continuous flow, gated strictly on a live, capable,
  // signed-out adapter, at most once per pubkey per connection. Skips
  // entirely when a session already exists (refresh path).
  useEffect(() => {
    if (
      connected &&
      publicKey &&
      typeof signMessage === "function" &&
      !getSession() &&
      !isPending &&
      attemptedFor.current !== publicKey.toBase58()
    ) {
      attemptedFor.current = publicKey.toBase58();
      fireSignIn();
    }
  }, [connected, publicKey, signMessage, isPending, fireSignIn]);

  // Explicit sign-out only: clears the session, disconnects the wallet, and
  // resets the sign-in machine to idle.
  const handleDisconnect = () => {
    clearSession();
    resetSignIn();
    attemptedFor.current = null;
    void disconnect();
    onIdentityChange();
    void queryClient.invalidateQueries();
  };

  const link = useMutation({
    mutationFn: () => linkGuest(getUserId()),
    onSettled: () => {
      markLinkOffered();
      setGuestPickCount(null);
      void queryClient.invalidateQueries();
    },
  });

  const chipClass =
    "rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:border-line-bright";

  return (
    <div className="flex flex-col items-end gap-2">
      {session ? (
        <button onClick={handleDisconnect} className={cn(chipClass, "text-gold")}>
          {truncateAddress(session.pubkey)}
        </button>
      ) : connected && publicKey ? (
        <button
          onClick={() => fireSignIn()}
          disabled={isPending}
          className={cn(chipClass, "border-gold/50 text-gold")}
        >
          {isPending ? "Check your wallet…" : isError ? "Retry sign-in" : "Check your wallet…"}
        </button>
      ) : (
        <button onClick={() => setVisible(true)} className={cn(chipClass, "text-ink-muted")}>
          Connect wallet
        </button>
      )}

      {isError && connected && (
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
