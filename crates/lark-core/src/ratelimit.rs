use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WaitReason {
    Global,
    Bucket,
    Pace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Allowed,
    Wait { delay_ms: u64, reason: WaitReason },
}

#[derive(Debug, Clone)]
struct Bucket {
    #[allow(dead_code)]
    limit: u32,
    remaining: u32,
    reset_at_ms: u64,
}

#[derive(Debug, Clone)]
pub struct RateHeaders {
    pub limit: u32,
    pub remaining: u32,
    pub reset_after_ms: u64,
    pub bucket: Option<String>,
    pub global: bool,
}

#[derive(Debug, Clone)]
pub struct RateLimiter {
    buckets: HashMap<String, Bucket>,
    route_bucket: HashMap<String, String>,
    global_until_ms: Option<u64>,
    last_send_ms: HashMap<String, u64>,
    /// Minimum gap between message sends on the same route, so a stuck key cannot burst.
    pace_ms: u64,
    /// After a window expires and before Discord sends fresh headers, allow one request.
    provisional_window_ms: u64,
}

impl Default for RateLimiter {
    fn default() -> Self {
        Self::new()
    }
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            buckets: HashMap::new(),
            route_bucket: HashMap::new(),
            global_until_ms: None,
            last_send_ms: HashMap::new(),
            pace_ms: 350,
            provisional_window_ms: 1_000,
        }
    }

    pub fn acquire(&self, route: &str, now_ms: u64) -> Decision {
        let mut best: Option<(u64, WaitReason)> = None;
        if let Some(until) = self.global_until_ms {
            if now_ms < until {
                consider(&mut best, until - now_ms, WaitReason::Global);
            }
        }
        if let Some(bucket) = self.bucket_for(route) {
            if bucket.remaining == 0 && now_ms < bucket.reset_at_ms {
                consider(&mut best, bucket.reset_at_ms - now_ms, WaitReason::Bucket);
            }
        }
        if is_send_route(route) {
            if let Some(last) = self.last_send_ms.get(route) {
                let earliest = last + self.pace_ms;
                if now_ms < earliest {
                    consider(&mut best, earliest - now_ms, WaitReason::Pace);
                }
            }
        }
        match best {
            Some((delay_ms, reason)) => Decision::Wait { delay_ms, reason },
            None => Decision::Allowed,
        }
    }

    /// Reserve a slot. Optimistic remaining decrement keeps parallel callers from bursting.
    pub fn reserve(&mut self, route: &str, now_ms: u64) -> Decision {
        if let Decision::Wait { delay_ms, reason } = self.acquire(route, now_ms) {
            return Decision::Wait { delay_ms, reason };
        }
        if let Some(id) = self.route_bucket.get(route).cloned() {
            if let Some(bucket) = self.buckets.get_mut(&id) {
                if now_ms >= bucket.reset_at_ms {
                    // One request may leave before fresh headers arrive. Then wait.
                    bucket.remaining = 0;
                    bucket.reset_at_ms = now_ms + self.provisional_window_ms;
                } else if bucket.remaining > 0 {
                    bucket.remaining -= 1;
                }
            }
        }
        if is_send_route(route) {
            self.last_send_ms.insert(route.to_string(), now_ms);
        }
        Decision::Allowed
    }

    pub fn observe_headers(&mut self, route: &str, headers: &RateHeaders, now_ms: u64) {
        let bucket_id = headers
            .bucket
            .clone()
            .unwrap_or_else(|| route.to_string());
        self.route_bucket.insert(route.to_string(), bucket_id.clone());
        let reset_at = now_ms.saturating_add(headers.reset_after_ms);
        self.buckets.insert(
            bucket_id,
            Bucket {
                limit: headers.limit.max(1),
                remaining: headers.remaining,
                reset_at_ms: reset_at,
            },
        );
        if headers.global {
            self.global_until_ms = Some(reset_at);
        }
    }

    pub fn observe_429(&mut self, route: &str, retry_after_ms: u64, global: bool, now_ms: u64) {
        let until = now_ms.saturating_add(retry_after_ms);
        if global {
            self.global_until_ms = Some(until);
            return;
        }
        let bucket_id = self
            .route_bucket
            .get(route)
            .cloned()
            .unwrap_or_else(|| route.to_string());
        self.route_bucket.insert(route.to_string(), bucket_id.clone());
        self.buckets.insert(
            bucket_id,
            Bucket {
                limit: 1,
                remaining: 0,
                reset_at_ms: until,
            },
        );
    }

    fn bucket_for(&self, route: &str) -> Option<&Bucket> {
        let id = self.route_bucket.get(route)?;
        self.buckets.get(id)
    }
}

fn consider(best: &mut Option<(u64, WaitReason)>, delay: u64, reason: WaitReason) {
    if delay == 0 {
        return;
    }
    match best {
        Some((current, _)) if *current >= delay => {}
        _ => *best = Some((delay, reason)),
    }
}

pub fn is_send_route(route: &str) -> bool {
    route.starts_with("POST ") && route.contains("/messages")
}

pub fn route_key(method: &str, template: &str, major: &str) -> String {
    format!("{method} {template}::{major}")
}

/// Convert Discord's fractional `retry_after` seconds into milliseconds.
/// Values are capped so a bad body cannot stall the client for minutes.
pub fn retry_after_to_ms(seconds: f64) -> u64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }
    let ms = (seconds * 1000.0).ceil() as u64;
    ms.min(60_000)
}

