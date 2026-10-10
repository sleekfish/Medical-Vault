import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { EncryptionService } from "../services/EncryptionService.js";
import { DecryptionService } from "../services/DecryptionService.js";

test("AES-256-GCM encrypts and decrypts a file buffer without exposing the key", () => {
    const key = crypto.randomBytes(32);
    const plaintext = Buffer.from("confidential medical record");
    const aad = "medivault:v1:0xpatient:record.pdf";
    const encrypted = new EncryptionService({ key }).encrypt(plaintext, { aad });
    const encryptedAgain = new EncryptionService({ key }).encrypt(plaintext, { aad });

    assert.notDeepEqual(encrypted.ciphertext, plaintext);
    assert.equal(Buffer.from(encrypted.metadata.iv, "base64").length, 12);
    assert.equal(Buffer.from(encrypted.metadata.authTag, "base64").length, 16);
    assert.notEqual(encrypted.metadata.iv, encryptedAgain.metadata.iv);
    assert.deepEqual(
        new DecryptionService({ key }).decrypt(encrypted.ciphertext, { ...encrypted.metadata, aad }),
        plaintext,
    );
});

test("AES-256-GCM rejects altered ciphertext", () => {
    const key = crypto.randomBytes(32);
    const encrypted = new EncryptionService({ key }).encrypt(Buffer.from("medical record"));
    encrypted.ciphertext[0] ^= 1;

    assert.throws(
        () => new DecryptionService({ key }).decrypt(encrypted.ciphertext, encrypted.metadata),
        { code: "DECRYPTION_FAILED" },
    );
});
