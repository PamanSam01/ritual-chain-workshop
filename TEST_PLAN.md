# QA Test Plan: Privacy-Preserving AI Bounty Judge

This document outlines the comprehensive testing strategy for the `AIJudge.sol` smart contract, designed to ensure the integrity, security, and functional correctness of the Commit-Reveal bounty architecture.

---

## 1. Happy Path Testing

### 1.1 Complete Bounty Lifecycle (End-to-End)
* **Scenario:** 
  1. The Owner creates a bounty with valid `submissionDeadline` and `revealDeadline` in the future.
  2. A Participant submits a valid hash commitment before the `submissionDeadline`.
  3. Time advances past `submissionDeadline`.
  4. The Participant reveals their exact plaintext answer and salt.
  5. Time advances past `revealDeadline`.
  6. The Owner calls `judgeAll` utilizing the LLM precompile.
  7. The Owner finalizes the winner using the correct index.
* **Expected Result:** All state transitions succeed smoothly. The Participant receives the `reward` amount in their wallet. Events `BountyCreated`, `CommitmentSubmitted`, `AnswerRevealed`, `AllAnswersJudged`, and `WinnerFinalized` are emitted in the correct order.
* **Reason for Test:** To guarantee that the core functionality of the smart contract works exactly as intended under normal conditions.

---

## 2. Negative Tests

### 2.1 Commit After Deadline
* **Scenario:** A Participant attempts to call `submitCommitment` after the `submissionDeadline` has passed.
* **Expected Result:** Revert with `"submissions closed"`.
* **Reason for Test:** Ensures time-lock enforcement. Without this, users could observe partial reveals and construct commitments retroactively if constraints weren't absolute.

### 2.2 Duplicate Commitment
* **Scenario:** A Participant calls `submitCommitment` successfully, then tries to call it a second time using the same wallet address.
* **Expected Result:** Revert with `"already committed"`.
* **Reason for Test:** Prevents Sybil spamming from a single wallet and ensures fair representation across the `MAX_SUBMISSIONS` limit.

### 2.3 Reveal Before Submission Deadline
* **Scenario:** A Participant submits a commitment, then immediately attempts to call `revealAnswer` before the `submissionDeadline` has passed.
* **Expected Result:** Revert with `"submission phase still active"`.
* **Reason for Test:** Enforces the fundamental principle of Commit-Reveal. If early reveals are permitted, the privacy guarantee is shattered, allowing frontrunning.

### 2.4 Reveal After Reveal Deadline
* **Scenario:** A Participant waits too long and attempts to call `revealAnswer` after the `revealDeadline` has expired.
* **Expected Result:** Revert with `"reveal phase ended"`.
* **Reason for Test:** Ensures the judging phase can confidently begin without the state mutating underneath the off-chain batch processor.

### 2.5 Invalid Salt
* **Scenario:** A Participant attempts to reveal their answer but provides a slightly different `salt` than the one used during `submitCommitment`.
* **Expected Result:** Revert with `"invalid commitment"`.
* **Reason for Test:** Confirms the cryptographic integrity of the Keccak256 hash. The commitment strictly binds the answer to a specific salt.

### 2.6 Invalid Answer
* **Scenario:** A Participant attempts to reveal using the correct salt but slightly modifies their `answer` text.
* **Expected Result:** Revert with `"invalid commitment"`.
* **Reason for Test:** Proves that participants cannot change their minds or alter their submissions after observing what others are revealing.

### 2.7 Double Reveal
* **Scenario:** A Participant successfully reveals their answer, then attempts to call `revealAnswer` a second time.
* **Expected Result:** Revert with `"already revealed"`.
* **Reason for Test:** Prevents unnecessary state writes, event spamming, and potential logic bypasses during index mapping.

### 2.8 Judge Before Reveal Deadline
* **Scenario:** The Owner attempts to call `judgeAll` before the `revealDeadline` has expired.
* **Expected Result:** Revert with `"reveal phase not ended"`.
* **Reason for Test:** Protects late revealers. The AI judging batch must only be processed once all legitimate participants have had the chance to unmask their commitments.

