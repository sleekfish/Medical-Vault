#!/usr/bin/env node
// secretVault.js — encrypt/decrypt sensitive local files (e.g. .env) with a passphrase.
// Uses AES-256-GCM + scrypt key derivation. No dependencies beyond Node's built-in crypto.
//
// Usage:
//   node secretVault.js encrypt .env            → writes .env.vault
//   node secretVault.js decrypt .env.vault       → writes .env (restored)
//   node secretVault.js decrypt .env.vault .env.restored   → custom output path
//
// You'll be prompted for a passphrase (hidden input). Use the SAME passphrase
// for both encrypt and decrypt. There is no recovery if you forget it —
// store the passphrase somewhere separate from the repo (password manager,
// not a file next to this script).

import crypto from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";

const SCRYPT_SALT_BYTES = 16;
const GCM_IV_BYTES = 12;
const GCM_AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

function promptHidden(question) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const stdin = process.stdin;
        process.stdout.write(question);

        let input = "";
        const onData = (char) => {
            char = char.toString("utf8");
            if (char === "\n" || char === "\r" || char === "\u0004") {
                stdin.removeListener("data", onData);
                stdin.setRawMode?.(false);
                stdin.pause();
                process.stdout.write("\n");
                rl.close();
                resolve(input);
            } else if (char === "\u0003") {
                process.exit(1);
            } else if (char === "\u007f") {
                input = input.slice(0, -1);
            } else {
                input += char;
            }
        };

        stdin.setRawMode?.(true);
        stdin.resume();
        stdin.on("data", onData);
    });
}

function deriveKey(passphrase, salt) {
    return crypto.scryptSync(passphrase, salt, KEY_BYTES, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

async function encryptFile(inputPath, outputPath) {
    if (!existsSync(inputPath)) {
        console.error(`File not found: ${inputPath}`);
        process.exit(1);
    }
    const plaintext = readFileSync(inputPath);
    const passphrase = await promptHidden("Passphrase to encrypt with: ");
    const confirm = await promptHidden("Confirm passphrase: ");
    if (passphrase !== confirm) {
        console.error("Passphrases did not match.");
        process.exit(1);
    }

    const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
    const key = deriveKey(passphrase, salt);
    const iv = crypto.randomBytes(GCM_IV_BYTES);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_AUTH_TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const out = {
        format: "secretVault.v1",
        algorithm: "AES-256-GCM",
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
    };
    writeFileSync(outputPath, JSON.stringify(out, null, 2));
    console.log(`✓ Encrypted → ${outputPath}`);
    console.log(`  (${inputPath} is untouched — delete it manually once you've verified the .vault file, if you no longer want the plaintext on disk)`);
}

async function decryptFile(inputPath, outputPath) {
    if (!existsSync(inputPath)) {
        console.error(`File not found: ${inputPath}`);
        process.exit(1);
    }
    let data;
    try {
        data = JSON.parse(readFileSync(inputPath, "utf8"));
    } catch {
        console.error("Not a valid secretVault file (expected JSON).");
        process.exit(1);
    }
    if (data.format !== "secretVault.v1") {
        console.error("Unrecognized vault format.");
        process.exit(1);
    }

    const passphrase = await promptHidden("Passphrase to decrypt with: ");
    const salt = Buffer.from(data.salt, "base64");
    const key = deriveKey(passphrase, salt);
    const iv = Buffer.from(data.iv, "base64");
    const authTag = Buffer.from(data.authTag, "base64");
    const ciphertext = Buffer.from(data.ciphertext, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_AUTH_TAG_BYTES });
    decipher.setAuthTag(authTag);

    try {
        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        writeFileSync(outputPath, plaintext);
        console.log(`✓ Decrypted → ${outputPath}`);
    } catch {
        console.error("Decryption failed — wrong passphrase, or the file was corrupted/tampered with.");
        process.exit(1);
    }
}

async function main() {
    const [, , mode, inputPath, outputPathArg] = process.argv;
    if (!mode || !inputPath || !["encrypt", "decrypt"].includes(mode)) {
        console.log("Usage:");
        console.log("  node secretVault.js encrypt <file>            (writes <file>.vault)");
        console.log("  node secretVault.js decrypt <file>.vault      (writes <file> restored)");
        console.log("  node secretVault.js decrypt <file>.vault <customOutputPath>");
        process.exit(1);
    }

    if (mode === "encrypt") {
        const outputPath = outputPathArg || `${inputPath}.vault`;
        await encryptFile(inputPath, outputPath);
    } else {
        const outputPath = outputPathArg || inputPath.replace(/\.vault$/, "");
        if (outputPath === inputPath) {
            console.error("Refusing to overwrite the vault file itself — pass an explicit output path.");
            process.exit(1);
        }
        await decryptFile(inputPath, outputPath);
    }
}

main();