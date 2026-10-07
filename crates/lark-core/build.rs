fn main() {
    println!("cargo:rerun-if-changed=src/h264_enc.c");
    println!("cargo:rerun-if-changed=vendor/minih264/minih264e.h");
    let target = std::env::var("TARGET").unwrap_or_default();
    let host = std::env::var("HOST").unwrap_or_default();
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    // Cross-checking a Windows or macOS shell from Linux only needs the Rust
    // type checker. The macOS universal build still cross-compiles the Intel
    // slice on Apple Silicon, and that slice links this encoder.
    let macos_slice = host.ends_with("-apple-darwin") && target_os == "macos";
    if !target.is_empty() && target != host && !macos_slice {
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
