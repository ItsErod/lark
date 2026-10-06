/// Replace any known secret in `input` so logs and errors cannot carry a token.
pub fn redact(input: &str, secrets: &[&str]) -> String {
    let mut out = input.to_string();
    for secret in secrets {
        if secret.len() < 8 {
            continue;
        }
        if out.contains(secret) {
            out = out.replace(secret, "[redacted]");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_token_and_leaves_the_rest() {
        let token = "mfa.super-secret-token-value";
        let input = format!("Authorization: {token} failed for channel 1");
        let cleaned = redact(&input, &[token]);
        assert!(!cleaned.contains(token));
        assert!(cleaned.contains("[redacted]"));
        assert!(cleaned.contains("channel 1"));
    }

    #[test]
    fn ignores_short_strings() {
        assert_eq!(redact("token ab", &["ab"]), "token ab");
    }
}
