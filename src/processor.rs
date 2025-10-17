use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};

use crate::{
    error::EscrowError,
    instruction::EscrowInstruction,
    state::{Escrow, EscrowCounter},
};

pub struct Processor;

impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = EscrowInstruction::unpack(instruction_data)?;

        match instruction {
            EscrowInstruction::Initialize => {
                msg!("Instruction: Initialize");
                Self::process_initialize(program_id, accounts)
            }
            EscrowInstruction::CreateEscrow {
                amount,
                beneficiary,
                approver1,
                approver2,
                approver3,
                description,
            } => {
                msg!("Instruction: CreateEscrow");
                Self::process_create_escrow(
                    program_id,
                    accounts,
                    amount,
                    beneficiary,
                    approver1,
                    approver2,
                    approver3,
                    description,
                )
            }
            EscrowInstruction::ApproveRelease => {
                msg!("Instruction: ApproveRelease");
                Self::process_approve_release(program_id, accounts)
            }
            EscrowInstruction::CancelEscrow => {
                msg!("Instruction: CancelEscrow");
                Self::process_cancel_escrow(program_id, accounts)
            }
        }
    }

    fn process_initialize(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority = next_account_info(account_info_iter)?;
        let counter_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !authority.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let (counter_pda, counter_bump) = Pubkey::find_program_address(&[b"counter"], program_id);
        if counter_pda != *counter_account.key {
            return Err(EscrowError::InvalidCounterAccount.into());
        }

        let rent = Rent::get()?;
        let space = EscrowCounter::SIZE;
        let rent_lamports = rent.minimum_balance(space);

        let create_account_ix = system_instruction::create_account(
            authority.key,
            counter_account.key,
            rent_lamports,
            space as u64,
            program_id,
        );

        invoke_signed(
            &create_account_ix,
            &[authority.clone(), counter_account.clone(), system_program.clone()],
            &[&[b"counter".as_ref(), &[counter_bump]]],
        )?;

        let counter = EscrowCounter { count: 0 };
        counter.serialize(&mut &mut counter_account.data.borrow_mut()[..])?;

        msg!("Counter initialized");
        Ok(())
    }

    fn process_create_escrow(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        amount: u64,
        beneficiary: Pubkey,
        approver1: Pubkey,
        approver2: Pubkey,
        approver3: Option<Pubkey>,
        description: String,
    ) -> ProgramResult {
        if amount == 0 {
            return Err(EscrowError::InsufficientFunds.into());
        }
        if description.len() > 200 {
            return Err(ProgramError::InvalidInstructionData);
        }

        let account_info_iter = &mut accounts.iter();
        let creator = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let counter_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !creator.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        // Load and increment counter
        let mut counter_data = counter_account.data.borrow_mut();
        let mut counter_slice: &[u8] = &counter_data;
        let mut counter = EscrowCounter::deserialize(&mut counter_slice)?;
        let escrow_id = counter.count.checked_add(1).ok_or(EscrowError::AmountOverflow)?;
        counter.count = escrow_id;
        counter.serialize(&mut &mut counter_data[..])?;
        drop(counter_data);

        // Verify escrow account PDA
        let escrow_id_bytes = escrow_id.to_le_bytes();
        let escrow_seeds = &[b"escrow".as_ref(), escrow_id_bytes.as_ref()];
        let (escrow_pda, escrow_bump) = Pubkey::find_program_address(escrow_seeds, program_id);
        if escrow_pda != *escrow_account.key {
            return Err(EscrowError::InvalidEscrowAccount.into());
        }

        // Create escrow account
        let rent = Rent::get()?;
        let space = Escrow::MAX_SIZE;
        let rent_lamports = rent.minimum_balance(space);

        let create_account_ix = system_instruction::create_account(
            creator.key,
            escrow_account.key,
            rent_lamports,
            space as u64,
            program_id,
        );

        invoke_signed(
            &create_account_ix,
            &[creator.clone(), escrow_account.clone(), system_program.clone()],
            &[&[b"escrow".as_ref(), escrow_id_bytes.as_ref(), &[escrow_bump]]],
        )?;

        // Transfer SOL to escrow
        let transfer_ix = system_instruction::transfer(creator.key, escrow_account.key, amount);
        solana_program::program::invoke(
            &transfer_ix,
            &[creator.clone(), escrow_account.clone(), system_program.clone()],
        )?;

        // Create and save escrow data
        let clock = Clock::get()?;
        let escrow = Escrow {
            id: escrow_id,
            creator: *creator.key,
            beneficiary,
            amount,
            approver1,
            approver2,
            approver3,
            description: description.clone(),
            approvals: Vec::new(),
            is_completed: false,
            created_at: clock.unix_timestamp,
            completed_at: 0,
        };

        escrow.serialize(&mut &mut escrow_account.data.borrow_mut()[..])?;

        msg!("Escrow {} created with {} lamports", escrow_id, amount);
        msg!("Beneficiary: {}", beneficiary);
        Ok(())
    }

    fn process_approve_release(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let approver = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let beneficiary = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !approver.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let mut data = escrow_account.data.borrow_mut();
        let mut data_slice: &[u8] = &data;
        let mut escrow = Escrow::deserialize(&mut data_slice)?;

        if escrow.is_completed {
            return Err(EscrowError::EscrowCompleted.into());
        }

        if !escrow.is_approver(approver.key) {
            return Err(EscrowError::Unauthorized.into());
        }

        if escrow.has_approved(approver.key) {
            return Err(EscrowError::AlreadyApproved.into());
        }

        // Add approval
        escrow.approvals.push(*approver.key);

        msg!(
            "Escrow {} approved by {} ({}/{} approvals)",
            escrow.id,
            approver.key,
            escrow.approvals.len(),
            escrow.required_approvals()
        );

        // Check if we can release
        if escrow.can_be_released() {
            let clock = Clock::get()?;
            escrow.is_completed = true;
            escrow.completed_at = clock.unix_timestamp;

            // Transfer funds from escrow to beneficiary
            let escrow_id_bytes = escrow.id.to_le_bytes();
            let escrow_pda_seeds = &[b"escrow".as_ref(), escrow_id_bytes.as_ref()];
            let (_escrow_pda, bump) = Pubkey::find_program_address(escrow_pda_seeds, program_id);
            let escrow_seeds = &[
                b"escrow".as_ref(),
                escrow_id_bytes.as_ref(),
                &[bump],
            ];

            **escrow_account.try_borrow_mut_lamports()? -= escrow.amount;
            **beneficiary.try_borrow_mut_lamports()? += escrow.amount;

            msg!("Escrow {} released to beneficiary", escrow.id);
            msg!("Amount released: {} lamports", escrow.amount);
        }

        escrow.serialize(&mut &mut data[..])?;
        Ok(())
    }

    fn process_cancel_escrow(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let creator = next_account_info(account_info_iter)?;
        let escrow_account = next_account_info(account_info_iter)?;
        let system_program = next_account_info(account_info_iter)?;

        if !creator.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let mut data = escrow_account.data.borrow_mut();
        let mut data_slice: &[u8] = &data;
        let mut escrow = Escrow::deserialize(&mut data_slice)?;

        if escrow.creator != *creator.key {
            return Err(EscrowError::Unauthorized.into());
        }

        if escrow.is_completed {
            return Err(EscrowError::EscrowCompleted.into());
        }

        if !escrow.approvals.is_empty() {
            return Err(EscrowError::CannotCancelAfterApprovals.into());
        }

        let clock = Clock::get()?;
        escrow.is_completed = true;
        escrow.completed_at = clock.unix_timestamp;

        // Return funds to creator
        **escrow_account.try_borrow_mut_lamports()? -= escrow.amount;
        **creator.try_borrow_mut_lamports()? += escrow.amount;

        escrow.serialize(&mut &mut data[..])?;

        msg!("Escrow {} cancelled, {} lamports refunded", escrow.id, escrow.amount);
        Ok(())
    }
}

