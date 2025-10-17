use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct Escrow {
    pub id: u64,
    pub creator: Pubkey,
    pub beneficiary: Pubkey,
    pub amount: u64,
    pub approver1: Pubkey,
    pub approver2: Pubkey,
    pub approver3: Option<Pubkey>,
    pub description: String,
    pub approvals: Vec<Pubkey>,
    pub is_completed: bool,
    pub created_at: i64,
    pub completed_at: i64,
}

impl Escrow {
    pub const MAX_SIZE: usize = 8 + 32 + 32 + 8 + 32 + 32 + 1 + 32 + 4 + 200 + 4 + (32 * 3) + 1 + 8 + 8;

    pub fn is_approver(&self, addr: &Pubkey) -> bool {
        &self.approver1 == addr 
            || &self.approver2 == addr 
            || (self.approver3.is_some() && &self.approver3.unwrap() == addr)
    }

    pub fn has_approved(&self, addr: &Pubkey) -> bool {
        self.approvals.contains(addr)
    }

    pub fn required_approvals(&self) -> usize {
        let unique_approvers = self.total_approvers();
        match unique_approvers {
            0 => 0,
            1 => 1,
            2 => 2,
            _ => 2,
        }
    }

    pub fn total_approvers(&self) -> usize {
        let mut unique_approvers = vec![self.approver1, self.approver2];
        if let Some(a3) = self.approver3 {
            unique_approvers.push(a3);
        }
        unique_approvers.sort();
        unique_approvers.dedup();
        unique_approvers.len()
    }

    pub fn can_be_released(&self) -> bool {
        !self.is_completed && self.approvals.len() >= self.required_approvals()
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, Clone, PartialEq)]
pub struct EscrowCounter {
    pub count: u64,
}

impl EscrowCounter {
    pub const SIZE: usize = 8;
}
