//! The Windows hardware and login paths must not spawn a command interpreter.

#[test]
fn windows_host_sources_do_not_spawn_a_shell() {
    let sources = [
        include_str!("../src/hardware.rs"),
        include_str!("../src/hardware_win.rs"),
        include_str!("../src/host_win.rs"),
    ];
    for source in sources {
        assert!(!source.contains("powershell.exe"));
        assert!(!source.contains("ExecutionPolicy"));
        assert!(!source.contains("Get-CimInstance"));
        assert!(!source.contains("Add-Type"));
        assert!(!source.contains("0x0800_0000"));
        assert!(!source.contains("CREATE_NO_WINDOW"));
        assert!(!source.contains("Command::new(\"reg\")"));
        assert!(!source.contains("Command::new(\"explorer\")"));
        assert!(!source.contains("wmic"));
        assert!(!source.contains("OpenProcess"));
        assert!(!source.contains("WriteProcessMemory"));
    }
}
