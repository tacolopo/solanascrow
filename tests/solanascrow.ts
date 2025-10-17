import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Solanascrow } from "../target/types/solanascrow";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("solanascrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solanascrow as Program<Solanascrow>;

  let counterPda: PublicKey;
  let counterBump: number;

  let creator: Keypair;
  let beneficiary: Keypair;
  let approver1: Keypair;
  let approver2: Keypair;
  let approver3: Keypair;

  before(async () => {
    // Find the counter PDA
    [counterPda, counterBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("counter")],
      program.programId
    );

    // Create test keypairs
    creator = Keypair.generate();
    beneficiary = Keypair.generate();
    approver1 = Keypair.generate();
    approver2 = Keypair.generate();
    approver3 = Keypair.generate();

    // Airdrop SOL to test accounts
    const airdropAmount = 5 * LAMPORTS_PER_SOL;
    await provider.connection.requestAirdrop(creator.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(approver1.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(approver2.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(approver3.publicKey, airdropAmount);
    
    // Wait for airdrops to complete
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  it("Initializes the escrow counter", async () => {
    try {
      await program.methods
        .initialize()
        .accounts({
          counter: counterPda,
          authority: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const counterAccount = await program.account.escrowCounter.fetch(counterPda);
      assert.equal(counterAccount.count.toString(), "0");
      console.log("✓ Counter initialized successfully");
    } catch (error) {
      // Counter might already be initialized, which is fine
      console.log("Counter already initialized or error:", error.message);
    }
  });

  it("Creates an escrow with 2 approvers", async () => {
    const escrowAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    
    // Get current counter value
    const counterAccount = await program.account.escrowCounter.fetch(counterPda);
    const nextEscrowId = counterAccount.count.add(new anchor.BN(1));

    // Find escrow PDA
    const [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        nextEscrowId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const tx = await program.methods
      .createEscrow(
        escrowAmount,
        beneficiary.publicKey,
        approver1.publicKey,
        approver2.publicKey,
        null,
        "Test escrow with 2 approvers"
      )
      .accounts({
        escrow: escrowPda,
        counter: counterPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    console.log("✓ Escrow created:", tx);

    // Verify escrow account
    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.equal(escrowAccount.creator.toString(), creator.publicKey.toString());
    assert.equal(escrowAccount.beneficiary.toString(), beneficiary.publicKey.toString());
    assert.equal(escrowAccount.amount.toString(), escrowAmount.toString());
    assert.equal(escrowAccount.approver1.toString(), approver1.publicKey.toString());
    assert.equal(escrowAccount.approver2.toString(), approver2.publicKey.toString());
    assert.equal(escrowAccount.isCompleted, false);
    assert.equal(escrowAccount.approvals.length, 0);
  });

  it("Approves and releases escrow with 2 approvers", async () => {
    const escrowAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
    
    const counterAccount = await program.account.escrowCounter.fetch(counterPda);
    const nextEscrowId = counterAccount.count.add(new anchor.BN(1));

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        nextEscrowId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    // Create escrow
    await program.methods
      .createEscrow(
        escrowAmount,
        beneficiary.publicKey,
        approver1.publicKey,
        approver2.publicKey,
        null,
        "Test escrow for approval"
      )
      .accounts({
        escrow: escrowPda,
        counter: counterPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Get beneficiary balance before release
    const balanceBefore = await provider.connection.getBalance(beneficiary.publicKey);

    // First approval
    await program.methods
      .approveRelease()
      .accounts({
        escrow: escrowPda,
        approver: approver1.publicKey,
        beneficiary: beneficiary.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([approver1])
      .rpc();

    let escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.equal(escrowAccount.approvals.length, 1);
    assert.equal(escrowAccount.isCompleted, false);
    console.log("✓ First approval received");

    // Second approval - should trigger release
    await program.methods
      .approveRelease()
      .accounts({
        escrow: escrowPda,
        approver: approver2.publicKey,
        beneficiary: beneficiary.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([approver2])
      .rpc();

    escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.equal(escrowAccount.approvals.length, 2);
    assert.equal(escrowAccount.isCompleted, true);
    console.log("✓ Second approval received, escrow released");

    // Verify beneficiary received funds
    const balanceAfter = await provider.connection.getBalance(beneficiary.publicKey);
    const expectedIncrease = escrowAmount.toNumber();
    assert.approximately(balanceAfter - balanceBefore, expectedIncrease, 10000); // Allow small variance
  });

  it("Creates escrow with 3 approvers (2 of 3 required)", async () => {
    const escrowAmount = new anchor.BN(0.3 * LAMPORTS_PER_SOL);
    
    const counterAccount = await program.account.escrowCounter.fetch(counterPda);
    const nextEscrowId = counterAccount.count.add(new anchor.BN(1));

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        nextEscrowId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createEscrow(
        escrowAmount,
        beneficiary.publicKey,
        approver1.publicKey,
        approver2.publicKey,
        approver3.publicKey,
        "Test escrow with 3 approvers (2 of 3)"
      )
      .accounts({
        escrow: escrowPda,
        counter: counterPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const balanceBefore = await provider.connection.getBalance(beneficiary.publicKey);

    // First approval
    await program.methods
      .approveRelease()
      .accounts({
        escrow: escrowPda,
        approver: approver1.publicKey,
        beneficiary: beneficiary.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([approver1])
      .rpc();

    let escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.equal(escrowAccount.approvals.length, 1);
    assert.equal(escrowAccount.isCompleted, false);

    // Second approval - should trigger release (2 of 3)
    await program.methods
      .approveRelease()
      .accounts({
        escrow: escrowPda,
        approver: approver2.publicKey,
        beneficiary: beneficiary.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([approver2])
      .rpc();

    escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.equal(escrowAccount.approvals.length, 2);
    assert.equal(escrowAccount.isCompleted, true);
    console.log("✓ 2 of 3 approvals received, escrow released");

    // Verify funds transferred
    const balanceAfter = await provider.connection.getBalance(beneficiary.publicKey);
    assert.approximately(balanceAfter - balanceBefore, escrowAmount.toNumber(), 10000);
  });

  it("Cancels an escrow before approvals", async () => {
    const escrowAmount = new anchor.BN(0.2 * LAMPORTS_PER_SOL);
    
    const counterAccount = await program.account.escrowCounter.fetch(counterPda);
    const nextEscrowId = counterAccount.count.add(new anchor.BN(1));

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        nextEscrowId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createEscrow(
        escrowAmount,
        beneficiary.publicKey,
        approver1.publicKey,
        approver2.publicKey,
        null,
        "Test escrow for cancellation"
      )
      .accounts({
        escrow: escrowPda,
        counter: counterPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const balanceBefore = await provider.connection.getBalance(creator.publicKey);

    // Cancel escrow
    await program.methods
      .cancelEscrow()
      .accounts({
        escrow: escrowPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    assert.equal(escrowAccount.isCompleted, true);
    console.log("✓ Escrow cancelled successfully");

    // Verify funds returned to creator (approximately, accounting for tx fees)
    const balanceAfter = await provider.connection.getBalance(creator.publicKey);
    assert.isAtLeast(balanceAfter, balanceBefore);
  });

  it("Fails to cancel escrow after approval", async () => {
    const escrowAmount = new anchor.BN(0.2 * LAMPORTS_PER_SOL);
    
    const counterAccount = await program.account.escrowCounter.fetch(counterPda);
    const nextEscrowId = counterAccount.count.add(new anchor.BN(1));

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        nextEscrowId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createEscrow(
        escrowAmount,
        beneficiary.publicKey,
        approver1.publicKey,
        approver2.publicKey,
        null,
        "Test escrow - cannot cancel after approval"
      )
      .accounts({
        escrow: escrowPda,
        counter: counterPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Add one approval
    await program.methods
      .approveRelease()
      .accounts({
        escrow: escrowPda,
        approver: approver1.publicKey,
        beneficiary: beneficiary.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([approver1])
      .rpc();

    // Try to cancel - should fail
    try {
      await program.methods
        .cancelEscrow()
        .accounts({
          escrow: escrowPda,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      
      assert.fail("Should have thrown error");
    } catch (error) {
      expect(error.message).to.include("CannotCancelAfterApprovals");
      console.log("✓ Correctly prevented cancellation after approval");
    }
  });

  it("Fails when non-approver tries to approve", async () => {
    const escrowAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    
    const counterAccount = await program.account.escrowCounter.fetch(counterPda);
    const nextEscrowId = counterAccount.count.add(new anchor.BN(1));

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        nextEscrowId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createEscrow(
        escrowAmount,
        beneficiary.publicKey,
        approver1.publicKey,
        approver2.publicKey,
        null,
        "Test unauthorized approval"
      )
      .accounts({
        escrow: escrowPda,
        counter: counterPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // Try to approve with non-approver account
    const randomUser = Keypair.generate();
    await provider.connection.requestAirdrop(randomUser.publicKey, LAMPORTS_PER_SOL);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await program.methods
        .approveRelease()
        .accounts({
          escrow: escrowPda,
          approver: randomUser.publicKey,
          beneficiary: beneficiary.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([randomUser])
        .rpc();
      
      assert.fail("Should have thrown error");
    } catch (error) {
      expect(error.message).to.include("Unauthorized");
      console.log("✓ Correctly prevented unauthorized approval");
    }
  });

  it("Fails when approver tries to approve twice", async () => {
    const escrowAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    
    const counterAccount = await program.account.escrowCounter.fetch(counterPda);
    const nextEscrowId = counterAccount.count.add(new anchor.BN(1));

    const [escrowPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        nextEscrowId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .createEscrow(
        escrowAmount,
        beneficiary.publicKey,
        approver1.publicKey,
        approver2.publicKey,
        null,
        "Test double approval prevention"
      )
      .accounts({
        escrow: escrowPda,
        counter: counterPda,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    // First approval
    await program.methods
      .approveRelease()
      .accounts({
        escrow: escrowPda,
        approver: approver1.publicKey,
        beneficiary: beneficiary.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([approver1])
      .rpc();

    // Try to approve again with same approver
    try {
      await program.methods
        .approveRelease()
        .accounts({
          escrow: escrowPda,
          approver: approver1.publicKey,
          beneficiary: beneficiary.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([approver1])
        .rpc();
      
      assert.fail("Should have thrown error");
    } catch (error) {
      expect(error.message).to.include("AlreadyApproved");
      console.log("✓ Correctly prevented double approval");
    }
  });
});

