//! Local read-state math. Discord sends these on READY and MESSAGE_ACK.
//! Lark compares snowflakes without parsing them as a single integer that
//! might not fit in u64... they do fit in u64, but string length order is
//! the same for decimal snowflakes without leading zeros.

use std::cmp::Ordering;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadMarker {
    pub channel_id: String,
    pub last_message_id: String,
    pub mention_count: u32,
}

pub fn snowflake_cmp(left: &str, right: &str) -> Ordering {
    match left.len().cmp(&right.len()) {
        Ordering::Equal => left.cmp(right),
        other => other,
    }
}

pub fn is_newer(message_id: &str, last_read: Option<&str>) -> bool {
    match last_read {
        Some(last) if !last.is_empty() => snowflake_cmp(message_id, last) == Ordering::Greater,
        _ => true,
    }
}

/// Mention count from the server wins when the marker is present.
/// Otherwise a message counts as a mention only when it is newer than the marker.
pub fn mention_badge(marker: Option<&ReadMarker>, pending_local: u32) -> u32 {
    match marker {
        Some(marker) => marker.mention_count.saturating_add(pending_local),
        None => pending_local,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn longer_snowflake_is_newer() {
        assert_eq!(snowflake_cmp("99", "100"), Ordering::Less);
        assert_eq!(snowflake_cmp("100", "99"), Ordering::Greater);
        assert_eq!(snowflake_cmp("100", "100"), Ordering::Equal);
        assert!(is_newer("200", Some("100")));
        assert!(!is_newer("100", Some("200")));
        assert!(is_newer("100", None));
    }

    #[test]
    fn mention_badge_adds_local_pending() {
        let marker = ReadMarker {
            channel_id: "1".into(),
            last_message_id: "10".into(),
            mention_count: 2,
        };
        assert_eq!(mention_badge(Some(&marker), 1), 3);
        assert_eq!(mention_badge(None, 4), 4);
    }
}
