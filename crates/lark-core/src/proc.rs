//! Child processes must not open a console window on Windows.
//!
//! ffmpeg and other console-subsystem tools allocate a cmd window unless
//! the parent passes CREATE_NO_WINDOW (0x08000000).

use std::process::Command;

/// `CREATE_NO_WINDOW`. Combined with any other process-creation flags.
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Set `CREATE_NO_WINDOW` on `command`. Other flags already stored on the
/// command are replaced, so pass priority-class bits through [`creation_flags`].
pub fn hide_console(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = command;
    }
}

/// `CREATE_NO_WINDOW` OR'd with `extra` (for example a priority class).
pub fn creation_flags(extra: u32) -> u32 {
    CREATE_NO_WINDOW | extra
}
