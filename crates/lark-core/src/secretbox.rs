//! AES-256-GCM for small local secrets such as composer drafts.
//! The key lives in the OS credential store. This module only seals bytes.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use rand::RngCore;

const PREFIX: &str = "lark1.";

pub fn random_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    key
}

pub fn seal(key: &[u8; 32], plaintext: &str) -> Result<String, String> {
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    seal_with_nonce(key, &nonce, plaintext)
}

pub fn seal_with_nonce(
    key: &[u8; 32],
    nonce: &[u8; 12],
    plaintext: &str,
) -> Result<String, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| "Draft key was the wrong size.".to_string())?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(nonce), plaintext.as_bytes())
        .map_err(|_| "Couldn't encrypt drafts.".to_string())?;
    let mut packed = Vec::with_capacity(12 + ciphertext.len());
    packed.extend_from_slice(nonce);
    packed.extend_from_slice(&ciphertext);
    Ok(format!(
        "{PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(packed)
    ))
}

pub fn open(key: &[u8; 32], sealed: &str) -> Result<String, String> {
    let body = sealed
        .strip_prefix(PREFIX)
        .ok_or_else(|| "Saved drafts are not in Lark's encrypted format.".to_string())?;
    let packed = base64::engine::general_purpose::STANDARD
        .decode(body.trim())
        .map_err(|_| "Saved drafts could not be read.".to_string())?;
    if packed.len() < 12 + 16 {
        return Err("Saved drafts are incomplete.".into());
    }
    let (nonce, ciphertext) = packed.split_at(12);
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|_| "Draft key was the wrong size.".to_string())?;
    let plain = cipher
        .decrypt(Nonce::from_slice(nonce), ciphertext)
        .map_err(|_| {
            "Couldn't open drafts. The key in the credential store does not match.".to_string()
        })?;
    String::from_utf8(plain).map_err(|_| "Saved drafts were not text.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key() -> [u8; 32] {
        [0x11; 32]
    }

    fn nonce() -> [u8; 12] {
        [0x22; 12]
    }

    #[test]
    fn round_trip_hides_the_plaintext() {
        let sealed = seal(&key(), "draft for #design").unwrap();
        assert!(sealed.starts_with(PREFIX));
        assert!(!sealed.contains("design"));
        assert_eq!(open(&key(), &sealed).unwrap(), "draft for #design");
    }

    #[test]
    fn known_nonce_is_stable_and_not_plaintext() {
        let sealed = seal_with_nonce(&key(), &nonce(), "hello drafts").unwrap();
        assert_eq!(
            sealed,
            seal_with_nonce(&key(), &nonce(), "hello drafts").unwrap()
        );
        assert!(!sealed.contains("hello"));
        assert_eq!(open(&key(), &sealed).unwrap(), "hello drafts");
    }

    #[test]
    fn wrong_key_and_plain_storage_fail() {
        let sealed = seal_with_nonce(&key(), &nonce(), "hello drafts").unwrap();
        assert!(open(&[0x33; 32], &sealed).is_err());
        assert!(open(&key(), r#"{"100000000000000021":"hi"}"#).is_err());
        assert!(open(&key(), "lark1.aaaa").is_err());
    }
}
