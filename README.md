# 🛡️ Privacy-Preserving AI Bounty Judge

Welcome to the **Privacy-Preserving AI Bounty Judge** project, developed as a submission for the **Ritual Academy**. This project enhances the standard AI bounty architecture by introducing a robust Commit-Reveal cryptographic scheme, ensuring absolute fairness in on-chain competitive intelligence tasks.

---

## 1. Overview
The **Privacy-Preserving AI Bounty Judge** (`AIJudge.sol`) is an upgraded smart contract built to seamlessly integrate with the Ritual Network's LLM Precompile. It allows bounty creators to post natural language rubrics and developers to submit AI-evaluated answers. This upgraded version guarantees submission privacy during the active contest phase, preventing intellectual property theft and "lazy-copying" behaviors often seen in transparent ledgers.

## 2. Problem Statement
In traditional blockchain-based bounty systems, all data is inherently public. When participants submit their solutions, their answers are instantly visible on block explorers. In competitive environments—especially those relying on nuanced LLM prompts or creative answers—this transparency creates a toxic race condition. 

## 3. Why Public Submissions Are Unfair
- **Frontrunning & Plagiarism:** Latecomers can simply copy the best submissions from early participants.
- **Deterrence of Effort:** Genuine developers are disincentivized from putting in high effort if their work can be easily stolen.
- **Suboptimal Results:** The bounty creator ultimately receives homogeneous, slightly varied copies of the first good submission, rather than truly diverse, independent ideas.

## 4. Commit-Reveal Solution
To solve the transparency problem without sacrificing decentralization, this contract implements a **Commit-Reveal Scheme**. 
Instead of posting their plain-text answers on-chain, users first submit a cryptographic hash of their answer along with a secret salt. Once the submission deadline passes, all participants enter the "Reveal Phase" where they broadcast their plain-text answers. If the hash matches their previous commitment, the answer is accepted for judging.

## 5. Bounty Lifecycle
The life of a bounty flows through strict chronological phases:
1. **Creation:** The owner funds the bounty and sets distinct `submissionDeadline` and `revealDeadline` timestamps.
2. **Commit Phase:** Participants submit hashes of their work using `submitCommitment()`.
3. **Reveal Phase:** After the submission deadline, participants broadcast their plaintext answers and salts using `revealAnswer()`.
4. **Judging Phase:** After the reveal deadline, the owner invokes `judgeAll()`. Only successfully revealed submissions are sent to the Ritual LLM precompile.
5. **Finalization Phase:** The owner calls `finalizeWinner()`. The smart contract enforces that only a revealed submission can win, automatically distributing the locked reward.

*(Edge Case Mitigation: If no users reveal their commitments, the owner can invoke `cancelBounty()` to retrieve their locked funds.)*

## 6. Smart Contract Architecture
### Core Methods
- `createBounty(title, rubric, submissionDeadline, revealDeadline)`: Initializes the state machine.
- `submitCommitment(bountyId, commitment)`: Records the participant's hash.
- `revealAnswer(bountyId, answer, salt)`: Verifies and exposes the participant's plaintext.
- `judgeAll(bountyId, llmInput)`: Passes the revealed payload to the Ritual LLM Precompile.
- `finalizeWinner(bountyId, winnerIndex)`: Distributes the reward to the chosen victor.
- `cancelBounty(bountyId)`: Refunds the creator in the event of a zero-reveal failure.

### Core Mappings
We ensure gas-efficient lookups using nested mappings to enforce uniqueness and prevent iteration costs:
- `mapping(uint256 => mapping(address => bool)) public hasCommitted;`
- `mapping(uint256 => mapping(address => uint256)) public userSubmissionIndex;`

## 7. Commitment Formula
To guarantee cryptographically secure commitments, this protocol utilizes the exact formula mandated by the assignment specification:
```solidity
bytes32 commitment = keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId));
```
By including `msg.sender` and `bountyId` in the hash payload, the protocol is immune to replay attacks across different bounties or different wallet addresses.

## 8. Security Considerations
- **Strict Phase Bounds:** Time-locks prevent revealing during the commit phase, and committing during the reveal phase.
- **Unrevealed Exclusion:** Unrevealed submissions are strictly ignored by the judging process, and `finalizeWinner` forcefully rejects unrevealed winner indices.
- **Double-Commit Prevention:** The `hasCommitted` mapping ensures one entry per wallet.

## 9. Known Limitations
- **Griefing Vector (DoS):** Due to the `MAX_SUBMISSIONS` cap (10), an attacker could fill the bounty slots with dummy hashes and never reveal them. This locks out legitimate participants.
- **On-chain Metadata:** The submission size is bounded to `2000` bytes to prevent block-gas limit exhaustion.

## 10. Future Improvements
- **Staking Mechanism:** Requiring a small ETH stake during the `submitCommitment` phase—which is slashed if they fail to reveal—would completely neutralize the aforementioned griefing vector.
- **Dynamic Slot Allocation:** Applying the `MAX_SUBMISSIONS` limit only to *revealed* submissions rather than commitments.

## 11. Ritual-Native Private Judging Design
Currently, the protocol relies on the `llmInput` being constructed off-chain and passed into `judgeAll()` by the owner. While the smart contract ensures only revealed submissions can win, the owner theoretically holds leverage over the LLM's prompt.

In a fully mature Ritual-Native architecture, the LLM prompt and payload concatenation should happen within a **Trusted Execution Environment (TEE)** or strictly enforced via the smart contract itself, ensuring cryptographically verifiable LLM inputs that perfectly map the `bounty.submissions` array without human intervention.

## 12. Deployment Instructions
To compile and deploy this contract to the Ritual Testnet:

```bash
# 1. Install dependencies
npm install

# 2. Compile the updated smart contracts
npx hardhat compile

# 3. Set your deployer private key securely
npx hardhat vars set DEPLOYER_PRIVATE_KEY

# 4. Deploy using Hardhat Ignition to the Ritual network
npx hardhat ignition deploy ./ignition/modules/AIJudge.ts --network ritual
```
