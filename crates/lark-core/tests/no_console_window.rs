//! Release builds must not allocate a console, and every child process must
//! pass CREATE_NO_WINDOW on Windows.

#[test]
fn desktop_main_uses_the_windows_subsystem_outside_debug() {
    let main = include_str!("../../../src-tauri/src/main.rs");
    assert!(main.starts_with(
        "#![cfg_attr(not(debug_assertions), windows_subsystem = \"windows\")]"
    ));
}

#[test]
fn create_no_window_is_the_documented_flag() {
    assert_eq!(lark_core::CREATE_NO_WINDOW, 0x0800_0000);
    assert_eq!(lark_core::creation_flags(0x0000_4000), 0x0800_4000);
}

#[test]
fn every_child_process_hides_its_console() {
    let rooted = [
        ("src-tauri/src/lib.rs", include_str!("../../../src-tauri/src/lib.rs")),
        ("src-tauri/src/browser_login.rs", include_str!("../../../src-tauri/src/browser_login.rs")),
        ("src-tauri/src/clip_rec.rs", include_str!("../../../src-tauri/src/clip_rec.rs")),
        ("crates/lark-core/src/clip_encode.rs", include_str!("../src/clip_encode.rs")),
        ("crates/lark-core/src/clip_fit.rs", include_str!("../src/clip_fit.rs")),
        ("crates/lark-core/src/hardware.rs", include_str!("../src/hardware.rs")),
    ];
    for (name, source) in rooted {
        let mut command = false;
        for line in source.lines() {
            if line.contains("Command::new") {
                command = true;
                continue;
            }
            if command {
                assert!(
                    line.contains("hide_console") || line.contains("creation_flags"),
                    "{name} starts a process without CREATE_NO_WINDOW:\n{line}"
                );
                command = false;
            }
        }
        assert!(!command, "{name} ends on Command::new");
    }
}
