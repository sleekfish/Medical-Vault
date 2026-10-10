import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { WalletAuthService } from "../services/WalletAuthService.js";

test("a wallet signature produces a short-lived authenticated session", async () => {
    const wallet = Wallet.createRandom();
    const auth = new WalletAuthService();
    const challenge = auth.createChallenge(wallet.address, "localhost:5000");
    const signature = await wallet.signMessage(challenge.message);
    const session = auth.verifyChallenge(wallet.address, signature);

    assert.equal(auth.getAuthenticatedWallet(`Bearer ${session.accessToken}`), wallet.address.toLowerCase());
});

test("a signature from another wallet is rejected", async () => {
    const owner = Wallet.createRandom();
    const attacker = Wallet.createRandom();
    const auth = new WalletAuthService();
    const challenge = auth.createChallenge(owner.address);
    const signature = await attacker.signMessage(challenge.message);

    assert.throws(() => auth.verifyChallenge(owner.address, signature), { code: "AUTHENTICATION_FAILED" });
});
