# crypto-lab-otp-vault

## What It Is

This is an interactive demonstration of the **one-time pad (OTP)** and the **two-time-pad
(key-reuse) attack**. The one-time pad encrypts a message by XOR-ing its bytes with a
truly random key the same length as the message, used exactly once; decryption is the same
XOR, since XOR is its own inverse. It solves the problem of confidentiality with the
strongest possible guarantee — Shannon's *perfect secrecy*, meaning a ciphertext reveals
nothing about its plaintext beyond length. The security model is symmetric (one shared
secret key) and information-theoretic, not computational: it assumes nothing about an
attacker's computing power. Its fatal practical weakness, shown here in full, is that the
guarantee collapses the instant a key is reused, the key must be as long as the message,
and it must be exchanged securely in advance.

## When to Use It

- **Theoretical baseline / teaching.** The OTP is the reference point for what "perfect
  secrecy" means — every other cipher is judged against it, so it is the right tool for
  building intuition.
- **Ultra-high-value, low-volume channels with pre-shared key material.** When two parties
  can securely exchange truly random key material in advance (historically, diplomatic and
  intelligence links), the OTP offers provable secrecy no computer can break.
- **Reasoning about stream ciphers.** ChaCha20, AES-CTR, and AES-GCM are "OTP with a
  generated keystream," so understanding OTP key reuse directly explains why nonce reuse in
  those ciphers is catastrophic.
- **Do NOT use it for general-purpose encryption.** The key must be as long as the message,
  never reused, and securely distributed — impractical for most real systems, and it
  provides no integrity/authentication, so use a modern AEAD cipher instead.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-otp-vault](https://systemslibrarian.github.io/crypto-lab-otp-vault/)**

Encrypt and decrypt a message byte-by-byte with a freshly generated random key; type any
target plaintext to see a valid key derived for a fixed ciphertext (the perfect-secrecy
"aha"); then flip the **key-reuse toggle** and use the **crib-dragging** interface — slide a
guessed word across `C1 ⊕ C2` and pin confirmed cribs — to peel two key-reused messages
apart at once. Further panels recreate the same break from a reused stream-cipher nonce and
let you import two ciphertexts (or load built-in challenges) and attack them yourself. All
XOR is computed over real bytes in your browser; keys come from `crypto.getRandomValues` and
are never stored or sent.

## What Can Go Wrong

- Key reuse (the two-time pad): XOR of two ciphertexts equals XOR of the two plaintexts, and crib dragging then peels both messages apart — the perfect-secrecy guarantee is gone instantly.
- Non-random or short keys — reusing a passphrase, or treating PRNG output as a true pad — break the information-theoretic guarantee.
- The same nonce-reuse failure carries directly into stream ciphers (ChaCha20, AES-CTR/GCM), which are an OTP over a generated keystream.
- No integrity or authentication: an attacker who knows part of the plaintext can flip ciphertext bits to make controlled, undetected changes.
- Key distribution and storage are the practical killers — the key must be as long as the message, exchanged securely in advance, and destroyed after one use.

## Real-World Usage

- Historically used for the highest-value diplomatic and intelligence links, including one-time-pad systems and the Moscow–Washington hotline.
- The reference standard for "perfect secrecy" against which every other cipher is taught and judged.
- Understanding OTP key reuse directly explains nonce-reuse disasters in modern stream ciphers and AEAD.
- Crib dragging and key-reuse analysis remain practical cryptanalysis techniques against misused keystream ciphers.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-otp-vault
cd crypto-lab-otp-vault
npm install
npm run dev
```

## Related Demos

- [crypto-lab-chacha20-stream](https://systemslibrarian.github.io/crypto-lab-chacha20-stream/) — a real stream cipher and the nonce-reuse failure that mirrors two-time-pad.
- [crypto-lab-nonce-guard](https://systemslibrarian.github.io/crypto-lab-nonce-guard/) — AES-GCM nonce reuse and the SIV construction that defends against it.
- [crypto-lab-poly1305-mac](https://systemslibrarian.github.io/crypto-lab-poly1305-mac/) — the key-reuse attack on a polynomial MAC.
- [crypto-lab-vigenere-break](https://systemslibrarian.github.io/crypto-lab-vigenere-break/) — classical crib and frequency analysis, the ancestor of crib dragging.

---

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
