# SolanaScrow - Solana Escrow Smart Contract

A production-ready escrow smart contract for Solana blockchain with multi-signature approval functionality. This contract allows users to create escrows that require multiple approvers before funds are released.

## Features

- **Multi-Signature Escrow**: Support for 2 or 3 approvers with flexible approval requirements
  - 1 unique approver: requires 1 approval
  - 2 unique approvers: requires 2 approvals (both must approve)
  - 3 unique approvers: requires 2 of 3 approvals
- **Automatic Fund Release**: Funds are automatically transferred to beneficiary when approval threshold is met
- **Cancellation**: Creator can cancel escrow before any approvals (funds returned)
- **Program Derived Addresses (PDAs)**: Secure escrow account management using Solana PDAs
- **Event Logging**: All actions are logged with detailed messages

## Architecture

The contract uses Anchor framework and consists of three main components:

### State (`state.rs`)
- `Escrow`: Main escrow account structure
- `EscrowCounter`: Global counter for generating unique escrow IDs

### Instructions (`lib.rs`)
1. `initialize`: Initialize the global escrow counter (one-time setup)
2. `create_escrow`: Create a new escrow with SOL and specify beneficiary/approvers
3. `approve_release`: Approver signs to approve release (auto-releases when threshold met)
4. `cancel_escrow`: Creator cancels escrow (only if no approvals yet)

### Errors (`error.rs`)
Custom error types for all failure scenarios

## Installation

### Prerequisites

1. Install Rust and Cargo:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

2. Install Solana CLI tools:
```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

3. Install Anchor:
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### Build the Program

```bash
cd contracts/solanascrow
anchor build
```

The compiled program will be in `target/deploy/solanascrow.so`

## Deployment

### 1. Configure Solana CLI

Set your network (devnet for testing, mainnet-beta for production):

```bash
# For devnet
solana config set --url https://api.devnet.solana.com

# For mainnet
solana config set --url https://api.mainnet-beta.solana.com
```

### 2. Check Your Wallet

```bash
solana address
solana balance
```

If you need to airdrop SOL on devnet:
```bash
solana airdrop 2
```

### 3. Deploy the Program

```bash
anchor deploy
```

This will:
- Deploy the program to Solana
- Display the program ID
- Update `target/idl/solanascrow.json` with the deployed program info

### 4. Initialize the Program

After deployment, you need to initialize the escrow counter once:

```bash
anchor run initialize
```

Or using Solana CLI:
```bash
solana program deploy target/deploy/solanascrow.so
```

## Usage

### Creating an Escrow

To create an escrow, you need to:
1. Specify the amount of SOL (in lamports, 1 SOL = 1,000,000,000 lamports)
2. Provide beneficiary address (who receives funds)
3. Provide 2-3 approver addresses
4. Add a description

Example using Anchor TypeScript client:
```typescript
const tx = await program.methods
  .createEscrow(
    new BN(1_000_000_000), // 1 SOL
    beneficiaryPubkey,
    approver1Pubkey,
    approver2Pubkey,
    approver3Pubkey, // or null
    "Payment for services rendered"
  )
  .accounts({
    escrow: escrowPda,
    counter: counterPda,
    creator: creator.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([creator])
  .rpc();
```

### Approving Release

Any designated approver can approve:
```typescript
const tx = await program.methods
  .approveRelease()
  .accounts({
    escrow: escrowPda,
    approver: approver.publicKey,
    beneficiary: beneficiaryPubkey,
    systemProgram: SystemProgram.programId,
  })
  .signers([approver])
  .rpc();
```

When the approval threshold is met, funds automatically transfer to the beneficiary.

### Cancelling an Escrow

Only the creator can cancel, and only if no approvals have been made:
```typescript
const tx = await program.methods
  .cancelEscrow()
  .accounts({
    escrow: escrowPda,
    creator: creator.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([creator])
  .rpc();
```

## Testing

Run the test suite:
```bash
anchor test
```

This will:
1. Start a local validator
2. Deploy the program
3. Run all tests
4. Shut down the validator

## Security Considerations

- **PDA Security**: All escrow accounts use Program Derived Addresses (PDAs) ensuring only the program can sign transactions
- **Signer Verification**: All sensitive operations require proper signer verification
- **State Validation**: Comprehensive checks prevent unauthorized actions
- **Approval Logic**: Multi-signature approval requires multiple parties to authorize fund release
- **No Reentrancy**: Solana's account model prevents reentrancy attacks

## Program ID

**✅ FULLY WORKING Devnet Deployment:**
```
EADvxHv8EgzTCxXXqRWZ4CZukSDChstfrY6x89qwJumG
```

View on Solana Explorer:
https://explorer.solana.com/address/EADvxHv8EgzTCxXXqRWZ4CZukSDChstfrY6x89qwJumG?cluster=devnet

Deployer Wallet: `G9MLBNSHjvjmZbnEeC3737KhSMddXdBFztn8GNV5uUeR`

## ✅ All Bugs Fixed & Deployed

The contract has been **successfully fixed and deployed** with all critical bugs resolved:

**Fixes Applied:**
1. ✅ Fixed Borsh deserialization issue in `ApproveRelease` and `CancelEscrow` functions
2. ✅ Fixed `BorrowMutError` in `CreateEscrow` function (borrowing conflict)
3. ✅ Fixed `BorrowMutError` in `ApproveRelease` function (borrowing conflict)
4. ✅ Fixed `BorrowMutError` in `CancelEscrow` function (borrowing conflict)

**Status:** ✅ **FULLY WORKING** - All three functions (Create, Approve, Cancel) now work correctly!

**Previous Deployments (Deprecated):**
- Program ID: `6SNTMQNouzKgBZiweGJ82cMQKNDARFWKDoYeKiqBWTSv` (has BorrowMutError in ApproveRelease)
- Program ID: `ph9MKvbMqZpx7oUAbwPZJZELrCjKXTGBAn7EBxgicrz` (has BorrowMutError in CreateEscrow)
- Program ID: `CzxXQzXVUBSmmj2kAhERmb8spjHAd31cVMYCXfYpKDM3` (has deserialization bug)
- Status: All deprecated - do not use

## Account Structure

### Escrow Account
- Size: ~500 bytes
- Rent-exempt
- PDA seeds: `["escrow", escrow_id]`

### Counter Account
- Size: 17 bytes
- Rent-exempt
- PDA seeds: `["counter"]`

## Comparison with CosmWasm Version

This Solana implementation follows the same business logic as the `cosmoscrow` CosmWasm contract:

| Feature | CosmWasm | Solana/Anchor |
|---------|----------|---------------|
| Multi-sig approvals | ✅ | ✅ |
| Flexible approver count | ✅ (2-3) | ✅ (2-3) |
| Auto-release on threshold | ✅ | ✅ |
| Creator cancellation | ✅ | ✅ |
| Query functionality | ✅ | ✅ (via RPC) |
| Event logging | ✅ (attributes) | ✅ (msg! macros) |

Key differences:
- Solana uses PDAs instead of contract-owned storage
- Solana uses lamports (native SOL) instead of generic Coin types
- Account structure is explicit in Solana vs implicit in CosmWasm

## License

This project follows the same license as the parent cosmoscrow-gaia repository.

## Support

For issues or questions, please refer to the main repository documentation.

