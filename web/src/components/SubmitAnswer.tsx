"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { keccak256, encodePacked, bytesToHex } from "viem";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canCommit, canReveal, type Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function SubmitAnswer({
  bountyId,
  bounty,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onSubmitted: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [answer, setAnswer] = useState("");
  const [storedData, setStoredData] = useState<{answer: string, salt: `0x${string}`} | null>(null);
  const now = useNow();

  const commitActive = canCommit(bounty, now / 1000);
  const revealActive = canReveal(bounty, now / 1000);

  const { data: hasCommitted } = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "hasCommitted",
    args: [bountyId, address as `0x${string}`],
    query: { enabled: !!address && !!contractAddress }
  });

  // Need userSubmissionIndex to check if revealed
  const { data: userIndex } = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "userSubmissionIndex",
    args: [bountyId, address as `0x${string}`],
    query: { enabled: !!address && !!contractAddress && !!hasCommitted }
  });

  const { data: submissionData } = useReadContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "getSubmission",
    args: [bountyId, userIndex as bigint],
    query: { enabled: !!contractAddress && userIndex !== undefined && hasCommitted }
  });

  const isRevealed = submissionData ? submissionData[3] : false;

  const storageKey = `ritual_commit_${bountyId.toString()}_${address}`;

  useEffect(() => {
    if (address) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          setStoredData(JSON.parse(saved));
        } catch {}
      }
    }
  }, [address, storageKey]);

  const tx = useWriteTx(() => {
    setAnswer("");
    onSubmitted();
  });

  // Neither phase is active for this user (closed, or already finalized)
  if (!commitActive && !revealActive) return null;

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress || !address) return;
    try {
      const salt = bytesToHex(window.crypto.getRandomValues(new Uint8Array(32)));
      const commitment = keccak256(
        encodePacked(
          ["string", "bytes32", "address", "uint256"],
          [answer.trim(), salt, address, bountyId]
        )
      );

      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitCommitment",
        args: [bountyId, commitment],
        chainId: ritualChain.id,
      });

      // Save to local storage upon successful wallet confirmation
      localStorage.setItem(storageKey, JSON.stringify({ answer: answer.trim(), salt }));
      setStoredData({ answer: answer.trim(), salt });
    } catch {
      // surfaced via tx.state
    }
  }

  async function handleReveal() {
    if (!contractAddress || !address || !storedData) return;
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, storedData.answer, storedData.salt],
        chainId: ritualChain.id,
      });
    } catch {}
  }

  return (
    <Card>
      <CardHeader
        title={commitActive ? "Submit an answer (Commit)" : "Reveal your answer"}
        subtitle={
          commitActive
            ? "Your answer is hashed. You must return to reveal it after the deadline."
            : "The submission phase has ended. Reveal your answer to the judges."
        }
      />
      <CardBody>
        {commitActive && !hasCommitted && (
          <form onSubmit={handleCommit} className="space-y-3">
            <Notice tone="amber">
              Your answer will be stored locally in this browser. Do not clear your cache until you reveal!
            </Notice>
            <Field label="Your answer">
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={5}
                placeholder="Write your submission…"
              />
            </Field>
            <Button
              type="submit"
              disabled={!isConnected || !answer.trim() || tx.isBusy}
              className="w-full"
            >
              {tx.isBusy ? "Hashing & Submitting…" : "Commit Answer"}
            </Button>
            {!isConnected && (
              <p className="text-xs text-zinc-500">
                Connect your wallet to submit.
              </p>
            )}
          </form>
        )}

        {commitActive && hasCommitted && (
          <Notice tone="green">
            You have successfully committed your answer. Please return after the submission deadline to reveal it.
          </Notice>
        )}

        {revealActive && hasCommitted && !isRevealed && (
          <div className="space-y-3">
            {!storedData ? (
              <Notice tone="red">
                We couldn't find your answer in local storage. If you cleared your browser data, you cannot reveal.
              </Notice>
            ) : (
              <>
                <Notice tone="green">Your answer is ready to be revealed!</Notice>
                <div className="rounded border border-white/10 p-3 text-sm text-zinc-300 whitespace-pre-wrap">
                  {storedData.answer}
                </div>
                <Button onClick={handleReveal} disabled={tx.isBusy} className="w-full">
                  {tx.isBusy ? "Revealing…" : "Reveal Answer"}
                </Button>
              </>
            )}
          </div>
        )}
        
        {revealActive && !hasCommitted && (
          <Notice tone="zinc">
            You did not participate in this bounty.
          </Notice>
        )}

        {revealActive && isRevealed && (
          <Notice tone="green">
            Your answer has been successfully revealed and is awaiting judgment!
          </Notice>
        )}

        <div className="mt-3">
          <TxStatus
            state={tx.state}
            error={tx.error}
            hash={tx.hash}
            explorerBase={explorerBase}
          />
        </div>
      </CardBody>
    </Card>
  );
}
