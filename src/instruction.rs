use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{program_error::ProgramError, pubkey::Pubkey};

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub enum EscrowInstruction {
    /// Initialize the escrow counter
    /// Accounts expected:
    /// 0. `[writable, signer]` Authority account
    /// 1. `[writable]` Counter account (PDA)
    /// 2. `[]` System program
    Initialize,

    /// Create a new escrow
    /// Accounts expected:
    /// 0. `[writable, signer]` Creator account
    /// 1. `[writable]` Escrow account (PDA)
    /// 2. `[writable]` Counter account (PDA)
    /// 3. `[]` System program
    CreateEscrow {
        amount: u64,
        beneficiary: Pubkey,
        approver1: Pubkey,
        approver2: Pubkey,
        approver3: Option<Pubkey>,
        description: String,
    },

    /// Approve release of funds
    /// Accounts expected:
    /// 0. `[signer]` Approver account
    /// 1. `[writable]` Escrow account (PDA)
    /// 2. `[writable]` Beneficiary account
    /// 3. `[]` System program
    ApproveRelease,

    /// Cancel escrow
    /// Accounts expected:
    /// 0. `[writable, signer]` Creator account
    /// 1. `[writable]` Escrow account (PDA)
    /// 2. `[]` System program
    CancelEscrow,
}

impl EscrowInstruction {
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        Self::try_from_slice(input).map_err(|_| ProgramError::InvalidInstructionData)
    }
}

