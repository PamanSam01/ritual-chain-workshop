# Privacy-Preserving AI Bounty Judge

> **A decentralized, sybil-resistant bounty evaluation platform powered by Ritual's AI Coprocessors and secured by a Commit-Reveal architecture.**

![Solidity](https://img.shields.io/badge/Solidity-%23363636.svg?style=for-the-badge&logo=solidity&logoColor=white) ![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Ritual Chain](https://img.shields.io/badge/Ritual%20Chain-Indigo?style=for-the-badge) ![Commit-Reveal](https://img.shields.io/badge/Commit--Reveal-Green?style=for-the-badge) ![AI Precompile](https://img.shields.io/badge/AI%20Precompile-Amber?style=for-the-badge)

---

## 📖 Project Overview

The **Privacy-Preserving AI Bounty Judge** is a decentralized application designed to facilitate fair, competitive technical bounties. It leverages the **Ritual Chain** for on-chain Large Language Model (LLM) inference and implements a **Commit-Reveal** cryptographic scheme to guarantee that participants cannot plagiarize each other's submissions before the judging phase begins.

---

## 🚫 The Problem

In a standard smart contract architecture, all transaction data is public. If a bounty platform allows users to submit answers directly to the blockchain, early submissions become visible to everyone. Malicious actors can easily scrape the mempool or block explorer, copy the best answers, and submit them as their own.

```text
[Jez] ---> Submits brilliant answer (Plaintext) ---> [Blockchain]
                                                             |
[Eve]   <--- Reads Jez's answer from block data <----------+
  |
  +--------> Submits identical answer as her own ----> [Blockchain]
```

This fundamentally breaks the competitive integrity of technical bounties.

---

## 💡 My Solution

To eliminate plagiarism without introducing the gas overhead of on-chain decryption or centralized key management, I implemented a **Commit-Reveal Architecture**.

```text
PHASE 1: COMMIT
[Jez] ---> Hashes(Answer + Salt) ---> Submits Hash (Commitment) ---> [Blockchain]
[Eve]   ---> Sees Hash (Cannot read answer)

PHASE 2: REVEAL
[Jez] ---> Submits Plaintext Answer + Salt ---> [Blockchain verifies Hash]
```

By enforcing a dual-deadline lifecycle, submissions remain entirely private until all participants are locked in. Only then are the answers revealed and judged by the Ritual AI Coprocessor.

---

## 🏗️ Architecture

The system consists of three integrated layers:

1. **Smart Contract Layer (`AIJudge.sol`)**: A Solidity contract deployed on Ritual Chain that orchestrates the bounty lifecycle, escrow, and commit-reveal cryptographic verification.
2. **Frontend Layer (Next.js)**: A React-based web application that handles client-side Keccak256 hashing, persistent `localStorage` salt management, and interacting with the Ritual network via Wagmi/Viem.
3. **Ritual AI Layer**: An integrated LLM precompile (`0x...0802`) that ingests all revealed submissions simultaneously and ranks them based on the creator's rubric.

---

## ⚙️ Smart Contract Flow

1. **Create Bounty**: The creator funds the contract with RITUAL tokens, defines the scoring rubric, and sets two strict deadlines: `submissionDeadline` and `revealDeadline`.
2. **Commit Submission**: Participants compute a local hash (`keccak256(answer + salt + address + bountyId)`) and submit only this 32-byte hash.
3. **Reveal Submission**: After the submission window closes, participants submit their raw text and salt. The contract hashes them on-chain and verifies the commitment.
4. **AI Judging**: Once the reveal window closes, the creator invokes `judgeAll()`. The contract calls the Ritual AI precompile to evaluate all valid, revealed submissions.
5. **Finalize Winner**: The creator reviews the AI's advisory output and triggers `finalizeWinner()`, releasing the locked tokens to the victor.

---

## 🛡️ Security Design

| Feature | Implementation Mechanism |
| :--- | :--- |
| **Commit-Reveal** | Answers remain private until the submission deadline passes. |
| **Replay Protection** | `keccak256` payload includes `msg.sender` and `bountyId` to prevent copying hashes. |
| **Front-running Protection** | Salts are 32-byte cryptographically secure random values generated via Web Crypto API. |
| **Reentrancy Protection** | Rewards are paid via CEI (Checks-Effects-Interactions) pattern after state finalization. |
| **Winner Validation** | Contract strictly requires `bounty.submissions[winnerIndex].revealed == true`. |
| **Duplicate Commit Protection** | Enforced via `mapping(uint256 => mapping(address => bool)) hasCommitted`. |

---

## 🖥️ Frontend Synchronization Work

Upgrading the starter frontend to support the advanced Commit-Reveal contract required significant re-engineering. I personally implemented:

- **Dual Deadlines**: Migrated from a single timeline to a phased UI managing both `submissionDeadline` and `revealDeadline`.
- **Client-Side Cryptography**: Integrated `viem` (`keccak256`, `encodePacked`) and `window.crypto.getRandomValues` to generate secure, verifiable hashes locally.
- **State Persistence**: Implemented a robust `localStorage` layer (`ritual_commit_{bountyId}_{address}`) to safely store the user's plaintext answer and salt between the commit and reveal phases.
- **Workflow Gating**: Built strict rendering logic (`canCommit`, `canReveal`) to prevent UI components from displaying out of phase or submitting invalid transactions.

---

## ✅ Real Deployment Validation

This implementation is not theoretical. It has been deployed and fully validated on the live **Ritual Chain Testnet**.

**Deployed Contract Address**:  
[`0x484d7Ca691826B68E3085883F91Ea254A5866461`](https://explorer.ritualfoundation.org)

**End-to-End Test Execution**:
- [x] **Create Bounty**: Successfully deployed a 0.1 RITUAL bounty with strict dual deadlines.
- [x] **Commit**: Locally hashed an answer and submitted the commitment transaction.
- [x] **Reveal**: Successfully verified the commitment on-chain using the stored `localStorage` salt.
- [x] **Judge**: Triggered the AI Precompile, successfully processing the LLM advisory output.
- [x] **Finalize Winner**: Disbursed the 0.1 RITUAL reward to the validated submitter.

---

## 🧠 Lessons Learned

During development, several complex architectural hurdles were overcome:

- **Ritual Timestamp Handling**: Standard EVM networks measure `block.timestamp` in seconds. Ritual Testnet measures it in **milliseconds**. This caused immediate reverts (`invalid submission deadline`). I built a dynamic `normalizeTs` utility to gracefully handle cross-network timestamp precision variations.
- **RPC Gas Estimation Rejections**: MetaMask frequently attempts to simulate transactions with a default gas limit of `70,000,000`. On the Ritual Testnet, this exceeded the maximum block gas limit, causing `eth_estimateGas` to be rejected outright. I resolved this by manually injecting a static `gas: 3000000n` override into the Wagmi transaction payload.
- **Commit-Reveal UX Tradeoffs**: Because the raw answer is never sent to a backend, losing the browser cache guarantees the loss of the submission. Communicating this risk to the user via clear UI alerts became a critical design requirement.

---

## ⚠️ Known Limitations

- **`localStorage` Dependency**: Users who clear their browser data or switch devices between the commit and reveal phases will be unable to decrypt their submissions.
- **`MAX_SUBMISSIONS` Griefing Vector**: To prevent out-of-gas errors during the AI array iteration, submissions are capped at 10. A malicious actor could spam 10 invalid commitments to lock out legitimate developers.
- **Owner-Controlled Prompts**: The `judgeAll` function relies on the frontend passing the `llmInput` payload. While the contract ensures only revealed submissions are evaluated, a malicious bounty creator could technically alter the prompt wrapper sent to the LLM.

---

## 🚀 Future Improvements

- **Staking Mechanism**: Requiring a small RITUAL stake to commit an answer would drastically reduce spam and mitigate the `MAX_SUBMISSIONS` griefing vector.
- **TEE-Based Autonomous Judging**: Leveraging Trusted Execution Environments (TEEs) could allow the contract to automatically trigger `judgeAll` at the exact block the reveal deadline passes, removing reliance on the owner.
- **Automated Reveal Reminders**: Integrating an off-chain indexer to email or notify users when their specific reveal window opens.
- **Decentralized Prompt Generation**: Generating the LLM prompt wrapper strictly on-chain or within a coprocessor to prevent owner manipulation.

---

## 📂 Repository Structure

```text
├── hardhat/                    # Smart Contract Environment
│   ├── contracts/
│   │   ├── AIJudge.sol         # Commit-Reveal Contract
│   │   └── utils/              # Precompile Interfaces
│   └── hardhat.config.ts       # Ritual Network Configuration
│
└── web/                        # Next.js Frontend
    ├── src/
    │   ├── abi/                # Contract Interfaces
    │   ├── components/         # React UI & Transaction Handlers
    │   ├── hooks/              # Wagmi & Custom React Hooks
    │   └── lib/                # Hashing, Timestamps & Ritual LLM Logic
    └── next.config.ts          # Application Configuration
```

---

## 🏎️ Quick Start

### 1. Smart Contract (Hardhat)
```bash
cd hardhat
pnpm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network ritual
```

### 2. Frontend (Next.js)
```bash
cd web
pnpm install
# Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local
pnpm run dev
```

---

*Built for the future of privacy-preserving, AI-powered applications on the Ritual Chain.*