### 2.9 Judge With No Revealed Submissions
* **Scenario:** Participants committed but none revealed their answers. The Owner attempts to call `judgeAll`.
* **Expected Result:** The contract's internal `bounty.submissions.length > 0` check will pass (because unrevealed commitments are in the array), but the LLM precompile should predictably fail and revert the transaction when it receives an empty context payload from the offchain script. (Note: The owner should use `cancelBounty` instead in this state).
* **Reason for Test:** Validates that the precompile safely rejects empty evaluations and doesn't hallucinate a winner when zero answers are provided.

### 2.10 Finalize Before Judging
* **Scenario:** The Owner bypasses `judgeAll` and attempts to directly call `finalizeWinner`.
* **Expected Result:** Revert with `"not judged yet"`.
* **Reason for Test:** Enforces the state machine sequence (`judged` must be `true` before `finalized` can become `true`).

### 2.11 Invalid Winner Index
* **Scenario:** The Owner attempts to finalize the bounty with an index that is completely out of bounds (e.g., index `15` when `submissions.length == 2`).
* **Expected Result:** Revert with `"invalid winner index"`.
* **Reason for Test:** Prevents array out-of-bounds panics and accidental loss of funds or bricked state.

### 2.12 Unrevealed Winner
* **Scenario:** The Owner attempts to call `finalizeWinner` passing the index of a user who committed but never revealed.
* **Expected Result:** Revert with `"unrevealed winner"`.
* **Reason for Test:** This is the most critical security check against Prompt Injection. It guarantees that an owner cannot collude with the AI to award the bounty to a phantom or unverified submission.

### 2.13 Cancel Bounty With Revealed Submissions
* **Scenario:** The `revealDeadline` has passed and at least one user has successfully revealed their answer. The Owner maliciously attempts to call `cancelBounty` to steal their reward back.
* **Expected Result:** Revert with `"revealed submissions exist"`.
* **Reason for Test:** Protects the labor of the participants. If a participant plays by the rules and reveals, the owner *must* proceed with judging and paying out the reward. Cancellation is only for 0-reveal deadlocks.

### 2.14 Exceed Max Submissions
* **Scenario:** `MAX_SUBMISSIONS` users have already committed. An additional user attempts to call `submitCommitment`.
* **Expected Result:** Revert with `"too many submissions"`.
* **Reason for Test:** Enforces array bounds to prevent out-of-gas errors during off-chain batch processing.

### 2.15 Reveal Without Commitment
* **Scenario:** A user who never called `submitCommitment` attempts to call `revealAnswer`.
* **Expected Result:** Revert with `"no commitment found"`.
* **Reason for Test:** Prevents users from bypassing the commit phase to inject answers directly during the reveal phase.

### 2.16 Answer Too Long
* **Scenario:** A user attempts to reveal an answer that exceeds `MAX_ANSWER_LENGTH`.
* **Expected Result:** Revert with `"answer too long"`.
* **Reason for Test:** Protects the contract and the off-chain precompile script from oversized payload spam.

### 2.17 Double Judge
* **Scenario:** The Owner successfully calls `judgeAll`, then attempts to call it a second time.
* **Expected Result:** Revert with `"already judged"`.
* **Reason for Test:** Enforces strict forward-only progression in the state machine.

### 2.18 Double Finalize
* **Scenario:** The Owner successfully calls `finalizeWinner`, then attempts to call it again.
* **Expected Result:** Revert with `"already finalized"`.
* **Reason for Test:** Prevents double-spending of the reward payout.

### 2.19 Cancel Before Reveal Deadline
* **Scenario:** The Owner attempts to call `cancelBounty` while the reveal phase is still active.
* **Expected Result:** Revert with `"reveal phase not ended"`.
* **Reason for Test:** Prevents the owner from prematurely pulling the plug on a bounty before participants have had their full window to reveal.