/// Typing indicators last about ten seconds. One POST per eight seconds is enough.
pub fn should_send_typing(last_ms: Option<u64>, now_ms: u64) -> bool {
    match last_ms {
        Some(last) => now_ms.saturating_sub(last) >= 8_000,
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(bucket: &str, remaining: u32, reset_after_ms: u64) -> RateHeaders {
        RateHeaders {
            limit: 5,
            remaining,
            reset_after_ms,
            bucket: Some(bucket.into()),
            global: false,
        }
    }

    #[test]
    fn first_request_is_allowed() {
        let limiter = RateLimiter::new();
        assert_eq!(limiter.acquire("GET /users/@me::me", 0), Decision::Allowed);
    }

    #[test]
    fn remaining_zero_waits_until_reset() {
        let mut limiter = RateLimiter::new();
        let route = route_key("GET", "/channels/{id}/messages", "42");
        limiter.observe_headers(&route, &headers("bucket-a", 0, 5_000), 1_000);
        match limiter.acquire(&route, 1_000) {
            Decision::Wait { delay_ms, reason } => {
                assert_eq!(reason, WaitReason::Bucket);
                assert_eq!(delay_ms, 5_000);
            }
            Decision::Allowed => panic!("expected a wait"),
        }
        assert_eq!(limiter.acquire(&route, 6_000), Decision::Allowed);
    }

    #[test]
    fn routes_with_different_buckets_are_independent() {
        let mut limiter = RateLimiter::new();
        let a = route_key("GET", "/channels/{id}/messages", "1");
        let b = route_key("GET", "/channels/{id}/messages", "2");
        limiter.observe_headers(&a, &headers("bucket-a", 0, 5_000), 0);
        limiter.observe_headers(&b, &headers("bucket-b", 2, 5_000), 0);
        assert!(matches!(limiter.acquire(&a, 0), Decision::Wait { .. }));
        assert_eq!(limiter.acquire(&b, 0), Decision::Allowed);
    }

    #[test]
    fn shared_bucket_id_is_shared_state() {
        let mut limiter = RateLimiter::new();
        let a = route_key("GET", "/channels/{id}/messages", "1");
        let b = route_key("DELETE", "/channels/{id}/messages/{message.id}", "1");
        limiter.observe_headers(&a, &headers("shared", 1, 5_000), 0);
        limiter.observe_headers(&b, &headers("shared", 1, 5_000), 0);
        assert_eq!(limiter.reserve(&a, 0), Decision::Allowed);
        assert!(matches!(
            limiter.acquire(&b, 0),
            Decision::Wait {
                reason: WaitReason::Bucket,
                ..
            }
        ));
    }

    #[test]
    fn global_429_blocks_every_route() {
        let mut limiter = RateLimiter::new();
        let a = route_key("GET", "/users/@me/guilds", "me");
        let b = route_key("GET", "/users/@me/channels", "me");
        limiter.observe_429(&a, 2_000, true, 100);
        assert!(matches!(
            limiter.acquire(&b, 100),
            Decision::Wait {
                reason: WaitReason::Global,
                delay_ms: 2_000
            }
        ));
        assert_eq!(limiter.acquire(&b, 2_100), Decision::Allowed);
    }

    #[test]
    fn route_429_does_not_block_a_different_route() {
        let mut limiter = RateLimiter::new();
        let a = route_key("POST", "/channels/{id}/messages", "9");
        let b = route_key("GET", "/users/@me", "me");
        limiter.observe_429(&a, 3_000, false, 0);
        assert!(matches!(limiter.acquire(&a, 0), Decision::Wait { .. }));
        assert_eq!(limiter.acquire(&b, 0), Decision::Allowed);
    }

    #[test]
    fn retry_after_conversion() {
        assert_eq!(retry_after_to_ms(0.1), 100);
        assert_eq!(retry_after_to_ms(0.0), 0);
        assert_eq!(retry_after_to_ms(-1.0), 0);
        assert_eq!(retry_after_to_ms(f64::NAN), 0);
        assert_eq!(retry_after_to_ms(90.0), 60_000);
        assert_eq!(retry_after_to_ms(1.2), 1_200);
    }

    #[test]
    fn message_sends_are_paced_and_gets_are_not() {
        let mut limiter = RateLimiter::new();
        let send = route_key("POST", "/channels/{id}/messages", "9");
        let get = route_key("GET", "/channels/{id}/messages", "9");
        assert_eq!(limiter.reserve(&send, 1_000), Decision::Allowed);
        match limiter.acquire(&send, 1_100) {
            Decision::Wait { reason, delay_ms } => {
                assert_eq!(reason, WaitReason::Pace);
                assert_eq!(delay_ms, 250);
            }
            Decision::Allowed => panic!("expected pace"),
        }
        assert_eq!(limiter.acquire(&get, 1_100), Decision::Allowed);
        assert_eq!(limiter.acquire(&send, 1_350), Decision::Allowed);
    }

    #[test]
    fn expired_window_allows_one_then_waits_for_headers() {
        let mut limiter = RateLimiter::new();
        let route = route_key("GET", "/channels/{id}/messages", "7");
        limiter.observe_headers(&route, &headers("b", 0, 100), 0);
        assert_eq!(limiter.reserve(&route, 100), Decision::Allowed);
        assert!(matches!(limiter.acquire(&route, 100), Decision::Wait { .. }));
    }

    #[test]
    fn typing_pacer_waits_eight_seconds() {
        assert!(should_send_typing(None, 0));
        assert!(!should_send_typing(Some(1_000), 5_000));
        assert!(should_send_typing(Some(1_000), 9_000));
    }
}
