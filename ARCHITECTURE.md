# Privacy-Preserving AI Bounty Judge: System Architecture

This document provides a comprehensive technical breakdown of the `AIJudge.sol` smart contract system designed for the Ritual Academy. It analyzes the architectural evolution from the baseline workshop state to a robust privacy-preserving protocol, evaluating system boundaries, trust assumptions, and security models.

---

## 1. Current Workshop Architecture

The baseline workshop architecture relies on a fully transparent, single-phase submission process:

```text
[Participant] --(Plaintext Answer)--> [AIJudge.sol] <--(LLM Input)-- [Owner]
                                           |
                                      [Precompile]
                                           |
                                      [Ritual Node]
```
**Flaw:** Because answers are plaintext, the blockchain acts as a public broadcast layer. MEV bots or malicious participants can easily read mempool transactions or historical blocks to steal high-effort prompts and submissions.

## 2. Commit-Reveal Architecture

To introduce privacy without moving state off-chain prematurely, the architecture is upgraded to a phased cryptographic Commit-Reveal system.

```text
  [Participants]                  [AIJudge.sol]                  [Bounty Owner]
        |                               |                              |
        |---- 1. submitCommitment ----->|                              |
        |    (Keccak256 Hash + Salt)    |                              |
        |                               |                              |
      ================== (Submission Deadline Ends) ==================
        |                               |                              |
        |---- 2. revealAnswer --------->|                              |
        |    (Plaintext + Salt)         |                              |
        |                               |                              |
        |---- (Contract Verifies) ----->|                              |
        |                               |                              |
      ==================== (Reveal Deadline Ends) ====================
        |                               |                              |
        |                               |<------- 3. judgeAll ---------|
        |                               |-----(LLM Precompile)-------->|
        |                               |                              |
        |<------- 4. Reward Paid -------|<----- 5. finalizeWinner -----|
```
**Advantage:** Submissions remain cryptographically hidden during the active contest phase. The public ledger only stores verifiable commitments.

## 3. Ritual-Native TEE Architecture

While the Commit-Reveal solves participant-to-participant plagiarism, the current implementation still relies on the Bounty Owner to correctly format the `llmInput` off-chain. In a fully mature, production-ready Ritual deployment, the architecture should leverage Trusted Execution Environments (TEEs) to eliminate owner-side prompt injection.

```text
[AIJudge.sol] ----(Bounty ID)----> [Ritual TEE Node]
                                         |
                            (Node reads contract state)
                            (Node concatenates revealed answers)
                            (Node runs LLM inference)
                                         |
[AIJudge.sol] <---(Cryptographic Proof + Winner Index)
```
In this target architecture, the smart contract does not accept raw `llmInput` bytes from the caller. Instead, the Ritual Node directly queries the `bounty.submissions` array, inherently ignoring unrevealed submissions, and returns a verified AI judgment.

## 4. On-chain Components

* **State Machine:** Governed by strict time-locks (`submissionDeadline`, `revealDeadline`).
* **Storage Mappings:** 
  * `hasCommitted`: Provides O(1) duplicate prevention.
  * `userSubmissionIndex`: Provides O(1) lookup during the reveal phase, avoiding expensive loops.
* **Precompile Consumer:** Integrates with Ritual's `LLM_INFERENCE_PRECOMPILE` to process arbitrary AI workflows.

## 5. Off-chain Components

* **Frontend / CLI Client:** Responsible for generating random 32-byte salts and performing local Keccak256 hashing.
* **LLM Input Formatter:** An off-chain script (currently run by the owner) that parses the on-chain `revealed` submissions and constructs the JSON prompt payload to be sent into `judgeAll()`.

## 6. Trust Assumptions

The current system operates under several explicit trust assumptions:
1. **Participant Secrecy:** Participants will not leak their `salt` or plaintext answers off-chain before the reveal deadline.
2. **Owner Honesty (Prompting):** The owner will not maliciously alter the `llmInput` payload to force the LLM to select a specific index. *(Note: The contract mitigates the worst case by hard-rejecting unrevealed indices during finalization).*
3. **Precompile Availability:** The Ritual precompile node is online and functioning correctly during the `judgeAll` execution window.

## 7. AI Batch Judging Flow

Rather than making an individual LLM call for every submission (which is highly gas-inefficient and computationally expensive), the architecture utilizes a **Batch Judging** approach. 
1. The off-chain client fetches all submissions where `revealed == true`.
2. The client injects the `rubric` and all valid `answers` into a single, cohesive LLM prompt.
3. `judgeAll()` pushes this single payload to the Ritual network.
4. The LLM processes the batch contextually and outputs a single `winnerIndex` inside the `completionData`.

**Key Benefit:** Exactly one LLM call is made for all revealed submissions combined. The design intentionally avoids one LLM call per submission to minimize on-chain transaction overhead and ensure the AI can evaluate answers relatively against each other.

## 8. Human-in-the-loop Finalization

The system decouples the AI inference (`judgeAll`) from the actual value transfer (`finalizeWinner`). 
* **Why?** LLMs are non-deterministic and prone to hallucination.
* **Mechanism:** The AI outputs its decision to `aiReview`. The bounty owner reviews this output off-chain. If the AI hallucinates an invalid index or acts erratically, the owner acts as the final safety circuit. They manually invoke `finalizeWinner` with the chosen index, at which point the smart contract validates that the chosen submission was legally revealed.

## 9. Privacy Analysis

* **Confidentiality:** Guaranteed during the commit phase via strict Keccak256 hashing.
* **Integrity:** Guaranteed by the commitment formula `keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))`. Including `msg.sender` prevents replay attacks where a user copies another user's hash, and `bountyId` prevents cross-bounty replay attacks.
* **Availability:** Ensuring participants can reveal their answers is guaranteed by Ethereum/Base block availability.

## 10. Security Analysis

* **Frontrunning:** Neutered by the commit-reveal architecture.
* **Sybil Attacks / Griefing:** A known vector exists where an attacker could submit 10 garbage hashes to fill the `MAX_SUBMISSIONS` limit and never reveal them. *Mitigation Note: Future iterations require a minimum ETH stake to submit a commitment, which is slashed if the user fails to reveal.*
* **Zero-Reveal Deadlocks:** If the reveal deadline passes with 0 valid answers, the system averts locked funds via the `cancelBounty` function, securely returning the reward to the creator.
* **Reentrancy:** State updates (setting `finalized = true` and `reward = 0`) strictly occur *before* the external `.call{value: reward}("")` in both finalization and cancellation flows (Checks-Effects-Interactions pattern).
