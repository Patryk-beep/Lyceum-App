//! Emit the canonical golden manifest fixture to stdout.
//!
//!   cargo run -p lyceum-core --features fixtures --example gen_golden
//!
//! Run with output redirected to `app/tests/fixtures/manifests/golden.json` to
//! regenerate the fixture that both the Rust parity test and the frontend consume.

fn main() {
    let manifest = lyceum_core::test_support::golden_manifest();
    let json = serde_json::to_string_pretty(&manifest).expect("serialize golden manifest");
    println!("{json}");
}
