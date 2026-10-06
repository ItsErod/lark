//! A small on-disk message cache so a channel can paint before the network returns.
//! The cache stores message JSON only. It never stores the token.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CachedChannel {
    pub channel_id: String,
    pub messages: Vec<Value>,
}

/// Keep the newest `max` messages. Input is oldest-first, which is how Lark paints.
pub fn trim_messages(mut messages: Vec<Value>, max: usize) -> Vec<Value> {
    if messages.len() > max {
        let skip = messages.len() - max;
        messages.drain(0..skip);
    }
    messages
}

pub fn encode_cache(channels: &[CachedChannel]) -> String {
    serde_json::to_string(channels).unwrap_or_else(|_| "[]".into())
}

pub fn decode_cache(text: &str) -> Vec<CachedChannel> {
    serde_json::from_str(text).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn trim_keeps_the_newest_tail() {
        let messages = vec![json!({"id": "1"}), json!({"id": "2"}), json!({"id": "3"})];
        let trimmed = trim_messages(messages, 2);
        assert_eq!(trimmed.len(), 2);
        assert_eq!(trimmed[0]["id"], "2");
        assert_eq!(trimmed[1]["id"], "3");
    }

    #[test]
    fn cache_round_trip_has_no_token_field() {
        let encoded = encode_cache(&[CachedChannel {
            channel_id: "42".into(),
            messages: vec![json!({"id": "9", "content": "hello"})],
        }]);
        assert!(!encoded.to_lowercase().contains("token"));
        let decoded = decode_cache(&encoded);
        assert_eq!(decoded[0].messages[0]["content"], "hello");
        assert!(decode_cache("not json").is_empty());
    }
}
