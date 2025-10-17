use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Error, Debug, Copy, Clone)]
pub enum EscrowError {
    #[error("Invalid instruction")]
    InvalidInstruction,

    #[error("Not rent exempt")]
    NotRentExempt,

    #[error("Expected amount mismatch")]
    ExpectedAmountMismatch,

    #[error("Amount overflow")]
    AmountOverflow,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Escrow already completed")]
    EscrowCompleted,

    #[error("Insufficient funds")]
    InsufficientFunds,

    #[error("Already approved")]
    AlreadyApproved,

    #[error("Cannot cancel after approvals")]
    CannotCancelAfterApprovals,

    #[error("Invalid escrow account")]
    InvalidEscrowAccount,

    #[error("Invalid counter account")]
    InvalidCounterAccount,
}

impl From<EscrowError> for ProgramError {
    fn from(e: EscrowError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
