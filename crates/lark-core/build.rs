fn main() {
    println!("cargo:rerun-if-changed=src/h264_enc.c");
    println!("cargo:rerun-if-changed=vendor/minih264/minih264e.h");
    let target = std::env::var("TARGET").unwrap_or_default();
    let host = std::env::var("HOST").unwrap_or_default();
    // Cross-checking the Windows or macOS shells from another host only needs the
    // Rust type checker. The C encoder is built for the host that actually links.
    if !target.is_empty() && target != host {
        return;
    }
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let mut build = cc::Build::new();
    build
        .file("src/h264_enc.c")
        .include("vendor/minih264")
        .define("NDEBUG", None)
        .std("c11")
        .warnings(false)
        .opt_level(if profile == "release" { 2 } else { 1 });
    build.compile("larkh264");
}
