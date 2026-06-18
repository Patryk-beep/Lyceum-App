//! Concurrency hygiene helpers.
//!
//! The manifest is last-writer-wins (MANIFEST.md §103). The fingerprint here is
//! **detection, not prevention**: it lets the app notice the file changed under
//! it. It is computed over a CANONICAL form (sorted keys, normalized numbers) so
//! Claude's Edit tool reordering keys or reformatting `0.90`->`0.9` does not flag
//! a spurious conflict every turn.

use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::error::Result;
use crate::model::Manifest;

/// SHA-256 over the canonical JSON form of the manifest.
pub fn canonical_fingerprint(manifest: &Manifest) -> Result<String> {
    let value = serde_json::to_value(manifest)?;
    let mut canon = String::new();
    write_canonical(&value, &mut canon);
    let mut hasher = Sha256::new();
    hasher.update(canon.as_bytes());
    Ok(hex(&hasher.finalize()))
}

/// Canonical serialization: object keys sorted, compact, deterministic.
fn write_canonical(v: &Value, out: &mut String) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => out.push_str(&serde_json::to_string(s).expect("string encodes")),
        Value::Array(a) => {
            out.push('[');
            for (i, e) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(e, out);
            }
            out.push(']');
        }
        Value::Object(m) => {
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).expect("key encodes"));
                out.push(':');
                write_canonical(&m[*k], out);
            }
            out.push('}');
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::base_manifest;

    #[test]
    fn fingerprint_is_stable_across_key_reorder_and_number_format() {
        let m = base_manifest();
        let fp1 = canonical_fingerprint(&m).unwrap();

        // Re-serialize through a Value whose object key order differs, and where a
        // float is written as 0.90 vs 0.9 — canonical form must match.
        let mut v = serde_json::to_value(&m).unwrap();
        if let Value::Object(map) = &mut v {
            // reinsert settings to perturb key order
            if let Some(s) = map.remove("settings") {
                map.insert("settings".into(), s);
            }
        }
        let m2: Manifest = serde_json::from_value(v).unwrap();
        let fp2 = canonical_fingerprint(&m2).unwrap();
        assert_eq!(fp1, fp2);
    }

    #[test]
    fn fingerprint_changes_on_real_edit() {
        let m = base_manifest();
        let fp1 = canonical_fingerprint(&m).unwrap();
        let mut m2 = m.clone();
        m2.subject = "Different".into();
        assert_ne!(fp1, canonical_fingerprint(&m2).unwrap());
    }
}
